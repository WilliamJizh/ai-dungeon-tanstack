# Visual Novel Engine Specification

## 1. Overview

The VN Engine is a two-phase system built on top of the AI Dungeon project. It uses AI agents (powered by Vercel AI SDK v5 + Gemini) to generate and run interactive visual novel experiences.

### Two Phases

1. **Plan Phase** — The Planning Agent researches context (via Google Search grounding), creates a full story structure, generates all visual and audio assets, and produces a `VNPackage` (game manifest).
2. **Story Phase** — The Storyteller Agent handles player input each turn, calls tools to build `VNFrame[]` sequences, and maintains plot integrity through beat tracking.

### Architecture

- **Backend**: Fastify server with SSE streaming, SQLite persistence (Drizzle ORM)
- **Frontend**: React + TanStack Router, pure JSON consumer (no agent logic in the client)
- **AI Framework**: Vercel AI SDK v5 (`ai`, `@ai-sdk/google`)
- **Model**: Gemini (configurable via `GEMINI_STORY_MODEL` / `GEMINI_TEXT_MODEL` env vars)
- **Assets**: File-based (PNG images, PCM audio) served by `@fastify/static`
- **Image generation**: Gemini Imagen via `server/agents/imageAgent.ts`

---

## 2. Frame Registry

**Source of truth**: Two registry files — intentionally separate (server doesn't need React; client doesn't need AI docs).

```
server/vn/frameRegistry.ts    ← agent docs, requiresNarration flag, dataField names
src/lib/frameRegistry.tsx      ← React component map + resolveFrameEntry()
```

### Why a Registry?

Adding a new frame type previously required 5+ scattered file edits with duplicated information. The registry pattern consolidates this to a 4-step process with TypeScript enforcement.

### `server/vn/frameRegistry.ts`

```ts
interface FrameRegistryEntry {
  type: FrameType;
  agentSummary: string;      // one-liner in the "FRAME TYPES" agent prompt section
  agentWorkflow?: string;    // multi-line in "INTERACTIVE GAMEPLAY FRAMES"; SESSION_ID placeholder
  requiresNarration?: boolean; // inject '...' fallback when both dialogue+narration absent
  dataField?: string;        // VNFrame property name for this type's payload
}
```

`FRAME_REGISTRY_MAP` provides O(1) lookup and is used in `frameBuilderTool.ts` for narration injection.

`agentWorkflow` strings use the literal `SESSION_ID` as a placeholder; `buildDMSystemPrompt` replaces it at prompt-build time via `.replace(/SESSION_ID/g, sessionId)`.

### `src/lib/frameRegistry.tsx`

```ts
interface ClientFrameEntry {
  component: ComponentType<any>;
  makeProps?: (base: BaseFrameProps) => Record<string, unknown>;
}

// Record<FrameType, ClientFrameEntry> — TypeScript errors if any FrameType is missing
const CLIENT_FRAME_REGISTRY: Record<FrameType, ClientFrameEntry>
```

`resolveFrameEntry(frame)` handles the `dialogue → FullScreenFrame` fallback for center-target dialogue. All renderers call this instead of a hardcoded switch.

**`tactical-map`** is always handled by an explicit branch in renderers (`VNRenderer.tsx`, `VNFramePreviewPage.tsx`) because its `onCombatComplete` and `onFreeText` callbacks require closures over renderer state (`setCurrentIndex`, `frames.length`) that don't fit `BaseFrameProps`.

### Adding a New Frame Type

| Step | File | Notes |
|------|------|-------|
| 1 | `server/vn/types/vnFrame.ts` | Add to `FrameTypeSchema` enum + optional Zod data field |
| 2 | `server/vn/frameRegistry.ts` | Add one `FrameRegistryEntry` with `agentSummary` + optional workflow |
| 3 | `src/lib/frameRegistry.tsx` | Add one entry — TypeScript errors if missing from `Record<FrameType, ...>` |
| 4 | `src/components/vn/frames/NewFrame.tsx` | Create the React component |

