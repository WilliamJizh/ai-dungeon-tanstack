import { ToolLoopAgent, InferAgentUIMessage, hasToolCall, tool } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';
import { frameBuilderTool } from '../tools/frameBuilderTool.js';
import { plotStateTool } from '../tools/plotStateTool.js';
import { sceneCompleteTool } from '../tools/sceneCompleteTool.js';
import { yieldToPlayerTool } from '../tools/yieldToPlayerTool.js';
import type { VNPackage } from '../types/vnTypes.js';
import type { VNFrame } from '../types/vnFrame.js';

const MODEL_ID = process.env.GEMINI_STORY_MODEL
  ?? process.env.GEMINI_TEXT_MODEL
  ?? 'gemini-3-flash-preview';

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

function buildDMSystemPrompt(vnPackage: VNPackage, sessionId: string): string {
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
SESSION: sessionId="${sessionId}"

SETTING: ${vnPackage.setting.world}, ${vnPackage.setting.era}. Tone: ${vnPackage.setting.tone}.
ART STYLE: ${vnPackage.artStyle}

CHARACTERS:
${charList}

AVAILABLE ASSETS:
- Backgrounds (use in backgroundAsset): ${bgKeys}
- Character images (use in characterAsset — EXACT keys only):
${charKeyLines}
- Music (use in audio.musicAsset): ${musicKeys}

STORY PREMISE: ${vnPackage.plot.premise}

DM WORKFLOW (follow exactly every turn):
1. ALWAYS call plotStateTool({ sessionId: "${sessionId}" }) FIRST to see:
   - nextBeat: the current narrative beat you must cover this turn
   - exitConditions: what would end this scene
   - nudge: if present, the player is off-track — steer them back
2. Based on the player's action, build 2–5 frames using frameBuilderTool that:
   - Cover the nextBeat from plotStateTool (don't skip beats)
   - React naturally to the player's action while staying on the beat
   - Build atmosphere and advance the scene
3. End every turn with EITHER:
   - A 'choice' frame (choices[] array) for meaningful decisions, OR
   - A frame with showFreeTextInput: true for open actions
4. If the player's action clearly meets one of the exitConditions:
   - Call sceneCompleteTool({ sessionId: "${sessionId}", completedSceneId: <id> })
   - Do NOT call yieldToPlayer — sceneCompleteTool ends the loop
5. Otherwise, after all frames are built, call yieldToPlayer({ waitingFor: 'choice' | 'free-text' | 'continue' })

FRAME TYPES — use ALL of these:
- 'full-screen': Atmosphere, dramatic reveals, location shots. 1 panel (id: "center"), backgroundAsset set, add narration.text.
- 'dialogue': Character speaks. 2 panels: speaker (weight=62, dimmed=false) + listener (weight=38, dimmed=true). BOTH panels need backgroundAsset. Set dialogue.speaker, dialogue.text, dialogue.targetPanel.
- 'three-panel': 3+ characters on screen. 3 panels: "left", "center", "right". Each needs backgroundAsset.
- 'choice': Decision point. 1–2 panels. Include choices[] with 2–4 options (id + text). Set showFreeTextInput: true if player can also type freely.
- 'battle': Combat. Include battle.player, battle.enemies[], battle.combatLog[], battle.skills[], battle.round.
- 'transition': Scene/time change. panels: [] (empty). Set transition.type and transition.durationMs.

STRICT ASSET RULES:
- Every frame needs a UNIQUE id (descriptive slug: "harbor-arrival-1", "sato-confronts-2").
- EVERY panel in dialogue/three-panel frames MUST have backgroundAsset set.
- characterAsset MUST be one of: ${charKeys}. NEVER use character names or IDs as asset keys.
- backgroundAsset MUST be one of: ${bgKeys}. Never invent background keys.
- Active speaker panel: panelWeight=62, dimmed=false. Listener panel: panelWeight=38, dimmed=true.
- Use effects for drama: shake for impacts, flash for revelations, fade-in for scene opens.
- Max 5 frames per turn. Call frameBuilderTool once per frame — do NOT batch.`;
}

// ─── Agent factory (per-request, with sessionId bound in tools/prompt) ────────

export function createStorytellerAgent(vnPackage: VNPackage, sessionId: string) {
  const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY! });

  return new ToolLoopAgent({
    model: google(MODEL_ID),
    instructions: buildDMSystemPrompt(vnPackage, sessionId),
    tools: {
      plotStateTool,
      frameBuilderTool,
      sceneCompleteTool,
      yieldToPlayer: yieldToPlayerTool,
    },
    stopWhen: (step: any) =>
      (hasToolCall('yieldToPlayer') as (s: any) => boolean)(step) ||
      (hasToolCall('sceneCompleteTool') as (s: any) => boolean)(step),
  });
}

// ─── Type inference agent (static, for StorytellerUIMessage) ─────────────────

const _typeAgent = new ToolLoopAgent({
  model: undefined as never,
  tools: {
    plotStateTool: tool({
      inputSchema: z.object({ sessionId: z.string(), sceneId: z.string().optional() }),
      execute: async () => ({
        currentSceneId: null as string | null,
        currentBeat: 0,
        nextBeat: null as string | null,
        beatsCompleted: [] as string[],
        remainingBeats: [] as string[],
        exitConditions: [] as string[],
        offPathTurns: 0,
        completedScenes: [] as string[],
        flags: {} as Record<string, unknown>,
        nudge: undefined as string | undefined,
      }),
    }),
    frameBuilderTool: tool({
      inputSchema: z.object({}).passthrough(),
      execute: async () => ({ ok: true as const, frame: {} as VNFrame }),
    }),
    sceneCompleteTool: tool({
      inputSchema: z.object({
        sessionId: z.string(),
        completedSceneId: z.string(),
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
        waitingFor: z.enum(['choice', 'free-text', 'continue']),
      }),
      execute: async () => ({}),
    }),
  },
});

export type StorytellerUIMessage = InferAgentUIMessage<typeof _typeAgent>;
