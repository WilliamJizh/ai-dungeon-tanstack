import { generateText } from 'ai';
import { getModel } from '../../lib/modelFactory.js';
import type { VNPackage, Act, Location, PlotState, Encounter, CharacterState, ActiveComplication, OpposingForceState } from '../types/vnTypes.js';

// ─── Direction Pack: the Director's output consumed by plotStateTool ─────────

export interface DirectionPack {
  // Location context
  currentLocationId: string;
  currentLocationTitle: string;
  ambientDetail: string | null;

  // Director's free-form guidance for the Storyteller
  directorBrief: string;
  activeComplication: string | null;

  // Characters present (Director-computed: static + dynamic overlay)
  charactersPresent: Array<{
    id: string;
    name: string;
    assetKey: string;
    disposition: string;
  }>;

  // Encounter guidance
  currentEncounter: {
    id: string;
    title: string;
    description: string;
    type: string;
    pacing: { expectedFrames: number; focus: string };
    potentialFlags: string[];
  } | null;
  availableEncounters: Array<{ id: string; title: string; priority: string }>;

  // Progression state
  globalProgression: { current: number; required: number; label: string };
  opposingForce: { current: number; required: number; label: string };

  // State mutations the Director wants to apply
  stateMutations: DirectorStateMutations;
}

export interface DirectorStateMutations {
  progressionDelta?: number;
  doomClockDelta?: number;
  characterUpdates?: Array<{
    characterId: string;
    newLocationId?: string;
    disposition?: string;
  }>;
  setComplication?: { description: string; maxTurns: number } | null;
  exhaustEncounters?: string[];
  injectEncounters?: Array<{ locationId: string; encounter: Encounter }>;
  directorNotes?: Record<string, unknown>;
}

// ─── Director system prompt builder ──────────────────────────────────────────

function buildDirectorPrompt(input: {
  vnPackage: VNPackage;
  currentState: PlotState;
  playerQuery: string;
  storySummary: string;
  currentAct: Act;
  currentLocation: Location;
  availableEncounters: Encounter[];
  charactersAtLocation: Array<{ id: string; name: string; disposition: string }>;
}): string {
  const { vnPackage, currentState, playerQuery, storySummary, currentAct, currentLocation, availableEncounters, charactersAtLocation } = input;

  const encounterList = availableEncounters.map(e =>
    `  - [${e.priority}] "${e.title}" (${e.type}): ${e.description}${e.givesProgression ? ` [+${e.givesProgression} progression]` : ''}${e.potentialFlags?.length ? ` [flags: ${e.potentialFlags.join(', ')}]` : ''}`
  ).join('\n');

  const characterList = charactersAtLocation.map(c =>
    `  - ${c.name}: ${c.disposition}`
  ).join('\n');

  const flagsList = Object.entries(currentState.flags)
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join('\n') || '  (none)';

  const exhaustedList = currentState.exhaustedEncounters.length > 0
    ? currentState.exhaustedEncounters.join(', ')
    : '(none)';

  const escalationEvents = currentAct.opposingForce?.escalationEvents
    ?.map(e => `  - At ${e.threshold}: ${e.description}`)
    .join('\n') || '  (none defined)';

  const inevitableEvents = currentAct.inevitableEvents
    ?.map(e => `  - "${e.title}" [${e.forcesClimax ? 'CLIMAX' : 'event'}]: ${e.triggerCondition}`)
    .join('\n') || '  (none)';

  const directorNotes = Object.keys(currentState.directorNotes).length > 0
    ? JSON.stringify(currentState.directorNotes, null, 2)
    : '(fresh session)';

  return `You are the DIRECTOR of the visual novel "${vnPackage.title}".
LANGUAGE: ${vnPackage.language ?? 'en'} — ALL output text must be in this language.

YOUR ROLE: You are NOT the narrator. You are the invisible hand that makes the story FUN, TENSE, and SURPRISING. You evaluate what just happened, update the world state, and write instructions for the Storyteller (who performs the narration). Think like a film director giving notes to an actor between takes.

═══ STORY BACKBONE ═══
Premise: ${vnPackage.plot.premise}
Themes: ${vnPackage.plot.themes.join(', ')}
Setting: ${vnPackage.plot.globalContext.setting}
Tone: ${vnPackage.plot.globalContext.tone}
Hidden Truths: ${vnPackage.plot.globalContext.overarchingTruths.join(' | ')}

═══ CURRENT ACT ═══
Act: "${currentAct.title}" — Objective: ${currentAct.objective}
Scenario Context (hidden truth): ${currentAct.scenarioContext}
Narrative Guidelines: ${currentAct.narrativeGuidelines}

Progression: ${currentState.globalProgression}/${currentAct.globalProgression?.requiredValue ?? '?'} (${currentAct.globalProgression?.trackerLabel ?? 'Progress'})
Opposing Force: ${currentState.opposingForce.currentTick}/${currentAct.opposingForce?.requiredValue ?? '?'} (${currentAct.opposingForce?.trackerLabel ?? 'Threat Level'})
Escalation Events:
${escalationEvents}
Inevitable Events:
${inevitableEvents}

═══ CURRENT LOCATION ═══
Location: "${currentLocation.title}" (${currentLocation.id})
Ambient: ${currentLocation.ambientDetail ?? 'No detail provided'}
Connections: ${currentLocation.connections.join(', ')}

═══ CHARACTERS PRESENT ═══
${characterList || '  (no characters present)'}

═══ AVAILABLE ENCOUNTERS ═══
${encounterList || '  (all encounters exhausted at this location)'}

Exhausted encounters: ${exhaustedList}

═══ WORLD STATE ═══
Turn: ${currentState.turnCount}
Active Flags:
${flagsList}

Active Complication: ${currentState.activeComplication?.description ?? '(none)'}
${currentState.activeComplication ? `  (injected at turn ${currentState.activeComplication.injectedAtTurn}, expires after ${currentState.activeComplication.maxTurns} turns)` : ''}

═══ STORY SO FAR ═══
${storySummary || '(Beginning of story)'}

═══ YOUR PREVIOUS NOTES ═══
${directorNotes}

═══ WHAT JUST HAPPENED ═══
Player's action: "${playerQuery}"

═══ YOUR TASK ═══
Evaluate the player's action in context. Then produce a JSON response with:

1. **directorBrief** (string): Free-form instructions for the Storyteller. Include:
   - Which encounter to focus on (or improvise if none fit)
   - Character behavior notes (how NPCs react based on their dispositions)
   - Pacing guidance (how many frames, what gear/tempo)
   - Tension level and emotional tone
   - Any secrets to hint at or withhold
   - Whether to inject complication pressure

2. **stateMutations** (object): State changes to apply:
   - progressionDelta: number — IMPORTANT: Award +1 whenever the player completes an encounter that has [+N progression], solves a puzzle, obtains a key item, or reaches a major story milestone. Do NOT be conservative — if the player's action clearly advances the plot, award progression. The story cannot move to the next act until progression reaches the required value. Currently at ${currentState.globalProgression}/${currentAct.globalProgression?.requiredValue ?? '?'}.
   - doomClockDelta: number (0 normally, +1 if player wasted time or made noise)
   - characterUpdates: array of { characterId, disposition?, newLocationId? }
   - setComplication: { description, maxTurns } or null to clear
   - exhaustEncounters: string[] of encounter IDs completed this turn
   - injectEncounters: array of { locationId, encounter } to add new encounters
   - directorNotes: object — your scratchpad for next evaluation

3. **suggestedEncounterId** (string|null): Which encounter from the available pool to suggest.

Respond with ONLY valid JSON. No markdown fences, no explanation outside the JSON.`;
}

