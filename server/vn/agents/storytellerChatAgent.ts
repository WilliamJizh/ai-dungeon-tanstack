import { ToolLoopAgent, InferAgentUIMessage, hasToolCall, tool, stepCountIs } from 'ai';
import type { StopCondition } from 'ai';
import { FRAME_REGISTRY, FRAME_REGISTRY_MAP, getExtendedFrameTypeNames } from '../frameRegistry.js';
import type { FrameType } from '../types/vnFrame.js';
import { z } from 'zod';
import { frameBuilderTool, FrameInputSchema } from '../tools/frameBuilderTool.js';
import { plotStateTool } from '../tools/plotStateTool.js';
import { requestTravelTool } from '../tools/requestTravelTool.js';
// yieldToPlayer removed — agent loop stops on choice/dice-roll frames directly
import { playerStatsTool } from '../tools/playerStatsTool.js';
import { initCombatTool } from '../tools/initCombatTool.js';
import { combatEventTool } from '../tools/combatEventTool.js';
import { recordPlayerActionTool } from '../tools/recordPlayerActionTool.js';
import type { VNPackage } from '../types/vnTypes.js';
import type { VNFrame } from '../types/vnFrame.js';

import { getModel } from '../../lib/modelFactory.js';

// ─── Session-bound tool wrappers ─────────────────────────────────────────────
// The model often omits sessionId from tool calls. Binding it via closures
// removes the parameter entirely so the model cannot get it wrong.

