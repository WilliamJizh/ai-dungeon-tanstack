import type { FrameType } from './types/vnFrame.js';

export interface FrameRegistryEntry {
  type: FrameType;
  /** One-liner shown in the "FRAME TYPES — use ALL of these:" agent prompt section. */
  agentSummary: string;
  /** Multi-line workflow text for the INTERACTIVE GAMEPLAY FRAMES section.
   *  Use the literal string SESSION_ID wherever the session id should appear;
   *  buildDMSystemPrompt replaces it at prompt-build time. */
  agentWorkflow?: string;
  /** When true, inject narration fallback if both dialogue.text and narration.text are absent. */
  requiresNarration?: boolean;
  /** VNFrame property that holds this frame type's payload (e.g. 'tacticalMapData'). */
  dataField?: string;
  /** If true, always included in the storyteller's static system prompt.
   *  Extended types are injected on demand via plotStateTool's frameGuides. */
  core?: boolean;
}

// ─── Per-type workflow strings ────────────────────────────────────────────────

const DICE_ROLL_WORKFLOW = `dice-roll — Physics dice animation for PbtA 2d6 rulings:
  1. Set diceNotation to "2d6"
  2. Do NOT set roll — the client computes it via physics simulation
  3. Set description to a short label naming the stat + modifier (e.g. "2d6 + Logic (+2)")
  4. The agent loop STOPS on this frame. Next turn receives "[dice-result] N".`;

const SKILL_CHECK_WORKFLOW = `skill-check — Result display after a dice-roll ruling (PbtA 2d6):
  1. You receive "[dice-result] N" at the start of the turn (N = 2d6 raw roll)
  2. Look up the relevant PbtA stat modifier from the character (e.g. Logic +2)
  3. total = N + modifier. Set difficulty: 10 (PbtA full-success threshold)
  4. Determine outcome band:
     - total 10+: Full Success — succeeded:true, description: what they achieved cleanly
     - total 7-9: Mixed — succeeded:true, description: what they achieved AND the cost/complication
     - total ≤6: Miss — succeeded:false, description: how the situation actively worsens
  5. Build: skillCheck: { stat, statValue: MODIFIER, difficulty: 10, roll: N, modifier, total, succeeded: total>=7, description }
  6. Follow with 1-2 narrative frames showing the consequence. The ruling is final — never soften a miss or skip a complication.
  7. If HP changes, call playerStatsTool({ action: "update", updates: { hp: newHp } })`;

const INVENTORY_WORKFLOW = `inventory — Use when player finds an item, opens their pack, or needs to choose an item:
  - To give an item: call playerStatsTool({ action: "addItem", item: { id, name, description, icon, quantity:1 } })
  - To show inventory: build frame type="inventory" with inventoryData from playerStatsTool read result
  - mode="view" to display, mode="select" when player must choose an item to use`;

const MAP_WORKFLOW = `map — Use when the player needs to navigate between locations or the scene calls for travel:
  - Build frame type="map" with mapData: { backgroundAsset, currentLocationId, locations[] }
  - Populate locations from the package scenes (each scene is a potential location)
  - accessible: true for scenes the player can reach now, false for locked/future scenes
  - visited: true for completedNodes from plotStateTool`;

