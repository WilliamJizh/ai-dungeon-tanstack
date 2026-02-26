<!-- KEEP-IN-SYNC: Update this file when modifying any file under server/vn/ -->

# VN Engine — Project Reference

Visual Novel engine powering AI-driven interactive storytelling. Two-phase architecture: **Planning** (collaborative story design) → **Gameplay** (DM-driven narrative with frames).

> Agent-specific docs: [planning-agent.md](agents/planning-agent.md) | [storyteller-agent.md](agents/storyteller-agent.md)

---

## Directory Layout

```
server/vn/
├── agents/                    # AI agent definitions (planning + storyteller)
│   ├── planningChatAgent.ts   # Story co-author agent
│   ├── storytellerChatAgent.ts# Gameplay DM agent
│   ├── planning-agent.md      # Planning agent reference
│   └── storyteller-agent.md   # Storyteller agent reference
├── tools/                     # AI SDK tool definitions
│   ├── planningTools.ts       # 6 tools for story building
│   ├── frameBuilderTool.ts    # VNFrame construction + validation
│   ├── plotStateTool.ts       # Read narrative position
│   ├── yieldToPlayerTool.ts   # Signal turn end
│   ├── sceneCompleteTool.ts   # Advance to next scene
│   ├── playerStatsTool.ts     # CRUD player stats/inventory
│   ├── initCombatTool.ts      # Initialize tactical combat
│   ├── combatEventTool.ts     # Inject combat events
│   ├── imageGenTool.ts        # Generate scene/character images
│   └── musicGenTool.ts        # Generate ambient music
├── types/
│   ├── vnTypes.ts             # VNPackage, AssetPack, PlotState, Character, Act, Scene
│   ├── vnFrame.ts             # VNFrame, VNPanel, VNEffect, FrameType (12 types)
│   └── playerTypes.ts         # PlayerStats, Item, StatusEffect
├── state/
│   ├── planSessionStore.ts    # In-memory planning sessions
│   ├── vnPackageStore.ts      # In-memory package cache
│   └── plotStateStore.ts      # In-memory plot state cache
├── routes/
│   ├── planChatRoute.ts       # POST /chat (planning SSE)
│   ├── tellChatRoute.ts       # POST /tell-chat (gameplay SSE)
│   ├── projectsRoute.ts       # GET /projects, GET /projects/:id
│   └── storyMapRoute.ts       # GET /story-map/:id (ASCII tree)
├── workflows/                 # Workflow orchestration
├── utils/
│   └── storyVisualizer.ts     # renderStoryTree() ASCII visualization
├── frameRegistry.ts           # Frame type metadata + agent workflow guidance
└── CLAUDE.md                  # This file
```

## Tech Stack

- **AI SDK**: `ToolLoopAgent` from Vercel AI SDK
- **Model**: Google Gemini (via `getGoogleModel()`)
- **Validation**: Zod schemas for all inputs/outputs
- **Database**: SQLite via Drizzle ORM (`server/db/`)
- **API**: Fastify with SSE streaming (`createAgentUIStreamResponse`)
- **Assets**: Generated images (PNG) + music (PCM/WAV) stored under `/public/generated/{packageId}/`

---

## Two-Phase Architecture

```
PLANNING PHASE                          GAMEPLAY PHASE
─────────────                           ──────────────
User ↔ Planning Agent                   User ↔ Storyteller Agent
  │                                       │
  ├─ proposeStoryPremise                  ├─ plotStateTool() ← read beat/exits
  ├─ proposeCharacter (+ image gen)       ├─ frameBuilderTool() × 3-5
  ├─ proposeAct                           ├─ playerStatsTool() (optional)
  ├─ proposeScene (+ image + music gen)   ├─ sceneCompleteTool() (if exits met)
  ├─ updateElement                        └─ yieldToPlayerTool() ← end turn
  └─ finalizePackage()
      │                                 Player choice/action → next turn
      ▼
  VNPackage saved to DB ──────────────→ Loaded by storyteller
```

---

## Core Types

### VNPackage (`types/vnTypes.ts`)

The complete story manifest. Immutable after planning.

