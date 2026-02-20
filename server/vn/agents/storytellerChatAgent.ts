import { ToolLoopAgent, InferAgentUIMessage, hasToolCall, tool } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';
import { frameBuilderTool } from '../tools/frameBuilderTool.js';
import { plotStateTool } from '../tools/plotStateTool.js';
import { sceneCompleteTool } from '../tools/sceneCompleteTool.js';
import { yieldToPlayerTool } from '../tools/yieldToPlayerTool.js';
import { playerStatsTool } from '../tools/playerStatsTool.js';
import { initCombatTool } from '../tools/initCombatTool.js';
import { combatEventTool } from '../tools/combatEventTool.js';
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
LANGUAGE: ${vnPackage.language ?? 'en'}
ALL generated text — dialogue, narration, character speech, skill check descriptions, choice text, item names, location labels, status effect names — MUST be written in the language above. No mixing. This is a hard requirement.
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
- Max 5 frames per turn. Call frameBuilderTool once per frame — do NOT batch.

INTERACTIVE GAMEPLAY FRAMES (use these to create engaging moments beyond dialogue):

skill-check — Use when the player attempts something risky or uncertain:
  1. Call playerStatsTool({ action: "read", sessionId: "${sessionId}" }) to get their current stats
  2. Pick the relevant attribute (strength/dexterity/intelligence/luck/charisma)
  3. Compute: modifier = Math.floor((attributeValue - 10) / 2), roll = random 1-20, total = roll + modifier
  4. Set difficulty (DC): easy=8, moderate=12, hard=16, very hard=20
  5. Build a skill-check frame: type="skill-check", skillCheck: { stat, statValue, difficulty, roll, modifier, total, succeeded: total>=difficulty, description }
  6. Follow with narrative frames reacting to the outcome (success/failure each lead different directions)
  7. If HP changes (combat, hazard), call playerStatsTool({ action: "update", sessionId: "${sessionId}", updates: { hp: newHp } })

inventory — Use when player finds an item, opens their pack, or needs to choose an item:
  - To give an item: call playerStatsTool({ action: "addItem", sessionId: "${sessionId}", item: { id, name, description, icon, quantity:1 } })
  - To show inventory: build frame type="inventory" with inventoryData from playerStatsTool read result
  - mode="view" to display, mode="select" when player must choose an item to use

map — Use when the player needs to navigate between locations or the scene calls for travel:
  - Build frame type="map" with mapData: { backgroundAsset, currentLocationId, locations[] }
  - Populate locations from the package scenes (each scene is a potential location)
  - accessible: true for scenes the player can reach now, false for locked/future scenes
  - visited: true for completedScenes from plotStateTool

GENERAL RULE: Alternate between narrative dialogue frames AND gameplay frames. Do not have more than 3 consecutive pure-narrative frames without adding a skill-check, choice, or interactive moment.

TACTICAL COMBAT WORKFLOW:
When the story calls for combat:
1. Call initCombatTool to generate the map and set up tokens (player + enemies + objectives)
2. Take the frameData from the result and pass it to frameBuilderTool as-is (type='tactical-map')
3. Call yieldToPlayer({ waitingFor: 'combat-result' }) — the client will run the combat
4. When the player sends [combat-result] victory/defeat/escape {...}, continue the story based on the outcome
5. If player sends [combat-freetext][state:{...}], use combatEventTool to inject events, then use frameBuilderTool to send an updated tactical-map frame with the modified state

TOKEN SETUP GUIDELINES:
- Player token: type='player', use protagonist name, place at left side (col 1-2), hp from playerStatsTool
- Enemies: type='enemy', varied positions on right side, appropriate hp/attack for story difficulty
- Objectives: type='objective', icon='⭐' or relevant emoji, placed at strategic locations
- Terrain: add 3-6 terrain cells for cover/obstacles to make combat interesting

LAYERED MAP WORKFLOW (region → area → combat):
1. REGION MAP: When player arrives at a new part of the world, show a map frame with type='map', mapData.level='region'. Locations represent major areas (cities, forests, dungeons). Player clicks to choose where to go.
2. AREA MAP: When player enters an area, show a map frame with mapData.level='area'. Locations are specific points (dungeon entrance, guard post, treasure room). Add encounterType='combat' for combat encounters, 'dialogue' for NPCs, 'explore' for discovery.
3. COMBAT ENCOUNTER: When player clicks a combat-type location (you receive their choice), call initCombatTool to set up the tactical battle, pass the frameData to frameBuilderTool, then yieldToPlayer.
4. COMBAT RESULT: Player's [combat-result] message tells you victory/defeat/escape. Continue the story.
5. FREE TEXT IN COMBAT: [combat-freetext][state:{...}] — use combatEventTool to inject events, send updated tactical-map frame.`;
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
      playerStatsTool,
      initCombatTool,
      combatEventTool,
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