const TACTICAL_WORKFLOW = `TACTICAL COMBAT WORKFLOW:
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

// ─── Registry ─────────────────────────────────────────────────────────────────

export const FRAME_REGISTRY: FrameRegistryEntry[] = [
  {
    type: 'full-screen',
    agentSummary: `Atmosphere, dramatic reveals, location shots. 1 panel (id: "center"), backgroundAsset set. Use narrations[] array for multiple text beats on the same visual — player clicks through each. Optional per-beat effect.`,
    requiresNarration: true,
    core: true,
  },
  {
    type: 'dialogue',
    agentSummary: `Character conversation. 2 panels with backgroundAsset + characterAsset. Use conversation[] array: {speaker, text} for spoken dialogue, {narrator:"..."} for actions/thoughts between lines. Renderer auto-shifts panel focus between speakers. Optional per-line effect.`,
    requiresNarration: true,
    core: true,
  },
  {
    type: 'three-panel',
    agentSummary: `3 characters on screen. 3 panels: "left", "center", "right". Each needs backgroundAsset + characterAsset. Use conversation[] for multi-speaker dialogue.`,
    requiresNarration: true,
    core: true,
  },
  {
    type: 'choice',
    agentSummary: `Decision point. 1–2 panels. Include choices[] with 2–4 options (id + text). Set showFreeTextInput: true if player can also type freely.`,
    core: true,
  },
  {
    type: 'battle',
    agentSummary: `Combat. Include battle.player, battle.enemies[], battle.combatLog[], battle.skills[], battle.round.`,
    dataField: 'battle',
  },
  {
    type: 'transition',
    agentSummary: `Scene/time change. panels: [] (empty). Set transition.type and transition.durationMs.`,
    dataField: 'transition',
    core: true,
  },
  {
    type: 'dice-roll',
    agentSummary: `PbtA 2d6 ruling — physics dice animation, STOPS the loop. Set diceRoll: { diceNotation: "2d6", description: "2d6 + [Stat] (+N)" }. Do NOT set roll — client computes it. Always followed by skill-check on next turn.`,
    agentWorkflow: DICE_ROLL_WORKFLOW,
    dataField: 'diceRoll',
    core: true,
  },
  {
    type: 'skill-check',
    agentSummary: `Ruling result after dice-roll. Shows stat, modifier, roll, total, outcome. Set skillCheck: { stat, statValue, difficulty:10, roll, modifier, total, succeeded: total>=7, description }. 10+ full success, 7-9 mixed (succeeded but with cost), ≤6 miss.`,
    agentWorkflow: SKILL_CHECK_WORKFLOW,
    dataField: 'skillCheck',
    core: true,
  },
  {
    type: 'inventory',
    agentSummary: `Item inventory display. Include inventoryData: { items[], mode, prompt }.`,
    agentWorkflow: INVENTORY_WORKFLOW,
    dataField: 'inventoryData',
  },
  {
    type: 'map',
    agentSummary: `Location map with clickable nodes. Include mapData: { backgroundAsset, currentLocationId, level, locations[] }.`,
    agentWorkflow: MAP_WORKFLOW,
    dataField: 'mapData',
  },
  {
    type: 'character-sheet',
    agentSummary: `Full character stats display. Include characterSheet: { playerName, level, hp, maxHp, attributes, skills, statusEffects }.`,
    dataField: 'characterSheet',
  },
  {
    type: 'tactical-map',
    agentSummary: `Turn-based tactical combat grid. Set up via initCombatTool. Include tacticalMapData from the tool result.`,
    agentWorkflow: TACTICAL_WORKFLOW,
    dataField: 'tacticalMapData',
  },
  {
    type: 'item-presentation',
    agentSummary: `Showcase a newly acquired object art prominently. Set itemPresentation: { itemAsset, itemName, description }.`,
    dataField: 'itemPresentation',
  },
  {
    type: 'cg-presentation',
    agentSummary: `Full-screen event artwork (CG) with low-distraction text overlay. Set cgPresentation: { cgAsset, description, emotion }.`,
    dataField: 'cgPresentation',
  },
  {
    type: 'centered-monologue',
    agentSummary: `Text on a black/ambient screen for deep thought, disembodied voice-over, or prologues. Set monologue: { text, speaker?, voiceAsset? }.`,
    dataField: 'monologue',
  },
  {
    type: 'investigation',
    agentSummary: `Point-and-click scene investigation. Set investigationData: { backgroundAsset, hotspots[] }. Player will select from the hotspots.`,
    dataField: 'investigationData',
  },
  {
    type: 'lore-unlock',
    agentSummary: `Unlock a database/encyclopedia entry for the player without info-dumping in dialogue. Set loreEntry: { title, category, content }.`,
    dataField: 'loreEntry',
  },
  {
    type: 'dynamic-cut-in',
    agentSummary: `Comic-book style character interruptions or shouts. Set cutIn: { speaker, text, style, characterAsset? }.`,
    dataField: 'cutIn',
  },
  {
    type: 'flashback',
    agentSummary: `Explicitly filtered frame (e.g. sepia/grayscale) to denote memories, dreams, or premonitions. Set flashback: { text, filter, backgroundAsset? }.`,
    dataField: 'flashback',
  },
  {
    type: 'cross-examination',
    agentSummary: `Logic puzzle presenting a statement the player must contradict with an item. Set crossExamination: { speaker, statement, contradictionItemId? }.`,
    dataField: 'crossExamination',
  },
  {
    type: 'time-limit',
    agentSummary: `High tension deadline enforcing a quick decision/action (Quick Time Event). Set timeLimit: { seconds, text, failureConsequence }.`,
    dataField: 'timeLimit',
  },
];

/** O(1) lookup — use in hot paths (frameBuilderTool, prompt builder). */
export const FRAME_REGISTRY_MAP = new Map<FrameType, FrameRegistryEntry>(
  FRAME_REGISTRY.map(e => [e.type, e]),
);

/** Non-core frame type names, used by frameGuideTool to list available types. */
export function getExtendedFrameTypeNames(): string[] {
  return FRAME_REGISTRY.filter(e => !e.core).map(e => e.type);
}
