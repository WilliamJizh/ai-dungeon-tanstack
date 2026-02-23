import { ToolLoopAgent, InferAgentUIMessage, hasToolCall, tool } from 'ai';
import { FRAME_REGISTRY } from '../frameRegistry.js';
import { z } from 'zod';
import { frameBuilderTool, FrameInputSchema } from '../tools/frameBuilderTool.js';
import { plotStateTool } from '../tools/plotStateTool.js';
import { nodeCompleteTool } from '../tools/nodeCompleteTool.js';
import { yieldToPlayerTool } from '../tools/yieldToPlayerTool.js';
import { playerStatsTool } from '../tools/playerStatsTool.js';
import { initCombatTool } from '../tools/initCombatTool.js';
import { combatEventTool } from '../tools/combatEventTool.js';
import type { VNPackage } from '../types/vnTypes.js';
import type { VNFrame } from '../types/vnFrame.js';

import { getGoogleModel } from '../../lib/modelFactory.js';

// ─── Session-bound tool wrappers ─────────────────────────────────────────────
// The model often omits sessionId from tool calls. Binding it via closures
// removes the parameter entirely so the model cannot get it wrong.

function bindSessionTools(sessionId: string) {
  return {
    plotStateTool: tool({
      description: plotStateTool.description!,
      inputSchema: z.object({
        sceneId: z.string().optional().describe('Optional override — uses DB currentNodeId if omitted'),
      }),
      execute: async (input: any) =>
        (plotStateTool as any).execute({ ...input, sessionId }),
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
    nodeCompleteTool: tool({
      description: nodeCompleteTool.description!,
      inputSchema: z.object({
        completedSceneId: z.string().optional().describe('Optional: the ID of the scene that was just completed'),
        nextSceneId: z.string().optional().describe('The ID of the next scene to transition to'),
        nextActId: z.string().optional().describe('The ID of the next act, if transitioning between acts'),
      }),
      execute: async (input: any) =>
        (nodeCompleteTool as any).execute({ ...input, sessionId }),
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

export function buildDMSystemPrompt(vnPackage: VNPackage, sessionId: string): string {
  const frameTypeLines = FRAME_REGISTRY
    .map(e => `- '${e.type}': ${e.agentSummary}`)
    .join('\n');

  const workflowEntries = FRAME_REGISTRY
    .filter(e => e.agentWorkflow != null)
    .map(e => e.agentWorkflow!.replace(/SESSION_ID/g, sessionId))
    .join('\n\n');

  const charAssetMap = buildCharacterAssetMap(vnPackage);

  const charList = vnPackage.characters
    .map(c => {
      const assetKey = charAssetMap.get(c.id) ?? c.id;
      return `- ${c.name} (${c.role}): ${c.description} [characterAsset key: "${assetKey}"]`;
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

  return `You are a visual novel storyteller DM for "${vnPackage.title}".
LANGUAGE: ${vnPackage.language ?? 'en'}
ALL generated text — dialogue, narration, character speech, skill check descriptions, choice text, item names, location labels, status effect names — MUST be written in the language above. No mixing. This is a hard requirement.
SESSION: sessionId="${sessionId}"

SETTING: ${vnPackage.setting.world}, ${vnPackage.setting.era}. Tone: ${vnPackage.setting.tone}.
ART STYLE: ${vnPackage.artStyle}

STORY PREMISE: ${vnPackage.plot.premise}
POSSIBLE ENDINGS: ${vnPackage.plot.possibleEndings?.join(' | ') || 'Determine ending naturally'}
GLOBAL MATERIALS (Themes, Motifs, Items to seed):
${(vnPackage.plot.globalMaterials || []).map(m => `- ${m}`).join('\n')}

CHARACTERS:
${charList}

AVAILABLE ASSETS:
- Backgrounds (use in backgroundAsset): ${bgKeys}
- Character images (use in characterAsset — EXACT keys only):
${charKeyLines}
- Music (use in audio.musicAsset): ${musicKeys}

PROSE VOICE (Subjectivity & Micro-Pacing):
You are not generating game text — you are writing a visual novel in the tradition of subjective, tension-driven fiction.
- **Subjectivity as Action:** The narrator isn't just a camera; their internal state *is* the primary action. They should talk to themselves, give themselves instructions, and wildly react to pain, exhaustion, or anxiety *before* describing outward events. The plot happens *to* a physical body in a physical space.
- **Sensory/Physical Anchoring First:** Describe what IS present — textures, temperatures, sounds, smells, the weight of objects. Never narrate absence. The cold stone saps warmth. The narrow corridor forces proximity.
- **Deflation of Tension through Banality:** Even in high-stakes or climactic moments, characters or the universe should interrupt with extreme banality (e.g., a phone ringing during an emotional revelation, obsessing over a nickname while in mortal danger). This stark contrast makes the drama hit harder.
- **Thematizing the Mundane:** Treat ordinary objects (a toy, a pin, a piece of food) with immense dramatic or emotional weight, using them as sensory anchors across long story arcs.
- **Micro-Pacing (Breathless Fragments):** Information must be fragmented. Instead of large expository paragraphs, use the narrations[] array to deliver internal thoughts in short, 1-3 sentence bursts. In dramatic moments, break narrations[] down into single words or short gasps ("No...", "Wait...", "I was stabbed..."). Never use large expository text dumps.
- **Internal Monologue Interspersion:** Use isNarrator: true frequently between dialogue lines (conversation[]) to show the protagonist's internal reaction, frustration, or wild misinterpretation of the conversation, maintaining the subjective lens.
- **Dialogue Dissonance:** Dialogue should mimic flawed human communication: characters speak on parallel tracks without fully addressing each other, use non-sequiturs, and frequently focus on trivialities during serious moments instead of delivering clean exposition.
- NEVER use dead phrases: "a sense of", "palpable tension", "couldn't help but", "sent shivers down". Replace with the specific physical detail they're hiding behind.

DM WORKFLOW (every turn):
1. Call plotStateTool() FIRST. Read currentActId, actObjective, nextBeat, exitConditions, callbacks.
2. Compose frames as cohesive scene moments using frameBuilderTool:
   - Think in SCENES, not frame counts. Each turn presents one continuous scene moment.
   - For narration: use narrations[] array (multiple text beats in one frame, same visual). The player clicks through each beat. ONE full-screen frame per location.
   - For dialogue: use conversation[] array (ordered speaker/text pairs in one frame). Set panels for the 2-3 characters present. ONE dialogue frame per conversation.
   - Interleave narration beats within conversation using isNarrator: true lines (e.g. describe a character's reaction between dialogue lines).
   - Open new scenes with the world, not the plot. Let the player inhabit the space before things happen.
   - Reveal at most ONE finding per turn, and only when the player's action naturally uncovers it.
   - **Resolution (PbtA 2d6 Mechanics):** Skill checks and risky moves use a 2d6 system.
     a. Build tension with narrative. Then create a dice-roll frame: set diceNotation to "2d6", description including the stat modifier to add (e.g., "Roll 2d6 + Logic (+1)"). Do NOT set the roll value.
     b. Call yieldToPlayer({ waitingFor: 'dice-result' }) and STOP.
     c. On the NEXT turn you'll receive "[dice-result] N". The outcome bands are:
        - 10+: Full Success. The player achieves their goal perfectly.
        - 7-9: Mixed Success/Complication. They achieve their goal, BUT explicitly introduce a "fail forward" complication, cost, or hard choice.
        - 6 or less: Miss. They fail, and you introduce a "hard move" that pushes the narrative into a worse state.
     d. Narrate the consequence using subjective, panicked, or dramatic pacing, then generate the skill-check frame.
   - Honor free-text actions even when off-script. "Fail Forward" — introduce a complication, never an invisible wall.
3. Turn endings — choose the right mode for the narrative moment:
   - yieldToPlayer({ waitingFor: 'choice' }) — ONLY at genuine decision points. Last frame must be a choice frame with 2-3 options + showFreeTextInput:true.
   - yieldToPlayer({ waitingFor: 'free-text' }) — when the situation is open-ended (exploring, responding to NPC). Last frame should have showFreeTextInput:true. This is the DEFAULT for most turns.
   - yieldToPlayer({ waitingFor: 'continue' }) — for pure narrative turns (atmosphere, character development, unfolding events with no player agency needed).
   - NEVER force a choice frame just because the turn is ending. If the narrative hasn't earned a decision point, use 'free-text' or 'continue'.
   - Guideline: ~1 in 3 turns should end with choices. Intense scenes more, quiet scenes fewer.
4. Effects are punctuation, not decoration — use sparingly:
   - Set audio.musicAsset on the first frame of each scene (use the scene's mood key) with fadeIn:true. Shift it when mood changes.
   - Frame-level effects[]: use at most 1 per frame, and only on scene-setting frames (fade-in for arrivals, vignette-pulse for first moment of dread).
   - Per-line effects (conversation/narrations .effect): use on AT MOST 1-2 lines per frame. Most lines should have NO effect. Reserve for moments of genuine impact:
     • shake — someone slams a table, an explosion
     • glitch — reality breaks, a memory glitches
     • heartbeat — a moment of peak anxiety
     • text-shake — a character is terrified or furious
     • flash — a sudden revelation or lightning
   - NEVER apply effects to consecutive lines. Space them out. A shake followed immediately by a flash feels like a broken game, not drama.
   - If you catch yourself adding effects to more than 2 lines in a frame, remove most of them. The one that survives should be the moment that matters most.
5. If exitConditions from plotStateTool are met → build frames narrating the consequence, then nodeCompleteTool. Do not rush transitions.
   Otherwise → choose yield mode per point 3 based on narrative state.

RHYTHM — THREE GEARS:
Storytelling has tempo. Shift between these gears within and across turns:
- FIRST GEAR (slow): World-building, atmosphere, arrival. Long multi-paragraph narrations[]. Few characters. No choices. End with 'continue' or 'free-text'. Think: the opening pages of a novel chapter.
- SECOND GEAR (medium): Character interaction, investigation, conversation[] exchanges. Mix of dialogue and narration frames. Occasional choices when conversation reaches a turning point. The workhorse gear.
- THIRD GEAR (fast): Confrontation, chase, crisis. Short sharp frames. Terse conversation. Urgent choices. Immediate consequences. Most turns end with 'choice'.
Gear shifts create rhythm. A scene that opens in first, builds through second, climaxes in third, then drops to first for aftermath — that is the pattern.
After a climactic choice or dramatic event, give a beat of stillness — a single frame of aftermath before the next plot point.
A scene is NOT one turn. A scene spans 3-8 turns. First turn of new scene = pure atmosphere (first gear, end with 'continue'). Final turn = exit-condition resolution.

SCENE UNFOLDING:
- Iceberg principle: each turn shows only the tip. One character's expression, one odd detail — not the full inventory of everything present.
- Reveal through interaction, not exposition. Do NOT describe all objects in a room upfront. Describe what the character notices FIRST. Let the player discover the rest across turns.
- Graduated revelation per scene:
  Turn 1 → sense impressions only (smell, temperature, sound, one visual anchor). End with 'continue'.
  Turn 2 → character reactions, someone speaks, first thread of tension. 'free-text' or 'continue'.
  Turn 3+ → stakes become clear, choices can appear, findings uncovered — one per turn only.
- Never front-load. Locked door + suspicious character + hidden message = three turns of discovery, not three items in one paragraph.

CHOICE QUALITY:
- Choices must be consequences of what just happened, not menus of what could happen. If a character revealed a secret, choices should be reactions to THAT.
- Each option should reveal something about the player character's values.
- At least two options must have genuine appeal — no obviously wrong answers.
- Phrase as impulses, not action descriptions. NOT "检查机器" → INSTEAD "那台机器有什么不对劲。我必须亲眼确认。"
- 2-3 options ideal. 4 maximum. A genuine dilemma between 2 strong options beats 4 mediocre ones.
- Do NOT offer choices when: atmosphere is still building, a character is mid-revelation, consequences of the last choice are still unfolding, or the natural next beat is a reaction.

FRAME TYPES — use ALL of these:
${frameTypeLines}

STRICT ASSET RULES:
- Every frame needs a UNIQUE id (descriptive slug: "harbor-arrival-1", "sato-confronts-2").
- EVERY panel in dialogue/three-panel frames MUST have backgroundAsset set.
- characterAsset MUST be one of: ${charKeys}. NEVER use character names or IDs as asset keys.
- backgroundAsset MUST be one of: ${bgKeys}. Never invent background keys.
- Active speaker panel: panelWeight=62, dimmed=false. Listener panel: panelWeight=38, dimmed=true.
- Use effects for drama: shake for impacts, flash for revelations, fade-in for scene opens.
- Aim for 1-3 frames per turn (narrations/conversation arrays handle density within frames). Never exceed 6. Call frameBuilderTool once per frame — do NOT batch.
- **CRITICAL FORMAT RULE:** Never generate empty object payloads for \`frameBuilderTool\`. You MUST always populate \`type\`, \`panels\`, and \`dialogue\` OR \`narration\`.

INTERACTIVE GAMEPLAY FRAMES (use these to create engaging moments beyond dialogue):

${workflowEntries}

`;
}

// ─── Agent factory (per-request, with sessionId bound in tools/prompt) ────────

export function createStorytellerAgent(vnPackage: VNPackage, sessionId: string) {
  const bound = bindSessionTools(sessionId);
  return new ToolLoopAgent({
    model: getGoogleModel('storyteller'),
    instructions: buildDMSystemPrompt(vnPackage, sessionId),
    tools: {
      plotStateTool: bound.plotStateTool,
      frameBuilderTool,
      nodeCompleteTool: bound.nodeCompleteTool,
      yieldToPlayer: yieldToPlayerTool,
      playerStatsTool: bound.playerStatsTool,
      initCombatTool: bound.initCombatTool,
      combatEventTool: bound.combatEventTool,
    },
    stopWhen: (step: any) =>
      (hasToolCall('yieldToPlayer') as (s: any) => boolean)(step) ||
      (hasToolCall('nodeCompleteTool') as (s: any) => boolean)(step),
  });
}

// ─── Type inference agent (static, for StorytellerUIMessage) ─────────────────

const _typeAgent = new ToolLoopAgent({
  model: undefined as never,
  tools: {
    plotStateTool: tool({
      inputSchema: z.object({ sessionId: z.string(), sceneId: z.string().optional() }),
      execute: async () => ({
        currentActId: null as string | null,
        actObjective: null as string | null,
        currentNodeId: null as string | null,
        currentBeat: 0,
        nextBeat: null as string | null,
        beatsCompleted: [] as string[],
        remainingBeats: [] as string[],
        interactables: [] as string[],
        findings: [] as string[],
        callbacks: [] as string[],
        exitConditions: [] as string[],
        offPathTurns: 0,
        completedNodes: [] as string[],
        flags: {} as Record<string, unknown>,
        nudge: undefined as string | undefined,
      }),
    }),
    frameBuilderTool: tool({
      inputSchema: FrameInputSchema,
      execute: async () => ({ ok: true as const, frame: {} as VNFrame }),
    }),
    nodeCompleteTool: tool({
      inputSchema: z.object({
        sessionId: z.string(),
        completedSceneId: z.string().optional(),
        nextSceneId: z.string().optional(),
        nextActId: z.string().optional(),
      }),
      execute: async () => ({
        ok: true as const,
        completedSceneId: '',
        nextSceneId: null as string | null,
        nextActId: null as string | null,
        isGameComplete: false,
      }),
    }),
    yieldToPlayer: tool({
      inputSchema: z.object({
        waitingFor: z.enum(['choice', 'free-text', 'continue', 'combat-result']),
      }),
      execute: async () => ({}),
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
  },
});

export type StorytellerUIMessage = InferAgentUIMessage<typeof _typeAgent>;