---

## 3. VNFrame Contract

**Source of truth**: `server/vn/types/vnFrame.ts`

A `VNFrame` is a single screen state in the visual novel. The React renderer selects a layout component based on `frame.type`.

### 11 Frame Types

| Type | Component | Description |
|------|-----------|-------------|
| `full-screen` | FullScreenFrame | Atmosphere, dramatic reveals, location shots. 1 panel (`center`). |
| `dialogue` | DialogueFrame | Character speaks. 2 panels: speaker (62%, undimmed) + listener (38%, dimmed). Falls back to FullScreenFrame for center-target dialogue. |
| `three-panel` | ThreePanelFrame | 3+ characters on screen. 3 panels: `left`, `center`, `right`. |
| `choice` | ChoiceFrame | Decision point. 2–4 choices + optional free-text input. |
| `battle` | BattleFrame | Legacy turn UI. Includes player, enemies, combat log, skill grid. |
| `transition` | FullScreenFrame | Scene/time change. `panels: []` (empty). Rendered as FullScreenFrame. |
| `skill-check` | SkillCheckFrame | Dice roll outcome. Data in `skillCheck` field. |
| `inventory` | InventoryFrame | Item inventory display. Data in `inventoryData` field. |
| `map` | MapFrame | Location map with clickable nodes. Supports region/area hierarchy. Data in `mapData`. |
| `character-sheet` | FullScreenFrame | Full character stats. Data in `characterSheet`. Rendered as FullScreenFrame. |
| `tactical-map` | TacticalMapFrame | Turn-based tactical combat grid. Data in `tacticalMapData`. Explicit branch in renderer. |

### VNFrame Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique frame identifier (descriptive slug) |
| `type` | FrameType | Yes | Layout type enum |
| `hud` | object | No | `{ chapter, scene, showNav }` — top bar overlay |
| `panels` | VNPanel[] | Yes | Visual panels (can be empty for transitions) |
| `dialogue` | object | No | `{ speaker, text, targetPanel, isNarrator?, position? }` |
| `narration` | object | No | `{ text, panelId? }` — no speaker attribution |
| `choices` | Choice[] | No | `{ id, text, hint? }` array |
| `showFreeTextInput` | boolean | No | Show free-text input below choices |
| `battle` | object | No | Player, enemies, combatLog, skills, round |
| `effects` | VNEffect[] | No | Visual effects to apply on render |
| `audio` | object | No | `{ musicAsset?, fadeIn?, stopMusic? }` |
| `transition` | object | No | `{ type, durationMs, titleCard? }` |
| `skillCheck` | object | No | `{ stat, statValue, difficulty, roll, modifier, total, succeeded, description }` |
| `inventoryData` | object | No | `{ items[], mode, prompt? }` |
| `mapData` | object | No | `{ backgroundAsset, currentLocationId, level, locations[] }` |
| `characterSheet` | object | No | `{ playerName, level, hp, maxHp, attributes, skills, statusEffects }` |
| `tacticalMapData` | object | No | Full combat state — see Tactical Combat section |
| `_meta` | object | No | Internal agent metadata (stripped before client delivery) |

### VNPanel Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `'left' \| 'right' \| 'center'` | Panel position identifier |
| `backgroundAsset` | string | Key into AssetPack.backgrounds |
| `characterAsset` | string | Key into AssetPack.characters |
| `characterFlipped` | boolean | Mirror character horizontally |
| `dimmed` | boolean | Apply inactive treatment |
| `panelWeight` | number | Flex weight (62 = active, 38 = inactive) |

---

## 4. Interactive Gameplay Frames

These frame types add non-dialogue interactions. The agent is instructed to alternate between narrative frames and these gameplay frames (no more than 3 consecutive pure-narrative frames).

### skill-check

Used when the player attempts something risky or uncertain.

