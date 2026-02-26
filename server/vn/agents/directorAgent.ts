import { generateText } from 'ai';
import { getDirectorModel, getDirectorModelInfo } from '../../lib/modelFactory.js';
import { tracedGenerateText } from '../../debug/traceAI.js';
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
   - If uncertain actions occur, remind Storyteller to use dice-roll frames — never allow narrated stat bonuses like "洞察+3" or "Perception +3 helped them notice..."

2. **stateMutations** (object): State changes to apply:
   - progressionDelta: number — Award +1 ONLY when the player makes a meaningful CHOICE or ACTION: choosing a path, making a decision, succeeding/failing a skill check, completing an encounter, discovering a key clue, or having a pivotal NPC interaction. Progression = player agency. Do NOT award progression for turns where the player just said "[continue]" — that means they haven't made a decision yet. Currently at ${currentState.globalProgression}/${currentAct.globalProgression?.requiredValue ?? '?'}. PACING RULE: Aim for 1 progression per 2-3 player decisions. If the Storyteller isn't offering choices, include in your directorBrief: "Present the player with a meaningful choice this turn."
   - doomClockDelta: number (0 normally, +1 if player wasted time or made noise)
   - characterUpdates: array of { characterId, disposition?, newLocationId? }
   - setComplication: { description, maxTurns } or null to clear
   - exhaustEncounters: string[] of encounter IDs completed this turn
   - injectEncounters: array of { locationId, encounter } to add new encounters
   - directorNotes: object — your scratchpad for next evaluation

3. **suggestedEncounterId** (string|null): Which encounter from the available pool to suggest. ALWAYS suggest one if any are available — don't let encounters sit unused.

PACING IMPERATIVES:
- Every turn should feel like progress. Even "failed" actions should unlock new information or shift NPC attitudes.
- If the player has been stalling (sending "[continue]" without making choices), DO NOT award progression. Instead, CREATE EVENTS to force a decision: inject a complication, have an NPC burst in with urgent news, trigger a threat that demands immediate action. The player MUST be pushed to make a choice.
- If 3+ turns pass without progression, use setComplication or injectEncounters to create dramatic pressure. Example: an enemy arrives, a timer starts, a secret is revealed that demands a response.
- The Storyteller MUST present player choices every turn. If they aren't, include in your directorBrief: "IMPORTANT: End this turn with a choice frame — give the player 2-3 options."
- Suggest TRAVEL to a new location when the current location's key encounters are exhausted.
- Reference the player's PAST FLAGS and choices in your brief — callbacks to earlier decisions make the story feel responsive.

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

  const { provider, modelId } = getDirectorModelInfo();

  // Retry with increasing timeouts: 60s → 90s → 120s (DeepSeek is fast; Opus needed 120s+)
  const DIRECTOR_TIMEOUTS = [60_000, 90_000, 120_000];
  let text: string = '';
  let lastError: unknown;

  for (let attempt = 0; attempt < DIRECTOR_TIMEOUTS.length; attempt++) {
    try {
      const directorTimeout = AbortSignal.timeout(DIRECTOR_TIMEOUTS[attempt]);
      if (attempt > 0) {
        console.log(`[Director] Retry attempt ${attempt + 1}/${DIRECTOR_TIMEOUTS.length} (timeout: ${DIRECTOR_TIMEOUTS[attempt] / 1000}s)`);
      }
      const result = await tracedGenerateText({
        model: getDirectorModel(),
        prompt,
        abortSignal: directorTimeout,
      }, {
        sessionId: input.currentState.sessionId,
        pipeline: 'vn-director',
        agentId: 'director-agent',
        modelProvider: provider,
        modelId,
        source: 'runDirector',
      });
      text = result.text;
      lastError = undefined;
      break; // Success — exit retry loop
    } catch (err) {
      lastError = err;
      const isTimeout = err instanceof DOMException && err.name === 'TimeoutError';
      if (!isTimeout || attempt === DIRECTOR_TIMEOUTS.length - 1) {
        throw err; // Non-timeout error or final attempt — propagate
      }
      console.warn(`[Director] Timeout after ${DIRECTOR_TIMEOUTS[attempt] / 1000}s on attempt ${attempt + 1}, retrying...`);
    }
  }

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
