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
}

// ─── Per-type workflow strings ────────────────────────────────────────────────

const DICE_ROLL_WORKFLOW = `dice-roll — Show physics dice rolling BEFORE a skill-check or for any random event:
  1. Set diceNotation to the dice being rolled (e.g. "1d20", "2d6", "1d8")
  2. Set roll to your pre-computed value — it MUST match the roll value used in the following skill-check frame
  3. Set description to a short label for what is being rolled (e.g. "Rolling Dexterity", "Damage Roll")
  4. For ability checks: ALWAYS follow immediately with a skill-check frame`;

const SKILL_CHECK_WORKFLOW = `skill-check — Result display for ability checks (no dice animation — use dice-roll frame first):
  1. Call playerStatsTool({ action: "read" }) to get their current stats
  2. Pick the relevant attribute (strength/dexterity/intelligence/luck/charisma)
  3. Compute: modifier = Math.floor((attributeValue - 10) / 2), roll = random 1-20, total = roll + modifier
  4. Set difficulty (DC): easy=8, moderate=12, hard=16, very hard=20
  5. Build a dice-roll frame FIRST: type="dice-roll", diceRoll: { diceNotation: "1d20", roll: COMPUTED_ROLL, description: "Rolling [stat]" }
  6. Build the skill-check frame: type="skill-check", skillCheck: { stat, statValue, difficulty, roll: SAME_COMPUTED_ROLL, modifier, total, succeeded: total>=difficulty, description }
  7. Follow with narrative frames reacting to the outcome (success/failure each lead different directions)
  8. If HP changes (combat, hazard), call playerStatsTool({ action: "update", updates: { hp: newHp } })`;

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
  },
  {
    type: 'dialogue',
    agentSummary: `Character conversation. 2 panels with backgroundAsset + characterAsset. Use conversation[] array with ordered {speaker, text} lines — renderer auto-shifts panel focus between speakers. Use isNarrator:true for narration beats between lines. Optional per-line effect.`,
    requiresNarration: true,
  },
  {
    type: 'three-panel',
    agentSummary: `3 characters on screen. 3 panels: "left", "center", "right". Each needs backgroundAsset + characterAsset. Use conversation[] for multi-speaker dialogue.`,
    requiresNarration: true,
  },
  {
    type: 'choice',
    agentSummary: `Decision point. 1–2 panels. Include choices[] with 2–4 options (id + text). Set showFreeTextInput: true if player can also type freely.`,
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
  },
  {
    type: 'dice-roll',
    agentSummary: `Physics dice animation — reveals raw roll number, no outcome shown. Set diceRoll: { diceNotation, roll, description }. Always precedes a skill-check frame for ability checks.`,
    agentWorkflow: DICE_ROLL_WORKFLOW,
    dataField: 'diceRoll',
  },
  {
    type: 'skill-check',
    agentSummary: `Result display ONLY (no dice). Shows stat, DC vs total, success/failure. Include skillCheck: { stat, statValue, difficulty, roll, modifier, total, succeeded, description }. Always preceded by a dice-roll frame.`,
    agentWorkflow: SKILL_CHECK_WORKFLOW,
    dataField: 'skillCheck',
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