```typescript
VNPackage {
  id: string                          // nanoid
  title, genre, artStyle: string
  language: string                    // BCP-47: 'en' | 'zh-CN'
  setting: { world, era, tone }
  characters: Character[]             // id, name, role, description, imagePrompt
  plot: {
    premise: string
    themes: string[]
    globalMaterials?: string[]        // Reusable narrative anchors
    acts: Act[]                       // Each act has scenes[]
    possibleEndings: string[]         // 2-3 ending categories
  }
  assets: AssetPack                   // backgrounds, characters, music keyed by slug
  meta: { totalScenes, estimatedDuration, generationMs }
}
```

### Character

```typescript
{ id: string, name: string, role: 'protagonist'|'ally'|'antagonist'|'npc', description: string, imagePrompt: string }
```

### SceneDefinition

```typescript
{
  id, title, location: string         // location = key into AssetPack.backgrounds
  requiredCharacters: string[]        // Character IDs
  beats: string[]                     // Ordered narrative beats (min 1)
  interactables?: string[]            // Items player can examine
  findings?: string[]                 // Clues pointing to next nodes
  callbacks?: string[]                // DM instructions to re-use globalMaterials
  exitConditions: string[]            // Conditions that end this scene (min 1)
  mood: string                        // Key into AssetPack.music
}
```

### AssetPack

```typescript
{
  backgrounds: Record<slug, { url: string, mimeType: string }>
  characters:  Record<slug, { url: string, mimeType: string }>
  music:       Record<slug, { url: string, mimeType: string }>
}
```

### PlotState (runtime)

```typescript
{
  sessionId, packageId: string
  currentActId, currentSceneId: string
  currentBeat: number                 // Index into scene.beats[]
  offPathTurns: number                // Tracks player deviation from beats
  completedScenes: string[]
  flags: Record<string, unknown>      // Story flags set during gameplay
}
```

### conversation[] (VNFrame field)

Ordered conversation lines within one frame. Replaces single `dialogue` for multi-speaker scenes. Discriminated union — two entry shapes:

```typescript
conversation?: Array<
  | { speaker: string; text: string; effect?: VNEffect }   // Dialogue spoken aloud → speech bubble
  | { narrator: string; effect?: VNEffect }                 // Action, thought, stage direction → narrator box
>
```

Panels define who is present (up to 3). The renderer auto-shifts panel focus by matching `speaker` to the panel's `characterAsset`. `{narrator}` entries render as narrator text boxes without shifting panel focus.

### narrations[] (VNFrame field)

Array of narration beats the player clicks through on the same visual. Replaces single `narration`.

```typescript
narrations?: Array<{
  text: string
  effect?: VNEffect     // Per-line effect triggered when this beat appears
}>
```

> **Deprecation note**: The singular `dialogue` and `narration` fields still work for backward compatibility but new frames should use `conversation[]` and `narrations[]`.

### PlayerStats (`types/playerTypes.ts`)

```typescript
{
  name: string, level: number
  hp, maxHp: number
  attributes: { strength, dexterity, intelligence, luck, charisma: number }
  skills: string[]
  statusEffects: StatusEffect[]       // { id, name, type, description, turnsRemaining?, icon? }
  items: Item[]                       // { id, name, description, icon, quantity, equipped?, effect? }
}
// Defaults: level=1, hp=20, all attributes=8
```

---

## Frame Types (`types/vnFrame.ts`)

12 frame types rendered by the client. Each frame has `id`, `type`, `panels[]`, and type-specific data.

| Type | Panels | Key Fields | Purpose |
|------|--------|------------|---------|
| `full-screen` | 1 (center) | `narrations[]`, `effects`, `audio` | Atmosphere, reveals |
| `dialogue` | 2 (active 62%, inactive 38%) | `conversation[]` (or legacy `dialogue.speaker/text/targetPanel`) | Character speech |
| `three-panel` | 3 (left/center/right) | `conversation[]`, `narrations[]` | Multi-character scenes |
| `choice` | 1-2 | `choices[]`, `showFreeTextInput` | Player decision point |
| `battle` | any | `battle: { player, enemies, combatLog, skills, round }` | Legacy combat |
| `transition` | 0 | `transition: { type, durationMs, titleCard? }` | Scene/time change |
| `dice-roll` | any | `diceRoll: { diceNotation, roll?, description? }` | Physics dice animation |
| `skill-check` | any | `skillCheck: { stat, statValue, difficulty, roll, modifier, total, succeeded, description }` | Ability check result |
| `inventory` | any | `inventoryData: { items[], mode, prompt? }` | Item display/selection |
| `map` | any | `mapData: { backgroundAsset, currentLocationId, level?, locations[] }` | Location navigation |
| `character-sheet` | any | `characterSheet: { playerName, level, hp, maxHp, attributes, skills, statusEffects }` | Stats display |
| `tactical-map` | 0 | `tacticalMapData: { mapImageUrl, gridCols, gridRows, tokens[], terrain[], combat, rules }` | Turn-based grid combat |