function bindSessionTools(sessionId: string) {
  // Per-turn call tracking: prevents model from spamming plotStateTool
  // Uses a generation counter incremented by resetPlotCache() before each turn.
  let cachedPlotResult: any = null;
  let cacheGeneration = 0;
  let lastCacheGeneration = -1;

  const resetPlotCache = () => { cacheGeneration++; };

  /**
   * Pre-fetch plotState BEFORE the agent stream starts.
   * This guarantees Director guidance every turn even when the model ignores toolChoice.
   * Sets the internal cache so if the model also calls plotStateTool, it gets the cached result.
   */
  const preFetchPlotState = async (playerQuery: string): Promise<any> => {
    // Reset cache for new turn
    cacheGeneration++;
    cachedPlotResult = null;
    lastCacheGeneration = cacheGeneration;

    try {
      const result = await (plotStateTool as any).execute({ sessionId, playerQuery });
      cachedPlotResult = result;
      return result;
    } catch (err: any) {
      console.error(`[preFetchPlotState] Error:`, err?.message);
      return { error: String(err?.message ?? 'plotStateTool failed'), directorBrief: 'Continue the scene naturally.' };
    }
  };

  return {
    resetPlotCache,
    preFetchPlotState,
    recordPlayerActionTool: tool({
      description: recordPlayerActionTool.description!,
      inputSchema: z.object({
        flagName: z.string().describe('A semantic key representing the state change (e.g., "barricaded_study_door", "found_turners_revolver", "angered_npm_townsfolk")'),
        value: z.union([z.boolean(), z.string(), z.number()]).describe('The value of the flag. Usually a boolean, but can hold string/number data if needed.')
      }),
      execute: async (input: any) =>
        (recordPlayerActionTool as any).execute({ ...input, sessionId }),
    }),
    plotStateTool: tool({
      description: plotStateTool.description!,
      inputSchema: z.object({
        locationId: z.string().optional().describe('Optional override — uses DB currentLocationId if omitted'),
      }),
      execute: async (input: any, options: any) => {
        // Reset cache on new turn (generation counter incremented externally)
        if (cacheGeneration !== lastCacheGeneration) {
          cachedPlotResult = null;
          lastCacheGeneration = cacheGeneration;
        }

        // After the first call per turn, return cached result with a nudge
        if (cachedPlotResult) {
          return { _cached: true, _hint: 'Context already loaded this turn. Produce frames with frameBuilderTool, or call requestTravelTool to move.' };
        }

        // Extract playerQuery from the last user message in the conversation
        const messages: any[] = options?.messages ?? [];
        const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user');
        const playerQuery = typeof lastUserMsg?.content === 'string'
          ? lastUserMsg.content
          : Array.isArray(lastUserMsg?.content)
            ? lastUserMsg.content.map((c: any) => c.text ?? '').join(' ')
            : '';

        try {
          const result = await (plotStateTool as any).execute({ ...input, sessionId, playerQuery });
          cachedPlotResult = result;
          return result;
        } catch (execErr: any) {
          console.error(`[plotStateTool] Execute error:`, execErr?.message);
          return { error: String(execErr?.message ?? 'plotStateTool failed'), directorBrief: 'Continue the scene naturally.' };
        }
      },
    }),
    playerStatsTool: tool({
      description: playerStatsTool.description!,
      inputSchema: z.object({
        action: z.enum(['read', 'update', 'addItem', 'removeItem']),
        updates: z.object({
          hp: z.number().optional(),
          maxHp: z.number().optional(),
          level: z.number().optional(),
          skills: z.array(z.string()).optional(),
          statusEffects: z.array(z.object({
            id: z.string(), name: z.string(),
            type: z.enum(['buff', 'debuff', 'neutral']),
            description: z.string(),
            icon: z.string().optional(),
            turnsRemaining: z.number().optional(),
          })).optional(),
        }).optional(),
        item: z.object({
          id: z.string(), name: z.string(), description: z.string(),
          icon: z.string(), quantity: z.number(), equipped: z.boolean().optional(), effect: z.string().optional(),
        }).optional(),
        itemId: z.string().optional(),
      }),
      execute: async (input: any) =>
        (playerStatsTool as any).execute({ ...input, sessionId }),
    }),
    requestTravelTool: tool({
      description: requestTravelTool.description!,
      inputSchema: z.object({
        targetLocationId: z.string().describe('The ID of the location to travel to (must be in availableConnections)'),
      }),
      execute: async (input: any) =>
        (requestTravelTool as any).execute({ ...input, sessionId }),
    }),
    initCombatTool: tool({
      description: initCombatTool.description!,
      inputSchema: z.object({
        setting: z.string().describe('Scene setting description for the map image'),
        artStyle: z.string().optional().describe('Art style hint'),
        gridCols: z.number().default(12),
        gridRows: z.number().default(8),
        tokens: z.array(z.object({
          id: z.string(),
          type: z.enum(['player', 'enemy', 'ally', 'objective', 'npc']),
          label: z.string(),
          icon: z.string(),
          col: z.number(),
          row: z.number(),
          hp: z.number(),
          maxHp: z.number(),
          attack: z.number().optional(),
          defense: z.number().optional(),
          moveRange: z.number().optional(),
          attackRange: z.number().optional(),
          aiPattern: z.enum(['aggressive', 'defensive', 'patrol', 'guard-objective']).optional(),
        })),
        terrain: z.array(z.object({
          col: z.number(),
          row: z.number(),
          type: z.enum(['blocked', 'difficult', 'hazard', 'cover']),
        })).optional().default([]),
      }),
      execute: async (input: any) =>
        (initCombatTool as any).execute({ ...input, sessionId }),
    }),
    combatEventTool: tool({
      description: combatEventTool.description!,
      inputSchema: z.object({
        events: z.array(z.discriminatedUnion('type', [
          z.object({ type: z.literal('modify_hp'), tokenId: z.string(), delta: z.number() }),
          z.object({
            type: z.literal('add_token'),
            token: z.object({
              id: z.string(),
              type: z.enum(['player', 'enemy', 'ally', 'objective', 'npc']),
              label: z.string(), icon: z.string(),
              col: z.number(), row: z.number(),
              hp: z.number(), maxHp: z.number(),
              attack: z.number().optional(), defense: z.number().optional(),
              moveRange: z.number().optional(), attackRange: z.number().optional(),
            }),
          }),
          z.object({ type: z.literal('remove_token'), tokenId: z.string() }),
          z.object({ type: z.literal('add_terrain'), col: z.number(), row: z.number(), terrainType: z.enum(['blocked', 'difficult', 'hazard', 'cover']) }),
          z.object({ type: z.literal('log_message'), message: z.string() }),
          z.object({ type: z.literal('end_combat'), result: z.enum(['victory', 'defeat', 'escape']), message: z.string() }),
        ])),
      }),
      execute: async (input: any) =>
        (combatEventTool as any).execute({ ...input, sessionId }),
    }),
  };
}

