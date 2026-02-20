# Visual Novel Engine Specification

## 1. Overview

The VN Engine is a two-phase system built on top of the AI Dungeon project. It uses AI agents (powered by Vercel AI SDK v5 + Gemini) to generate and run interactive visual novel experiences.

### Two Phases

1. **Plan Phase** -- The Planning Agent researches context (via web search), creates a full story structure, generates all visual and audio assets, and produces a `VNPackage` (game manifest).
2. **Story Phase** -- The Storyteller Agent handles player input each turn, calls tools to build `VNFrame[]` sequences, and maintains plot integrity through beat tracking.

### Architecture

- **Backend**: Fastify server with SSE streaming, SQLite persistence (Drizzle ORM)
- **Frontend**: React + TanStack Router, pure JSON consumer (no agent logic in the client)
- **AI Framework**: Vercel AI SDK v6 (`ai`, `@ai-sdk/google`, `@ai-sdk/react`)
- **Search**: Native Google Search grounding via `google.tools.googleSearch({})` from `@ai-sdk/google`
- **Assets**: File-based (PNG images, PCM audio) served by `@fastify/static`

---

## 2. VNFrame Contract

**Source of truth**: `server/vn/types/vnFrame.ts`

A `VNFrame` is a single screen state in the visual novel. The React renderer selects a layout component based on `frame.type`.

### 6 Layout Types

| Type | Component | Panels | Primary Content |
|------|-----------|--------|-----------------|
| `full-screen` | FullScreenFrame | 1 (center) | Narration box, atmosphere |
| `dialogue` | DialogueFrame | 2 (left/right) | Speaker bubble + listener, accordion layout |
| `three-panel` | ThreePanelFrame | 3 (left/center/right) | Multi-character, center narration |
| `choice` | ChoiceFrame | 1+ | Choice buttons, optional free-text input |
| `battle` | BattleFrame | 1 | Player portrait, enemies, combat log, skill grid |
| `transition` | (CSS transition) | 0 | Crossfade/wipe/black-cut between scenes |

### VNFrame Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique frame identifier |
| `type` | FrameType | Yes | Layout type enum |
| `hud` | object | No | `{ chapter, scene, showNav }` -- top bar overlay |
| `panels` | VNPanel[] | Yes | Visual panels (can be empty for transitions) |
| `dialogue` | object | No | `{ speaker, text, targetPanel, isNarrator?, position? }` |
| `narration` | object | No | `{ text, panelId? }` -- no speaker attribution |
| `choices` | Choice[] | No | `{ id, text, hint? }` array |
| `showFreeTextInput` | boolean | No | Show free-text input below choices |
| `battle` | object | No | Player, enemies, combatLog, skills, round |
| `effects` | VNEffect[] | No | Visual effects to apply on render |
| `audio` | object | No | `{ musicAsset?, fadeIn?, stopMusic? }` |
| `transition` | object | No | `{ type, durationMs, titleCard? }` |
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

## 3. VNPackage Structure

**Source of truth**: `server/vn/types/vnTypes.ts`

The `VNPackage` is the complete game manifest produced by the Planning Agent.

### Top-Level Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique package identifier |
| `createdAt` | string | ISO 8601 timestamp |
| `title` | string | Story title |
| `genre` | string | Story genre |
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

---

## 4. Agent System

### Planning Agent (3-phase, `server/vn/agents/planningAgent.ts`)

**Phase 1 -- Research + Story Plan**
- Uses `generateObject` with `webSearchTool`
- Up to 5 web searches + 1 final structured output
- Produces: title, artStyle, characters[], acts/scenes, asset manifest

**Phase 2 -- Asset Generation (parallel, no LLM)**
- Generates all images and music in parallel
- Saves files to `public/generated/{packageId}/`
- Returns `AssetRef` URLs for each asset

**Phase 3 -- Package Assembly**
- Uses `generateObject` to produce final VNPackage structure
- Attaches assets, id, timestamps

### Storyteller Agent (per-turn, `server/vn/agents/storytellerAgent.ts`)

- Uses `generateText` (non-streaming, 5-15s per turn)
- Tool loop: `plotStateTool` -> `frameBuilderTool` x N -> `sceneCompleteTool?` -> finish
- Collects frames from tool call results
- Returns `{ frames, newBeatIndex, sceneComplete, nextSceneId? }`

---

## 5. Tools

All tools use `tool()` from Vercel AI SDK v5 with Zod parameter schemas.

### Planning Agent Tools