1. Agent reads player stats via `playerStatsTool({ action: "read", sessionId })`
2. Agent picks attribute (strength/dexterity/intelligence/luck/charisma)
3. Computes: `modifier = floor((attr - 10) / 2)`, `roll = 1–20`, `total = roll + modifier`
4. Sets DC: easy=8, moderate=12, hard=16, very hard=20
5. Builds frame with `skillCheck: { stat, statValue, difficulty, roll, modifier, total, succeeded: total >= DC, description }`
6. Follows with narrative frames reacting to success/failure
7. If HP changes, calls `playerStatsTool({ action: "update", updates: { hp } })`

### inventory

Used when player finds an item, opens their pack, or needs to choose an item.

- **Give item**: `playerStatsTool({ action: "addItem", item: { id, name, description, icon, quantity: 1 } })`
- **Show inventory**: frame with `inventoryData` from a read call; `mode="view"` or `mode="select"`

### map

Used for navigation between locations.

```ts
mapData: {
  backgroundAsset: string,     // key into AssetPack.backgrounds
  currentLocationId: string,
  level: 'region' | 'area',    // see Layered Map below
  locations: [{
    id, label,
    x: number,   // 0-100 as % of frame width
    y: number,   // 0-100 as % of frame height
    accessible: boolean,
    visited?: boolean,
    description?: string,
    encounterType?: 'combat' | 'dialogue' | 'explore',
  }]
}
```

`MapFrame.tsx` supports pointer-drag panning (±300px), location node clicks, and encounter type icons (⚔️ combat, 💬 dialogue, 🔍 explore).

### Layered Map System

The map hierarchy flows: **Region Map → Area Map → Tactical Combat**

1. **Region Map** (`level='region'`): World overview. Locations are major areas (cities, forests, dungeons). Player clicks to choose destination.
2. **Area Map** (`level='area'`): Detailed local layout. Locations are specific points with `encounterType`. Player clicks to engage.
3. **Combat** (`encounterType='combat'`): When player selects a combat node, the agent calls `initCombatTool`, passes frameData to `frameBuilderTool`, and yields via `yieldToPlayer({ waitingFor: 'combat-result' })`.

---

## 5. Tactical Combat System

### Overview

Turn-based combat on a top-down SVG grid. The agent initiates combat and waits for the result; the client runs all combat logic client-side.

```
Agent calls initCombatTool
  → saves combat state to SQLite combat_states table
  → returns frameData with tacticalMapData
Agent calls frameBuilderTool with that frameData
Agent calls yieldToPlayer({ waitingFor: 'combat-result' })
  → client runs combat until end condition
  → client sends [combat-result] victory/defeat/escape {...}
Agent continues story based on outcome
```

For free-text interruption during combat:
```
Client sends: [combat-freetext][state:{...}] <text>
Agent calls combatEventTool to inject events (modify HP, add/remove tokens, etc.)
Agent calls frameBuilderTool with updated tactical-map frame
```

### TacticalMapData Schema

```ts
{
  mapImageUrl: string,        // base64 data URL from Gemini Imagen
  gridCols: number,           // default 12
  gridRows: number,           // default 8
  tokens: CombatToken[],
  terrain: TerrainCell[],
  combat: {
    round: number,
    phase: 'player' | 'enemy' | 'cutscene',
    turnOrder: string[],      // token IDs, player first
    activeTokenId: string,
    log: string[],
    isComplete: boolean,
    result?: 'victory' | 'defeat' | 'escape',
  },
  rules: {
    playerMoveRange: number,  // default 4
    playerAttackRange: number, // default 1
    showGrid: boolean,
  }
}
```

### CombatToken