// ─── Frame guide tool: on-demand schema + workflow for extended frame types ──

const frameGuideTool = tool({
  description: 'Get schema and usage instructions for an extended frame type BEFORE using it with frameBuilderTool. Call this whenever you want to use a non-core frame type.',
  inputSchema: z.object({
    frameType: z.string().describe('The frame type to look up (e.g. "inventory", "tactical-map", "flashback", "investigation")'),
  }),
  execute: async ({ frameType }) => {
    const entry = FRAME_REGISTRY_MAP.get(frameType as FrameType);
    if (!entry) {
      const available = getExtendedFrameTypeNames().join(', ');
      return { error: `Unknown frame type: "${frameType}". Available extended types: ${available}` };
    }
    if (entry.core) {
      return { hint: `"${frameType}" is a core type — you already have its instructions. Use frameBuilderTool directly.` };
    }
    return {
      type: entry.type,
      summary: entry.agentSummary,
      ...(entry.agentWorkflow ? { workflow: entry.agentWorkflow } : {}),
      ...(entry.dataField ? { dataField: entry.dataField } : {}),
    };
  },
});

function buildCharacterAssetMap(vnPackage: VNPackage): Map<string, string> {
  const charAssetKeys = Object.keys(vnPackage.assets.characters);
  const map = new Map<string, string>();
  for (const [i, c] of vnPackage.characters.entries()) {
    const exactMatch = charAssetKeys.find(k => k === c.id);
    const positionalKey = charAssetKeys[i];
    map.set(c.id, exactMatch ?? positionalKey ?? c.id);
  }
  return map;
}