| Tool | File | Parameters | Description |
|------|------|------------|-------------|
| `webSearchTool` | `server/vn/tools/webSearchTool.ts` | `{ query, maxResults }` | Tavily web search for world-building |
| `imageGenTool` | `server/vn/tools/imageGenTool.ts` | `{ assetId, prompt, type, aspectRatio }` | Generate scene/character image |
| `musicGenTool` | `server/vn/tools/musicGenTool.ts` | `{ assetId, prompts[], durationSeconds, bpm? }` | Generate ambient music track |

### Storyteller Agent Tools

| Tool | File | Parameters | Description |
|------|------|------------|-------------|
| `frameBuilderTool` | `server/vn/tools/frameBuilderTool.ts` | VNFrame (minus `_meta`) | Build and validate one VNFrame |
| `plotStateTool` | `server/vn/tools/plotStateTool.ts` | `{ sessionId, currentSceneId }` | Read narrative state, beats, nudge |
| `sceneCompleteTool` | `server/vn/tools/sceneCompleteTool.ts` | `{ sessionId, completedSceneId }` | Mark scene done, get next scene |

---

## 6. Asset System

### Storage

- Assets are stored as files on disk: `public/generated/{packageId}/`
- Images: `.png` files (backgrounds + characters)
- Music: `.pcm` files (16-bit PCM audio)
- Served by `@fastify/static` middleware

### Naming Convention

```
public/generated/{packageId}/{assetId}.png   (backgrounds)
public/generated/{packageId}/{charId}.png    (characters, transparent)
public/generated/{packageId}/{moodId}.pcm    (music)
```

### Resolution

```ts
// src/lib/resolveAsset.ts
resolveAsset(key, pack) -> URL string or '/assets/placeholder.png'
```

Looks up `pack.assets.backgrounds[key]` first, then `pack.assets.characters[key]`. Returns placeholder for unknown/undefined keys.

---

## 7. Effect Types

| Effect | CSS Implementation | Targets |
|--------|-------------------|---------|
| `shake` | `translateX` oscillation keyframe | screen, left, right, center |
| `flash` | Absolute overlay div, `opacity: 1 -> 0` | screen, left, right, center |
| `fade-in` | Frame wrapper `opacity: 0 -> 1` transition | screen |
| `fade-out` | Frame wrapper `opacity: 1 -> 0` transition | screen |
| `scan-lines` | `repeating-linear-gradient` overlay toggle | screen |
| `vignette-pulse` | Radial gradient overlay with pulse animation | screen |

All effects auto-clear after `durationMs`. Optional `intensity` (0-1) and `color` (CSS string).

---

## 8. Design Values (from `public/vn-system.html`)

### Layout

| Property | Value |
|----------|-------|
| Frame aspect ratio | 16:9 (1144 x 644px reference) |
| HUD height | 48px |
| Control bar height | 52px |
| Font family | `'VT323', 'Courier New', monospace` |

### Panel Accordion (Dialogue)

| State | Flex | Filter | Character Opacity |
|-------|------|--------|-------------------|
| Active | `0 0 62%` | none | 1.0 |
| Inactive | `0 0 38%` | `grayscale(1) brightness(.22)` | 0.28 |
| Transition | `all 0.35s ease` | -- | -- |

### Three-Panel Layout

| Panel | Width |
|-------|-------|
| Left | 27% |
| Center | flex: 1 (46%) |
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
| Text color | `rgba(255,255,255,.9)` |

### Choice Buttons

| Property | Value |
|----------|-------|
| Background | `rgba(0,0,0,.68)` |
| Border | `1px solid rgba(255,255,255,.1)` |
| Border radius | 4px |
| Selected bg | `rgba(255,255,255,.1)` |
| Selected border | `rgba(255,255,255,.28)` |

### Battle Action Bar

| Property | Value |
|----------|-------|
| Grid columns | `160px 1fr 220px` |
| Width | 68% of frame |
| Avatar size | 58px circle |
| Skill grid | 2x2 (`grid-template-columns: 1fr 1fr`) |

---

## 9. API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/vn/plan` | SSE stream for plan phase progress |
| POST | `/api/vn/tell` | Submit player action, receive VNFrame[] |
| GET | `/api/vn/:packageId/story-map` | Dev endpoint: ASCII story tree |

### Plan Phase SSE Events

```
data: { "type": "phase", "phase": "research", "message": "..." }
data: { "type": "progress", "message": "Generated background: harbor-night" }
data: { "type": "phase", "phase": "assets", "message": "..." }
data: { "type": "phase", "phase": "assembly", "message": "..." }
data: { "type": "complete", "packageId": "...", "package": { ... } }
data: { "type": "error", "message": "..." }
```