### VNPanel

```typescript
{ id: 'left'|'right'|'center', backgroundAsset?, characterAsset?, characterFlipped?, dimmed?, panelWeight? }
```

### VNEffect

```typescript
{ type: EffectType, target?: 'screen'|'left'|'right'|'center', durationMs: number, intensity?: 0-1, color?: string }
```

Effects can be applied at two levels:
- **Per-frame**: `effects[]` on the VNFrame — triggers when the frame first renders.
- **Per-line**: `effect` on individual `conversation[]` or `narrations[]` entries — triggers when that specific line appears during typewriter playback.

#### 30 Effect Types (5 categories)

| Category | Effects | Example Use |
|----------|---------|-------------|
| **Camera/Motion** | `shake`, `zoom-in`, `zoom-out`, `pan-left`, `pan-right` | Impact, close-up, reveal, tracking |
| **Light/Color** | `flash`, `fade-in`, `fade-out`, `bloom`, `sepia`, `grayscale`, `color-shift` | Lightning, transitions, flashback, mood |
| **Distortion** | `glitch`, `chromatic-aberration`, `blur`, `ripple`, `static` | Corruption, daze, dream, jamming |
| **Overlay/Atmosphere** | `vignette-pulse`, `scan-lines`, `rain`, `snow`, `particles`, `fog` | Dread, retro, weather, ambiance |
| **Dramatic** | `speed-lines`, `screen-crack`, `text-shake`, `heartbeat`, `spotlight` | Action, fracture, fear, tension, isolation |

---

## State Management

### In-Memory Stores

| Store | Key | Value | Purpose |
|-------|-----|-------|---------|
| `planSessionStore` | sessionId | `PlanSession` | Active planning sessions |
| `vnPackageStore` | packageId | `VNPackage` | Package lookup cache |
| `plotStateStore` | sessionId | `PlotState` | Gameplay progression cache |

### SQLite Tables (via Drizzle ORM)

| Table | PK | Key Columns | Purpose |
|-------|-----|-------------|---------|
| `vnPackages` | `id` | `title`, `genre`, `artStyle`, `metaJson` (full VNPackage JSON) | Persisted story packages |
| `plotStates` | `sessionId` | `packageId`, `currentActId`, `currentSceneId`, `currentBeat`, `completedScenes` (JSON), `playerStatsJson`, `flagsJson` | Player progression |
| `combatStates` | `sessionId` | `combatJson` (full tactical state) | Active combat state |

### State Flow

```
PlanSession (in-memory, transient)
  → finalizePackage()
  → vnPackages table (persistent)
  → vnPackageStore cache (fast reads)

PlotState (in-memory cache)
  ↔ plotStates table (updated every storyteller turn)

CombatState
  ↔ combatStates table (updated on init/events)
```

---

## API Routes

| Method | Path | Handler | Request | Response |
|--------|------|---------|---------|----------|
| POST | `/chat` | `planChatRoute` | `{ messages, sessionId, locale? }` | SSE stream |
| POST | `/tell-chat` | `tellChatRoute` | `{ messages, sessionId, packageId }` | SSE stream |
| GET | `/projects` | `projectsRoute` | — | `ProjectSummary[]` |
| GET | `/projects/:packageId` | `projectsRoute` | — | `{ package: VNPackage }` |
| GET | `/story-map/:packageId` | `storyMapRoute` | — | `text/plain` (ASCII tree) |

---

## Asset System

Assets generated during planning are stored on disk and referenced by slug keys.

```
/public/generated/{packageId}/
├── {character-slug}.png        # Character portraits (transparent BG)
├── {location-slug}.png         # Scene backgrounds (16:9)
├── {mood-slug}.wav             # Ambient music (PCM)
└── story.json                  # Full VNPackage JSON
```

In `VNPackage.assets`, each entry maps `slug → { url, mimeType }`. Agents reference assets by slug only; the frame builder resolves URLs.

---

## Frame Registry (`frameRegistry.ts`)