export function buildDMSystemPrompt(vnPackage: VNPackage, sessionId: string, currentActId?: string | null): string {
  const charAssetMap = buildCharacterAssetMap(vnPackage);

  const charList = vnPackage.characters
    .map(c => {
      const assetKey = charAssetMap.get(c.id) ?? c.id;
      return `- ${c.name} (${c.role}): ${c.description} [characterAsset: "${assetKey}"]`;
    })
    .join('\n');

  const bgKeys = Object.keys(vnPackage.assets.backgrounds).join(', ');
  const charKeys = [...charAssetMap.values()].join(', ');
  const musicKeys = Object.keys(vnPackage.assets.music).join(', ');

  const charKeyLines = vnPackage.characters
    .map(c => {
      const assetKey = charAssetMap.get(c.id) ?? c.id;
      return `  • "${assetKey}" → ${c.name}`;
    })
    .join('\n');

  const currentAct = currentActId ? vnPackage.plot.acts.find(a => a.id === currentActId) : null;
  const scenarioContextText = currentAct
    ? `\nACT CONTEXT (hidden from player):\nScenario: ${currentAct.scenarioContext}\nGuidelines: ${currentAct.narrativeGuidelines}`
    : '';

  return `You are a visual novel PERFORMER for "${vnPackage.title}". A Director agent handles story decisions, pacing, and encounters. Your job: render the Director's guidance into cinematic frames.
LANGUAGE: ${vnPackage.language ?? 'en'} — ALL text MUST be in this language. No mixing.
SESSION: sessionId="${sessionId}"

SETTING:
World: ${vnPackage.plot.globalContext.setting}
Tone: ${vnPackage.plot.globalContext.tone}
Hidden Truths:
${vnPackage.plot.globalContext.overarchingTruths.map(t => `- ${t}`).join('\n')}

PREMISE: ${vnPackage.plot.premise}
ENDINGS: ${vnPackage.plot.possibleEndings?.join(' | ') || 'Determine ending naturally'}${scenarioContextText}

ART STYLE: ${vnPackage.artStyle}

MOTIFS:
${(vnPackage.plot.globalMaterials || []).map(m => `- ${m}`).join('\n')}

CHARACTERS:
${charList}

ASSETS:
- Backgrounds: ${bgKeys}
- Sprites:
${charKeyLines}
- Music: ${musicKeys}

PROSE VOICE:
Write subjective, tension-driven visual novel prose — not game text.
- Subjectivity as Action: Internal state IS the action. React to pain, anxiety, exhaustion BEFORE external events. The plot happens to a body in a space.
- Sensory Anchoring: Textures, temperatures, sounds, smells, weight. Never narrate absence.
- Tension Deflation: Interrupt high stakes with extreme banality (phone ringing during revelations, obsessing over trivia in danger). Contrast amplifies drama.
- Mundane as Symbol: Ordinary objects carry dramatic weight as sensory anchors across arcs.
- Micro-Pacing: Each narrations[] entry should be 1-3 FULL SENTENCES — a paragraph of thought or description, not a single word or fragment. In crisis moments you may shorten to one terse sentence, but never put one word per entry. BAD: ["他站起来。", "走向门口。", "推开门。"] GOOD: ["他站起来，走向门口，推开了那扇沉重的铁门。门轴发出刺耳的尖叫。"]
- Internal Monologue: {narrator:"..."} entries between conversation[] lines for protagonist's reactions, frustrations, misinterpretations.
- Dialogue Dissonance: Characters talk past each other, non-sequiturs, trivia during serious moments. No clean exposition.
- BANNED: "a sense of", "palpable tension", "couldn't help but", "sent shivers down" — use specific physical detail.

PLAYBOOK:
1. Call plotStateTool() FIRST. Read directorBrief — it's your scene direction with pacing, encounter, character behavior, and tone guidance. Follow it. If absent, fall back to currentBeatDescription.
2. If activeComplication is present, address it immediately in narration.
3. charactersPresent includes dispositions — use these for NPC behavior, dialogue tone, body language.
4. ALWAYS log meaningful player actions as flags via recordPlayerActionTool: discoveries, NPC interactions, items examined, choices made. Check currentEncounter.potentialFlags for suggested keys. Flags drive the Director's decisions and create callbacks later — unlabeled actions are INVISIBLE to the story engine.
5. RENDER CINEMATICALLY — think like a film editor assembling shots:
   - Open scenes with atmosphere (full-screen + narrations[]) before dialogue.
   - Produce as many frames as the scene needs. PREFER FEWER, LONGER frames over many short ones, but do NOT cut a scene short — keep producing frames until you reach a natural interaction point (choice or dice-roll). A turn may have 3 frames or 12.
   - Pack density into conversation[] and narrations[] arrays — each entry = one player click.
     A single dialogue frame should carry 6-15 conversation lines covering an entire exchange, not 2-3 lines.
     A single full-screen frame should carry 3-6 narrations[] beats, not just one.
     Pacing density: dialogue_and_worldbuilding → 15-20 clicks/frame; standard → ~10; tension_and_action → 5-8.
   - NO CONSECUTIVE SAME-TYPE FRAMES: NEVER emit two dialogue frames in a row or two full-screen frames in a row. If you need more dialogue, add more conversation[] lines to the SAME frame. If you need more narration, add more narrations[] entries to the SAME frame. Only create a NEW frame when the frame TYPE changes (e.g. full-screen → dialogue, dialogue → choice).
   - Switch frame TYPE only when the visual composition changes (new speaker layout, location shift, action scene → dialogue).
   - Interleave {narrator:"..."} thoughts between dialogue for subjective depth.
   - conversation[] NARRATOR RULE — the renderer draws these DIFFERENTLY:
     conversation[] supports two entry shapes:
     { speaker:"Name", text:"..." }  → rendered as a SPEECH BUBBLE. Words spoken aloud.
     { narrator:"..." }              → rendered as a NARRATOR TEXT BOX. Actions, thoughts, stage direction.
     SIMPLE TEST: "Is the character saying this out loud?" YES → {speaker,text}. NO → {narrator:"..."}.
     ✗ WRONG: { speaker:"悠真", text:"他站起来，走向门口。" } ← renders as speech bubble, but nobody SAID this!
     ✗ WRONG: { speaker:"晴", text:"她举起相机，对准了收音机。" } ← action, not speech!
     ✓ RIGHT: { narrator:"悠真站起来，走向门口。" } ← narrator box, correct
     ✓ RIGHT: { narrator:"晴举起相机，对准了收音机。" } ← narrator box, correct
     ✓ RIGHT: { speaker:"悠真", text:"走吧，没时间了。" } ← speech bubble, he SAYS this aloud
     ✓ RIGHT: { speaker:"晴", text:"等等我！" } ← speech bubble, she SAYS this aloud
     Any sentence describing what someone DOES, THINKS, or FEELS → { narrator:"..." }. Only words SPOKEN ALOUD → { speaker, text }.
     NEVER use isNarrator — that field is removed. ONLY use { narrator:"..." } or { speaker, text }.
   - Reveal at most ONE finding per turn, through interaction not exposition.
   - Honor free-text actions even when off-script. "Fail Forward" — introduce a complication, never an invisible wall.
6. TURN ENDINGS — the agent loop stops automatically on these:
   - choice frame: 2-3 impulse-phrased options + showFreeTextInput:true.
   - dice-roll frame: emitting this STOPS the loop. See RULINGS below.
   - CRITICAL: choice frames and requestTravelTool are TERMINAL — no tool calls after them.
   - ACT TRANSITIONS: When directorBrief mentions "ACT TRANSITION", narrate a climactic conclusion, then a transition frame + choice frame. The system advances the act automatically.
   - PLAYER AGENCY IS MANDATORY: Every turn MUST end with either a choice frame or a dice-roll frame. The player drives the story through their decisions — without choices, the story cannot progress. Never produce a turn of only narration/dialogue frames with no interaction.
7. Travel: requestTravelTool(targetLocationId) from availableConnections. Terminal.
8. Extended frame types: call frameGuideTool(frameType) BEFORE using any non-core type to get schema and instructions.

RULINGS (PbtA 2d6 — the game's core resolution mechanic — USE THIS):
When a player attempts ANY action with uncertain outcome — picking a lock, persuading an NPC, dodging debris, hacking a terminal, sneaking past a guard, repairing something under pressure — you MUST obtain a ruling. Do not simply narrate success or failure. The dice decide.
FREQUENCY: You MUST use at least 1 dice-roll per act. If 3+ turns pass without a dice-roll, look for the next risky or uncertain action and call for a roll. Investigating something dangerous, confronting someone, repairing equipment, fleeing, persuading — these ALL warrant rolls.
Procedure:
  a. Build tension with 1-2 narrative frames showing the attempt.
  b. Emit a dice-roll frame: diceNotation "2d6", description naming the stat + modifier (e.g. "2d6 + Logic (+2)"). Do NOT set the roll value — the client computes it. The loop STOPS here automatically.
  c. Next turn you receive "[dice-result] N" (N = raw 2d6 total). Compute total = N + stat modifier. Then RULE:
     - 10+: Full Success — they achieve exactly what they intended.
     - 7-9: Mixed — they achieve it BUT you introduce a cost, complication, or hard choice. Something breaks, someone notices, a timer starts, a resource is spent.
     - ≤6: Miss — they fail AND the situation actively deteriorates. Not just "you fail" — a hard move pushes the story into worse territory.
  d. Emit a skill-check frame: { stat, statValue: MODIFIER, difficulty: 10, roll: N, modifier, total, succeeded: total >= 10, description: outcome summary }. Note: total 7-9 is a mixed success (succeeded: false, but narrate partial achievement with a complication).
  e. Follow with 1-2 narrative frames showing the consequence. The ruling is FINAL — never soften a miss or skip a 7-9 complication.

STAT NARRATION BAN:
NEVER write stat modifiers or attribute bonuses in narration or dialogue text.
BAD: "洞察+3让他捕捉到了她语气里那丝犹豫" — fake mechanics narrated as prose.
BAD: "His Perception +3 picked up the subtle tremor in her voice."
BAD: "力量+2使他轻松推开了沉重的铁门"
If a stat matters to the outcome, use a dice-roll frame. The DICE decide, not your prose.
Narration describes actions and sensations — NEVER reference game stats or numeric modifiers.

CORE FRAME TYPES (field reference — use these directly with frameBuilderTool):

- 'full-screen': Atmosphere, dramatic reveals, location shots.
  panels: [{ id:"center", backgroundAsset:"<bg_key>" }]
  narrations: [{ text:"<1-3 sentences>", effect?:{ type:"<effect>" } }, ...]
  audio?: { musicAsset:"<music_key>", fadeIn:true }

- 'dialogue': Character conversation (2 speakers).
  panels: [{ id:"left", backgroundAsset:"<bg>", characterAsset:"<char>", panelWeight:62 }, { id:"right", backgroundAsset:"<bg>", characterAsset:"<char>", panelWeight:38, dimmed:true }]
  conversation: [
    { speaker:"<Name>", text:"<words said aloud>" },     ← SPEECH BUBBLE
    { narrator:"<action or thought>" },                   ← NARRATOR BOX
    ...
  ]
  REMEMBER: { speaker, text } = speech bubble (spoken aloud). { narrator:"..." } = narrator box (action/thought/description).

- 'three-panel': 3 characters on screen.
  panels: [{ id:"left", ... }, { id:"center", ... }, { id:"right", ... }]
  conversation: [ same as dialogue ]

- 'choice': Decision point — STOPS the loop.
  panels: [{ id:"center", backgroundAsset:"<bg>" }] (or 2 panels with characters)
  conversation?: [ optional setup lines ]
  choices: [{ id:"opt-1", text:"<impulse-phrased option>" }, ...]
  showFreeTextInput: true

- 'transition': Scene/time change. panels: [] (empty).
  transition: { type:"fade"|"cut"|"dissolve", durationMs:1000, titleCard?:"<text>" }

- 'dice-roll': PbtA 2d6 ruling — STOPS the loop.
  panels: [{ id:"center", backgroundAsset:"<bg>" }]
  diceRoll: { diceNotation:"2d6", description:"2d6 + <Stat> (+N)" }
  Do NOT set roll — client computes it. Always followed by skill-check next turn.

- 'skill-check': Result after dice-roll.
  panels: [{ id:"center", backgroundAsset:"<bg>" }]
  skillCheck: { stat:"<name>", statValue:<modifier>, difficulty:10, roll:<N>, modifier:<M>, total:<N+M>, succeeded:<total>=10, description:"<outcome>" }
  Note: 7-9 is mixed success (succeeded:false but narrate partial achievement + complication).

Extended types available via frameGuideTool: ${getExtendedFrameTypeNames().join(', ')}.
Call frameGuideTool(type) before using any non-core type to get schema + workflow.

RENDERING RULES:
- Unique id per frame (slug: "harbor-arrival-1", "sato-confronts-2").
- EVERY panel: backgroundAsset required. backgroundAsset MUST be one of: ${bgKeys}.
- characterAsset MUST be one of: ${charKeys}. Never invent keys.
- Active speaker: panelWeight=62, dimmed=false. Listeners: panelWeight=38, dimmed=true.
- audio.musicAsset on first frame of each scene (fadeIn:true). Shift on mood change.
- Effects: max 1 frame-level, max 1-2 per-line. Never consecutive. Punctuation, not decoration.
  shake=impact, glitch=reality break, heartbeat=anxiety, flash=revelation, text-shake=fear.
- Call frameBuilderTool once per frame — do NOT batch.
- NO PLAIN TEXT. All content via frameBuilderTool and other designated tools only.
`;
}