| Field | Default | Description |
|-------|---------|-------------|
| `id` | — | Unique token ID |
| `type` | — | `'player' \| 'enemy' \| 'ally' \| 'objective' \| 'npc'` |
| `label` | — | Display name |
| `icon` | — | Emoji icon |
| `col`, `row` | — | Grid position |
| `hp`, `maxHp` | — | Health |
| `attack` | 4 | Attack power |
| `defense` | 10 | Defense class (DC to hit) |
| `moveRange` | 3 (4 for player) | Move range in cells (Manhattan distance) |
| `attackRange` | 1 | Attack range (Chebyshev distance) |
| `aiPattern` | — | `'aggressive' \| 'defensive' \| 'patrol' \| 'guard-objective'` |
| `patrolPath` | — | `[{ col, row }]` for patrol pattern |
| `hasActed`, `hasMoved` | false | Turn state |
| `statusEffects` | [] | Active status effect IDs |

### TerrainCell

| Type | Effect |
|------|--------|
| `blocked` | Cannot enter |
| `difficult` | Counts as 2 movement points |
| `hazard` | Damages tokens that enter |
| `cover` | Reduces hit chance |

### Combat Engine (`src/lib/combat/combatEngine.ts`)

| Function | Algorithm | Description |
|----------|-----------|-------------|
| `gridDistance(a, b)` | Chebyshev (max of Δcol, Δrow) | Distance for attack range |
| `manhattanDistance(a, b)` | \|Δcol\| + \|Δrow\| | Distance for move range |
| `getReachableCells(token, state)` | BFS up to moveRange (Manhattan) | Cells a token can move to |
| `getAttackableTargets(token, tokens, terrain)` | Chebyshev ≤ attackRange, not dead, not objective, not same team | Valid attack targets |
| `resolveAttack(attacker, defender)` | d20 + floor((atk−10)/2) vs defense | Returns `{ roll, modifier, total, hit, damage, log }` |
| `computeEnemyAction(token, state)` | Pattern-based AI | Returns next move+attack for an enemy token |
| `checkCombatEnd(tokens)` | All players dead → defeat; all enemies dead → victory | Combat end condition check |

### AI Patterns

| Pattern | Behavior |
|---------|----------|
| `aggressive` | Move toward nearest player; attack if in range |
| `defensive` | Attack if player is adjacent; otherwise hold position |
| `patrol` | Follow `patrolPath` in order; attack if player is adjacent |
| `guard-objective` | Stay near nearest objective; attack if player is adjacent |

### TacticalMapFrame (`src/components/vn/frames/TacticalMapFrame.tsx`)

- SVG grid overlaid on the generated map image; responsive via ResizeObserver
- Token rendering: emoji icon + HP bar (green >50%, yellow >25%, red ≤25%) + pulsing border for active token
- Interaction modes: `idle` → `move` (blue reachable cells) → `attack` (red targets)
- Enemy turns: 600ms delay, orange animation, auto-chains
- Combat log: 120px scrollable panel, last 20 entries
- Victory/defeat overlay with CONTINUE button
- Pointer-drag panning on grid background (±200px clamp)

### DB Table

```sql
CREATE TABLE IF NOT EXISTS combat_states (
  session_id TEXT PRIMARY KEY,
  combat_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);
```

Drizzle schema: `server/db/schema.ts` → `combatStates`

---

## 6. VNPackage Structure

**Source of truth**: `server/vn/types/vnTypes.ts`

The `VNPackage` is the complete game manifest produced by the Planning Agent.

### Top-Level Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique package identifier |
| `createdAt` | string | ISO 8601 timestamp |
| `title` | string | Story title |
| `genre` | string | Story genre |
| `language` | string | Locale code (`'en'`, `'zh-CN'`, etc.) — all generated text must match |
| `artStyle` | string | Art style description for image generation |
| `setting` | `{ world, era, tone }` | World-building metadata |
| `characters` | Character[] | All characters (min 1) |
| `plot` | Plot | Story structure |
| `assets` | AssetPack | All generated assets indexed by slug |
| `meta` | Meta | `{ totalScenes, estimatedDuration, generationMs }` |