Server-side metadata for each frame type. Used to:
1. Build system prompts (inject `agentSummary` + `agentWorkflow` per type)
2. Validate frames (`requiresNarration` flag → inject fallback)
3. Identify data fields (`dataField` maps type → VNFrame property)

Key workflows embedded in registry:
- **DICE_ROLL_WORKFLOW**: Pre-compute roll, pair with skill-check frame
- **SKILL_CHECK_WORKFLOW**: Read stats → compute modifier → set DC → build result
- **INVENTORY_WORKFLOW**: addItem/removeItem via playerStatsTool → show inventory frame
- **MAP_WORKFLOW**: Build from package scenes, mark visited/accessible
- **TACTICAL_WORKFLOW**: 5-step layered combat (region → area → tactical grid → result → story)

---

## Client Rendering (Brief)

- **`src/components/vn/VNRenderer.tsx`**: Orchestrates frame display, tracks `currentIndex`, handles player actions
- **`src/lib/frameRegistry.tsx`**: Maps `FrameType → React component`
- **Frame components** in `src/components/vn/frames/`: FullScreenFrame, DialogueFrame, ThreePanelFrame, ChoiceFrame, SkillCheckFrame, DiceRollFrame, InventoryFrame, MapFrame, TacticalMapFrame, BattleFrame
- Typewriter animation for dialogue/narration via `useTypewriter` hook
- Tactical combat uses `useReducer(combatReducer)` with client-side AI turns

---

## Design Patterns

### Session Closure (`bindSessionTools`)
Storyteller tools pre-bind `sessionId` via closures so the agent never passes wrong session.

### Frame Normalization
`frameBuilderTool` normalizes legacy LLM output → canonical schema: unwrap payloads, fold legacy fields (`position→id`, `assetKey→characterAsset`), inject fallback narration, non-blocking validation.

### Auto-Resolve Next Scene
`sceneCompleteTool` walks `plot.acts[].scenes[]` deterministically if agent doesn't specify next scene — prevents agent errors from breaking flow.

### Asset Key Indirection
Assets referenced by slug keys (`"harbor-night"`) not paths. Enables substitution, regeneration, decouples location from prompts.

### Three-Gear Pacing Model & Subjective Prose
Storyteller varies frame density and prose style based on narrative pace, heavily inspired by modern visual novels:
- **First gear** (slow): Atmosphere and world-building. Heavy use of `full-screen` frames with `narrations[]`, environmental effects.
- **Second gear** (medium): Dialogue and investigation. `dialogue` / `three-panel` frames with `conversation[]`. Employs **Dialogue Dissonance** (characters deflecting, speaking on parallel tracks) and **Subjectivity as Action** (protagonist internally reacting via `{narrator:"..."}` beats intermixed in conversation).
- **Third gear** (fast): Crisis and action. Rapid short frames, `shake`/`screen-crack` effects. Employs **Micro-Pacing (Breathless Fragments)** where narrations break down into 1-to-3 sentence chunks or frightened gasps. Tension is often deliberately punctured by **Banality** (e.g. an annoying ringtone during a tense standoff).

### Multi-Speaker Conversations
`conversation[]` replaces single `dialogue` for scenes with multiple speakers. Two entry shapes: `{speaker, text}` for spoken dialogue (renderer auto-highlights matching panel), and `{narrator:"..."}` for subjective narration beats between dialogue lines (no panel shift). Per-line `effect` fields let individual lines trigger visual effects (e.g., `text-shake` on a threatening line).

### Actions & Mechanics (PbtA 2d6 System)
Skill checks, risky actions, and combat resolution are handled via a Powered by the Apocalypse (PbtA) 2d6 system.
- Characters have Stat Modifiers (e.g., -1 to +3).
- The player rolls `2d6 + Modifier`.
- **10+**: Full Success.
- **7-9**: Mixed Success. The player achieves their goal, but the DM introduces a "Fail Forward" narrative complication or cost.
- **≤6**: Miss. The DM introduces a "Hard Move" consequence against the player.

### Discriminated Union Events
`combatEventTool` uses Zod `discriminatedUnion('type', [...])` for type-safe combat event handling.

---

## Supported Languages

| Code | Language |
|------|----------|
| `en` | English |
| `zh-CN` | 中文（简体） |

Language set at planning time in `VNPackage.language`. Both agents enforce it in system prompts: all content (dialogue, narration, labels, descriptions) must use the specified language only.