// ─── Stop condition: stop when agent emits a choice or dice-roll frame ────────

function hasPlayerActionFrame(): StopCondition<any> {
  return ({ steps }) => {
    const lastStep = steps[steps.length - 1];
    return lastStep?.toolCalls?.some((tc: any) => {
      if (tc.toolName !== 'frameBuilderTool') return false;
      const type = (tc.input as any)?.type;
      // choice, dice-roll, and investigation are all interactive frames that require player input
      return type === 'choice' || type === 'dice-roll' || type === 'investigation';
    }) ?? false;
  };
}

function storytellerPrepareStep({ stepNumber, steps }: { stepNumber: number; steps: any[] }) {
  // NOTE: plotStateTool is now pre-called externally and its result injected into messages.
  // DeepSeek V3.2 does not honor toolChoice, so we no longer force plotStateTool at step 0.
  // The model already has Director guidance in its context.

  const prevStep = steps[steps.length - 1] as any;
  const prevToolCalls = Array.isArray(prevStep?.toolCalls) ? prevStep.toolCalls : [];

  // If a previous step produced no tool calls, force a frame recovery step.
  if (stepNumber > 0 && prevToolCalls.length === 0) {
    return { toolChoice: { type: 'tool' as const, toolName: 'frameBuilderTool' as const } };
  }

  // If model is stuck calling only plotStateTool (redundant with pre-call), force frame production.
  if (prevToolCalls.length > 0) {
    const allPlotState = prevToolCalls.every((tc: any) => tc.toolName === 'plotStateTool');
    if (allPlotState) {
      return { toolChoice: { type: 'tool' as const, toolName: 'frameBuilderTool' as const } };
    }
  }

  return undefined;
}