### Character

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Stable identifier |
| `name` | string | Display name |
| `role` | `'protagonist' \| 'ally' \| 'antagonist' \| 'npc'` | Character role |
| `description` | string | Character description |
| `imagePrompt` | string | Prompt for image generation |

### Plot Structure

```
plot
  premise: string
  themes: string[]
  acts: Act[]           (min 1)
    id, title
    scenes: Scene[]
      id, title
      location: string  (key -> AssetPack.backgrounds)
      requiredCharacters: string[]
      beats: string[]   (ordered narrative guidance)
      exitConditions: string[]  (min 1)
      mood: string      (key -> AssetPack.music)
  possibleEndings: string[]  (min 1)
```

### AssetPack

```
assets
  backgrounds: Record<string, AssetRef>  (location-slug -> file URL)
  characters:  Record<string, AssetRef>  (char-slug -> transparent PNG URL)
  music:       Record<string, AssetRef>  (mood-slug -> PCM audio URL)
```

Each `AssetRef` contains `{ url: string, mimeType: string }`.

### PlotState (Runtime)

Tracks player position within a session:

| Field | Type | Description |
|-------|------|-------------|
| `sessionId` | string | Active session |
| `packageId` | string | Which VNPackage is loaded |
| `currentActId` | string | Current act |
| `currentSceneId` | string | Current scene |
| `currentBeat` | number | Beat index within scene |
| `offPathTurns` | number | Consecutive off-plot turns |
| `completedScenes` | string[] | Scene IDs completed |
| `flags` | Record | Arbitrary state flags |

### PlayerStats (Runtime)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `sessionId` | string | — | Active session |
| `hp`, `maxHp` | number | 20/20 | Hit points |
| `strength`, `dexterity`, `intelligence`, `luck`, `charisma` | number | 10 | D&D-style attributes |
| `level` | number | 1 | Player level |
| `experience` | number | 0 | XP |
| `gold` | number | 0 | Currency |
| `inventory` | Item[] | [] | Carried items |
| `statusEffects` | StatusEffect[] | [] | Active effects |
| `newPlayerStatus` | string? | — | Freeform narrative status (e.g. "Poisoned by the river spirit") |

---

## 7. Agent System

### Planning Agent (`server/vn/agents/planningChatAgent.ts`)

**Phase 1 — Research + Story Plan**
- Uses Google Search grounding for world-building research
- Produces: title, artStyle, characters[], acts/scenes, asset manifest

**Phase 2 — Asset Generation (parallel)**
- Generates all images and music in parallel
- Saves files to `public/generated/{packageId}/`

**Phase 3 — Package Assembly**
- Attaches assets, id, timestamps, produces final VNPackage

### Storyteller Agent (`server/vn/agents/storytellerChatAgent.ts`)

Per-turn `ToolLoopAgent` that stops when `yieldToPlayer` or `sceneCompleteTool` is called.

**Turn workflow:**
1. `plotStateTool` — read `nextBeat`, `exitConditions`, `nudge`
2. `frameBuilderTool` × 2–5 — build frames covering the current beat
3. If `exitConditions` met → `sceneCompleteTool` (ends loop)
4. Otherwise → `yieldToPlayer({ waitingFor: ... })` (ends loop)