### Tell Phase Request/Response

**Request** (POST `/api/vn/tell`):
```json
{
  "sessionId": "string",
  "packageId": "string",
  "playerAction": "string",
  "choiceId": "string (optional)"
}
```

**Response**:
```json
{
  "frames": [ VNFrame, ... ],
  "newBeatIndex": 3,
  "sceneComplete": false,
  "nextSceneId": null
}
```

---

## 10. Test Coverage Map

### Passing Tests (schema validation)

| File | Section | Tests |
|------|---------|-------|
| `tests/vnFrame.spec.ts` | 7.1 VNFrame Contract | 11 tests |
| `tests/vnPackage.spec.ts` | 7.2 VNPackage Schema | 7 tests |
| `tests/resolveAsset.spec.ts` | 7.3 Asset Resolution | 6 tests |

### Test Stubs (it.todo)

| File | Section | Stubs |
|------|---------|-------|
| `tests/FrameEffects.spec.tsx` | 7.4 Effect System | 7 stubs |
| `tests/frames/FullScreenFrame.spec.tsx` | 7.5 Full Screen | 4 stubs |
| `tests/frames/DialogueFrame.spec.tsx` | 7.5 Dialogue | 6 stubs |
| `tests/frames/ThreePanelFrame.spec.tsx` | 7.5 Three Panel | 3 stubs |
| `tests/frames/ChoiceFrame.spec.tsx` | 7.5 Choice | 5 stubs |
| `tests/frames/BattleFrame.spec.tsx` | 7.5 Battle | 6 stubs |
| `tests/VNRenderer.spec.tsx` | 7.6 VNRenderer | 10 stubs |
| `tests/plotState.spec.ts` | 7.7 Plot State | 7 stubs |
| `tests/agents/planningAgent.spec.ts` | 7.8 Planning Agent | 5 stubs |
| `tests/agents/storytellerAgent.spec.ts` | 7.8 Storyteller Agent | 6 stubs |
| `tests/designParity.spec.ts` | 7.9 Design Parity | 12 stubs |

**Total: 24 passing tests, 71 todo stubs**

---

## File Structure

```
server/
  vn/
    types/
      vnFrame.ts          # VNFrame Zod schema + types (source of truth)
      vnTypes.ts          # VNPackage, Character, AssetPack, PlotState
    tools/
      webSearchTool.ts    # Tavily search
      imageGenTool.ts     # Wraps imageAgent.ts
      musicGenTool.ts     # Wraps musicAgent.ts
      frameBuilderTool.ts # Build + validate one VNFrame
      plotStateTool.ts    # Read beat state, return nudge
      sceneCompleteTool.ts# Mark scene done, get next
    agents/
      planningAgent.ts    # 3-phase: research -> assets -> structure
      storytellerAgent.ts # Per-turn: tool loop -> frames
    workflows/
      planPhase.ts        # SSE streaming orchestration
      tellPhase.ts        # Storyteller orchestration
    routes/
      planRoute.ts        # GET /api/vn/plan (SSE)
      tellRoute.ts        # POST /api/vn/tell
    state/
      vnPackageStore.ts   # In-memory Map<packageId, VNPackage>
      plotStateStore.ts   # In-memory Map<sessionId, PlotState>
    utils/
      storyVisualizer.ts  # ASCII tree + progress graph
  db/
    schema.ts             # Drizzle SQLite schema
    index.ts              # Drizzle instance
  agents/
    imageAgent.ts         # Image generation (kept)
    musicAgent.ts         # Music generation (kept)
  index.ts                # Fastify server entry

src/
  lib/
    resolveAsset.ts       # Asset key -> file URL resolution
  components/vn/
    FrameEffects.tsx       # CSS effect overlay
    frames/
      FullScreenFrame.tsx
      DialogueFrame.tsx
      ThreePanelFrame.tsx
      ChoiceFrame.tsx
      BattleFrame.tsx
    VNRenderer.tsx         # Frame queue + input handler
  context/
    VNContext.tsx           # VNPackage + session state
  pages/
    VNPlanPage.tsx          # Genre/setting form + SSE progress
    VNEnginePage.tsx        # Full-screen renderer

docs/
  vn-engine-spec.md        # This file

tests/
  vnFrame.spec.ts
  vnPackage.spec.ts
  resolveAsset.spec.ts
  FrameEffects.spec.tsx
  VNRenderer.spec.tsx
  plotState.spec.ts
  designParity.spec.ts
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