// ─── Agent factory (per-request, with sessionId bound in tools/prompt) ────────

export function createStorytellerAgent(vnPackage: VNPackage, sessionId: string) {
  const bound = bindSessionTools(sessionId);
  const agent = new ToolLoopAgent({
    model: getModel('storyteller'),
    temperature: 0.3,
    instructions: buildDMSystemPrompt(vnPackage, sessionId),
    toolChoice: 'required',
    prepareStep: storytellerPrepareStep,
    tools: {
      plotStateTool: bound.plotStateTool,
      frameBuilderTool,
      frameGuideTool,
      requestTravelTool: bound.requestTravelTool,
      playerStatsTool: bound.playerStatsTool,
      initCombatTool: bound.initCombatTool,
      combatEventTool: bound.combatEventTool,
      recordPlayerActionTool: bound.recordPlayerActionTool,
    },
    stopWhen: [
      hasPlayerActionFrame(),
      hasToolCall('requestTravelTool'),
      stepCountIs(20),
    ],
  });
  // Expose cache helpers so callers can pre-fetch plotState and invalidate cache per-turn
  (agent as any).resetPlotCache = bound.resetPlotCache;
  (agent as any).preFetchPlotState = bound.preFetchPlotState;
  return agent;
}

// ─── Type inference agent (static, for StorytellerUIMessage) ─────────────────