**System prompt generation** (`buildDMSystemPrompt`):
- Frame types section: dynamically generated from `FRAME_REGISTRY.map(e => \`- '${e.type}': ${e.agentSummary}\``)`
- Interactive gameplay section: dynamically generated from registry entries that have `agentWorkflow`, with `SESSION_ID` replaced by the actual sessionId

---

## 8. Storyteller Agent Tools

All tools use `tool()` from Vercel AI SDK v5 with Zod parameter schemas.

| Tool | File | Description |
|------|------|-------------|
| `plotStateTool` | `server/vn/tools/plotStateTool.ts` | Read narrative state: nextBeat, exitConditions, nudge, completedScenes |
| `frameBuilderTool` | `server/vn/tools/frameBuilderTool.ts` | Build + validate one VNFrame; normalizes legacy format |
| `sceneCompleteTool` | `server/vn/tools/sceneCompleteTool.ts` | Mark scene done, return nextSceneId/nextActId |
| `yieldToPlayerTool` | `server/vn/tools/yieldToPlayerTool.ts` | End the agent loop; `waitingFor: 'choice' \| 'free-text' \| 'continue' \| 'combat-result'` |
| `playerStatsTool` | `server/vn/tools/playerStatsTool.ts` | `read \| update \| addItem \| removeItem` player stats |
| `initCombatTool` | `server/vn/tools/initCombatTool.ts` | Init combat: generate map image, set up tokens, save to DB |
| `combatEventTool` | `server/vn/tools/combatEventTool.ts` | Inject events into active combat (modify HP, add/remove tokens, terrain, log, end) |

### `frameBuilderTool` — Normalization

Accepts VNFrame in canonical form, legacy form, or either wrapped in `{ frame: ... }`. Legacy-to-canonical normalization:
- Panel `position`/`id` inference
- `background` string → `panel.backgroundAsset`
- `assetKey` → `characterAsset` (filters bg keys)
- Object effects (`{ shake: true }`) → `VNEffect[]`
- Narration fallback injection for `requiresNarration` types via `FRAME_REGISTRY_MAP`

### `initCombatTool` — Token Setup Guidelines

```
- Player token: type='player', place at left side (col 1-2), hp from playerStatsTool
- Enemies: type='enemy', varied positions on right side
- Objectives: type='objective', icon='⭐' or relevant emoji, at strategic locations
- Terrain: add 3-6 cells for cover/obstacles
```

### `combatEventTool` — Event Types

| Event | Fields | Effect |
|-------|--------|--------|
| `modify_hp` | `tokenId, delta` | Clamped to `[0, maxHp]`; auto-logs defeat |
| `add_token` | `token` | Adds token with defaults; logs entry |
| `remove_token` | `tokenId` | Removes token from state |
| `add_terrain` | `col, row, terrainType` | Adds terrain cell |
| `log_message` | `message` | Appends to combat log |
| `end_combat` | `result, message` | Sets `isComplete=true`, records result |

---

## 9. Asset System

### Storage

- Assets are stored as files on disk: `public/generated/{packageId}/`
- Images: `.png` files (backgrounds + characters)
- Music: `.pcm` files (16-bit PCM audio)
- Served by `@fastify/static`

### Resolution

```ts
// src/lib/resolveAsset.ts
resolveAsset(key, pack) -> URL string or '/assets/placeholder.png'
```

Looks up `pack.assets.backgrounds[key]` then `pack.assets.characters[key]`. Returns placeholder for unknown keys.

### Map Image Generation (Tactical Combat)

`initCombatTool` calls `generateSceneImage(prompt, { aspectRatio: '16:9' })` with a "top-down tactical RPG battle map, bird's eye view" prompt. The result is a base64 data URL stored in `tacticalMapData.mapImageUrl`. Falls back to empty string (dark placeholder) on error.

---

## 10. Effect Types

| Effect | CSS Implementation | Targets |
|--------|-------------------|---------|
| `shake` | `translateX` oscillation keyframe | screen, left, right, center |
| `flash` | Absolute overlay div, `opacity: 1 → 0` | screen, left, right, center |
| `fade-in` | Frame wrapper `opacity: 0 → 1` | screen |
| `fade-out` | Frame wrapper `opacity: 1 → 0` | screen |
| `scan-lines` | `repeating-linear-gradient` overlay toggle | screen |
| `vignette-pulse` | Radial gradient overlay with pulse animation | screen |

All effects auto-clear after `durationMs`. Optional `intensity` (0–1) and `color` (CSS string).

---

## 11. Internationalisation (i18n)

**Source of truth**: `src/lib/i18n.ts`

All UI strings use `t(key, locale)`. The `VNPackage.language` field drives the agent's output language — all generated dialogue, narration, choice text, item names, etc. must be in that language.

Currently supported locales: `en`, `zh-CN`.

UI keys include: `dm_thinking`, `round_label`, `retreat`, `map_title`, `map_title_region`, `map_title_area`, `end_turn`, and frame-specific strings.

---

## 12. Design Values

### Layout

| Property | Value |
|----------|-------|
| Frame aspect ratio | 16:9 (1144 × 644px reference) |
| HUD height | 48px |
| Control bar height | 52px |
| Font family | `'VT323', 'Courier New', monospace` |

### Panel Accordion (Dialogue)

| State | Flex | Filter | Character Opacity |
|-------|------|--------|-------------------|
| Active | `0 0 62%` | none | 1.0 |
| Inactive | `0 0 38%` | `grayscale(1) brightness(.22)` | 0.28 |
| Transition | `all 0.35s ease` | — | — |

### Three-Panel Layout

| Panel | Width |
|-------|-------|
| Left | 27% |
| Center | flex: 1 (~46%) |
| Right | 27% |

### Text Boxes

| Property | Value |
|----------|-------|
| Dialogue box bg | `rgba(0,0,0,.68)` |
| Dialogue box border | `1px solid rgba(255,255,255,.12)` |
| Border radius | 4px |
| Character name color | `rgba(255,198,70,.9)` |
| Narrator label color | `rgba(140,210,255,.7)` |
| Text size | 18px |

---

## 13. API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/vn/plan` | SSE stream for plan phase progress |
| POST | `/api/vn/tell-chat` | Submit player action, receive `{ frames, pendingSceneComplete }` |
| GET | `/api/vn/sessions/:sessionId` | Get current session state |
| GET | `/api/vn/debug/trace/:sessionId` | Dev: raw agent trace |