// ─── Director execution ──────────────────────────────────────────────────────

export async function runDirector(input: {
  vnPackage: VNPackage;
  currentState: PlotState;
  playerQuery: string;
  storySummary: string;
  currentAct: Act;
  currentLocation: Location;
  availableEncounters: Encounter[];
  charactersAtLocation: Array<{ id: string; name: string; assetKey: string; disposition: string }>;
}): Promise<{ directorBrief: string; stateMutations: DirectorStateMutations; suggestedEncounterId: string | null }> {
  const prompt = buildDirectorPrompt({
    ...input,
    charactersAtLocation: input.charactersAtLocation.map(c => ({
      id: c.id,
      name: c.name,
      disposition: c.disposition,
    })),
  });

  const { text } = await generateText({
    model: getModel('storyteller'),
    prompt,
  });

  // Parse the Director's JSON response leniently
  try {
    // Strip markdown fences if the model wraps in ```json ... ```
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(cleaned);

    return {
      directorBrief: parsed.directorBrief ?? 'Continue the current scene naturally.',
      stateMutations: {
        progressionDelta: parsed.stateMutations?.progressionDelta ?? 0,
        doomClockDelta: parsed.stateMutations?.doomClockDelta ?? 0,
        characterUpdates: parsed.stateMutations?.characterUpdates ?? [],
        setComplication: parsed.stateMutations?.setComplication ?? undefined,
        exhaustEncounters: parsed.stateMutations?.exhaustEncounters ?? [],
        injectEncounters: parsed.stateMutations?.injectEncounters ?? [],
        directorNotes: parsed.stateMutations?.directorNotes ?? {},
      },
      suggestedEncounterId: parsed.suggestedEncounterId ?? null,
    };
  } catch (err) {
    console.error('[Director] Failed to parse Director response, using fallback:', err);
    console.error('[Director] Raw response:', text.substring(0, 500));

    // Graceful degradation: return a minimal direction pack
    return {
      directorBrief: 'Continue the current scene naturally. Follow the player\'s lead.',
      stateMutations: {},
      suggestedEncounterId: null,
    };
  }
}