const _typeAgent = new ToolLoopAgent({
  model: undefined as never,
  tools: {
    plotStateTool: tool({
      inputSchema: z.object({ sessionId: z.string(), locationId: z.string().optional() }),
      execute: async () => ({
        currentActId: null as string | null,
        actObjective: null as string | null,
        currentLocationId: null as string | null,
        currentBeat: 0,
        nextBeat: null as string | null,
        beatsCompleted: [] as string[],
        remainingBeats: [] as string[],
        interactables: [] as string[],
        findings: [] as string[],
        callbacks: [] as string[],
        exitConditions: [] as string[],
        offPathTurns: 0,
        completedLocations: [] as string[],
        flags: {} as Record<string, unknown>,
        nudge: undefined as string | undefined,
      }),
    }),
    frameBuilderTool: tool({
      inputSchema: FrameInputSchema,
      execute: async () => ({ ok: true as const, frame: {} as VNFrame }),
    }),
    requestTravelTool: tool({
      inputSchema: z.object({
        sessionId: z.string(),
        targetLocationId: z.string(),
      }),
      execute: async () => ({
        ok: true as const,
        previousLocationId: '',
        newLocationId: '',
        newLocationTitle: '',
        ambientDetail: null as string | null,
        connections: [] as string[],
      }),
    }),
    playerStatsTool: tool({
      inputSchema: z.object({
        action: z.enum(['read', 'update', 'addItem', 'removeItem']),
        sessionId: z.string(),
        updates: z.object({}).optional(),
        item: z.object({}).optional(),
        itemId: z.string().optional(),
      }),
      execute: async () => ({ ok: true as const, stats: {} }),
    }),
    initCombatTool: tool({
      inputSchema: z.object({
        sessionId: z.string(),
        setting: z.string(),
        artStyle: z.string().optional(),
        gridCols: z.number().optional(),
        gridRows: z.number().optional(),
        tokens: z.array(z.object({
          id: z.string(),
          type: z.enum(['player', 'enemy', 'ally', 'objective', 'npc']),
          label: z.string(),
          icon: z.string(),
          col: z.number(),
          row: z.number(),
          hp: z.number(),
          maxHp: z.number(),
          attack: z.number().optional(),
          defense: z.number().optional(),
          moveRange: z.number().optional(),
          attackRange: z.number().optional(),
          aiPattern: z.enum(['aggressive', 'defensive', 'patrol', 'guard-objective']).optional(),
        })),
        terrain: z.array(z.object({
          col: z.number(),
          row: z.number(),
          type: z.enum(['blocked', 'difficult', 'hazard', 'cover']),
        })).optional(),
      }),
      execute: async () => ({
        ok: true as const,
        frameData: {
          id: '',
          type: 'tactical-map' as const,
          panels: [] as { id: 'left' | 'right' | 'center' }[],
          tacticalMapData: {} as Record<string, unknown>,
        },
      }),
    }),
    combatEventTool: tool({
      inputSchema: z.object({
        sessionId: z.string(),
        events: z.array(z.object({
          type: z.string(),
        }).passthrough()),
      }),
      execute: async () => ({
        ok: true as const,
        updatedFrameData: {
          id: '',
          type: 'tactical-map' as const,
          panels: [] as { id: 'left' | 'right' | 'center' }[],
          tacticalMapData: {} as Record<string, unknown>,
        },
      }),
    }),
    recordPlayerActionTool: tool({
      inputSchema: z.object({
        sessionId: z.string(),
        flagName: z.string(),
        value: z.union([z.boolean(), z.string(), z.number()]),
      }),
      execute: async () => ({ success: true, message: '' }),
    }),
    frameGuideTool: tool({
      inputSchema: z.object({ frameType: z.string() }),
      execute: async () => ({ type: '', summary: '' }),
    }),
  },
});

export type StorytellerUIMessage = InferAgentUIMessage<typeof _typeAgent>;