### Tell-Chat Request/Response

**Request** (POST `/api/vn/tell-chat`):
```json
{
  "sessionId": "string",
  "packageId": "string",
  "playerAction": "string"
}
```

**Response**:
```json
{
  "frames": [ VNFrame, ... ],
  "pendingSceneComplete": "nextSceneId | null | undefined"
}
```

Special `playerAction` prefixes:
- `[combat-result] victory|defeat|escape {...}` — result from client-side combat
- `[combat-freetext][state:{...}] <text>` — player free text during combat; triggers `combatEventTool`

---

## 14. Test Coverage

### Test Summary

| Suite | File | Count |
|-------|------|-------|
| VNFrame schema | `tests/vnFrame.spec.ts` | 11 |
| VNPackage schema | `tests/vnPackage.spec.ts` | 7 |
| Asset resolution | `tests/resolveAsset.spec.ts` | 6 |
| Frame effects | `tests/FrameEffects.spec.tsx` | 7 |
| FullScreenFrame | `tests/frames/FullScreenFrame.spec.tsx` | 4 |
| DialogueFrame | `tests/frames/DialogueFrame.spec.tsx` | 6 |
| ThreePanelFrame | `tests/frames/ThreePanelFrame.spec.tsx` | 3 |
| ChoiceFrame | `tests/frames/ChoiceFrame.spec.tsx` | 5 |
| BattleFrame | `tests/frames/BattleFrame.spec.tsx` | 6 |
| frameBuilderTool | `tests/frameBuilderTool.spec.ts` | 10 |
| VNFrame payload | `tests/frames/` | varies |
| Plot state | `tests/plotState.spec.ts` | 7 |
| Combat engine | `tests/combatEngine.spec.ts` | 43 |
| TacticalMapFrame | `tests/tacticalMapFrame.spec.tsx` | 6 |
| Design parity | `tests/designParity.spec.ts` | 12 |

**Total: 87+ passing tests**

### TypeScript Enforcement

Adding a new `FrameType` to `FrameTypeSchema` but not to `CLIENT_FRAME_REGISTRY` causes a TypeScript error at the `Record<FrameType, ClientFrameEntry>` definition, preventing missing-case regressions.

---

## 15. File Structure

```
server/
  vn/
    types/
      vnFrame.ts              # VNFrame Zod schema + FrameTypeSchema (source of truth)
      vnTypes.ts              # VNPackage, Character, AssetPack, PlotState, PlayerStats
    frameRegistry.ts          # Server-side frame registry (agent docs, requiresNarration, dataField)
    tools/
      frameBuilderTool.ts     # Build + validate one VNFrame; normalizes legacy format
      plotStateTool.ts        # Read beat state, return nudge
      sceneCompleteTool.ts    # Mark scene done, get next
      yieldToPlayerTool.ts    # End agent loop, signal client
      playerStatsTool.ts      # Read/update player stats + inventory
      initCombatTool.ts       # Init tactical combat: image gen + token setup + DB write
      combatEventTool.ts      # Inject events into active combat
    agents/
      storytellerChatAgent.ts # ToolLoopAgent: per-turn frame generation
      planningChatAgent.ts    # Multi-phase: research -> assets -> structure
    routes/
      vnChatRoute.ts          # POST /api/vn/tell-chat
      vnPlanRoute.ts          # GET /api/vn/plan (SSE)
  db/
    schema.ts                 # Drizzle SQLite schema (plot_states, player_stats, combat_states, ...)
    index.ts                  # Drizzle instance + inline migrations
  agents/
    imageAgent.ts             # Gemini image generation
    musicAgent.ts             # Music generation

src/
  lib/
    resolveAsset.ts           # Asset key -> file URL resolution
    i18n.ts                   # Locale strings (en, zh-CN)
    frameRegistry.tsx         # Client-side registry: Record<FrameType, ClientFrameEntry>
    combat/
      types.ts                # CombatToken, TacticalMapData, CombatAction types
      combatEngine.ts         # gridDistance, resolveAttack, computeEnemyAction, checkCombatEnd
      combatReducer.ts        # useReducer: MOVE, ATTACK, END_TURN, ENEMY_TURN, APPLY_EXTERNAL
  components/vn/
    FrameEffects.tsx          # CSS effect overlay
    VNRenderer.tsx            # Frame queue + input handler; uses resolveFrameEntry()
    frames/
      FullScreenFrame.tsx
      DialogueFrame.tsx
      ThreePanelFrame.tsx
      ChoiceFrame.tsx
      BattleFrame.tsx
      SkillCheckFrame.tsx
      InventoryFrame.tsx
      MapFrame.tsx            # Location map with pan, layered level support
      TacticalMapFrame.tsx    # SVG grid, token interaction, enemy AI, combat log
  pages/
    VNPlanPage.tsx            # Genre/setting form + SSE progress
    VNEnginePage.tsx          # Full-screen VN renderer session
    VNFramePreviewPage.tsx    # Dev: frame design system browser
    VNProjectsPage.tsx        # Package library

docs/
  vn-engine-spec.md           # This file
  automatic-testing.md        # Test flow guide
  ai-tracing.md               # Agent tracing / debug

tests/
  vnFrame.spec.ts
  vnPackage.spec.ts
  resolveAsset.spec.ts
  frameBuilderTool.spec.ts
  plotState.spec.ts
  combatEngine.spec.ts
  tacticalMapFrame.spec.tsx
  designParity.spec.ts
  FrameEffects.spec.tsx
  VNRenderer.spec.tsx
  frames/
    FullScreenFrame.spec.tsx
    DialogueFrame.spec.tsx
    ThreePanelFrame.spec.tsx
    ChoiceFrame.spec.tsx
    BattleFrame.spec.tsx
  agents/
    planningAgent.spec.ts
    storytellerAgent.spec.ts
```
