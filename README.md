# AI Dungeon — TanStack Edition

An AI-powered text adventure game built with the TanStack stack, powered by Google Gemini.

## Features

- Choose from preset worlds or write your own custom adventure setting
- Gemini-generated scenes with exactly 3 player choices per turn
- Free-text action input (press **Enter** to submit)
- Persistent sessions stored in `localStorage`, accessible from the home screen
- Full dark theme, auto-scrolling story log, animated loading states
- Type-safe codebase end-to-end (React + TypeScript + Vite frontend, Node/Express backend)

---

## How to Run

### 1. Prerequisites

- Node.js ≥ 18
- A [Google AI Studio](https://aistudio.google.com/) API key

### 2. Configure environment

The `.env` file is already present at the project root. Make sure it contains:

```
GEMINI_API_KEY=your_api_key_here
```

### 3. Install dependencies

```bash
npm install
```

### 4. Start the development server

```bash
npm run dev
```

This starts:
- **Vite dev server** on `http://localhost:5173` (frontend)
- **Express API server** on `http://localhost:3001` (backend)

Vite proxies all `/api/*` requests to the Express server, so there are no CORS issues in development.

### 5. Open the app

Navigate to [http://localhost:5173](http://localhost:5173) in your browser.

### 6. Run tests

```bash
npm test
```

### 7. Production build

```bash
npm run build
npm run preview
```

---

## Architecture

```
ai-dungeon-tanstack/
├── src/                        # Frontend (Vite + React + TypeScript)
│   ├── main.tsx                # React entry point
│   ├── router.tsx              # TanStack Router — route tree definition
│   ├── types/
│   │   └── story.ts            # Shared TypeScript types
│   ├── lib/
│   │   ├── promptFormatter.ts  # Builds safe Gemini prompts
│   │   ├── responseParser.ts   # Validates + parses AI JSON responses
│   │   ├── sessionStorage.ts   # localStorage CRUD for game sessions
│   │   └── queryClient.ts      # TanStack Query client config
│   ├── pages/
│   │   ├── HomePage.tsx        # Session list + new game CTA
│   │   ├── NewGamePage.tsx     # World selection / custom setup form
│   │   └── GameSessionPage.tsx # Core game loop — story log + action input
│   ├── components/
│   │   ├── StoryLog.tsx        # Renders AI and player steps
│   │   ├── ChoiceButtons.tsx   # 3-choice grid
│   │   ├── ActionInput.tsx     # Free-text textarea with keyboard submit
│   │   └── LoadingIndicator.tsx# Animated dots
│   └── styles/
│       └── global.css          # Dark theme CSS variables + all component styles
├── server/
│   ├── index.ts                # Express app bootstrap
│   └── storyRoute.ts           # POST /api/story/step — calls Gemini
├── tests/
│   ├── promptFormatter.test.ts # Unit tests for prompt construction
│   └── responseParser.test.ts  # Unit tests for JSON response validation
├── vite.config.ts              # Vite + proxy config
├── vitest.config.ts            # Vitest config
├── tsconfig.app.json           # TypeScript config for frontend
├── tsconfig.node.json          # TypeScript config for server
└── package.json                # Scripts: dev, build, test, server
```

### Key design decisions

| Concern | Solution |
|---|---|
| Routing | TanStack Router — type-safe, file-agnostic route definition |
| Async state | TanStack Query — `useMutation` for story steps, `useQuery` for session load |
| Session persistence | `localStorage` keyed by UUID; 20-session cap, sorted by `updatedAt` |
| AI safety | Prompt preamble enforces family-friendly content; input sanitized + length-capped |
| AI reliability | `responseParser` validates schema strictly, raises `ParseError` on malformed output |
| History context | Last 12 steps sent to Gemini to stay within token budget |
| Non-blocking UI | Buttons/input disabled only during active mutation; optimistic player-step added immediately |

### API contract

**`POST /api/story/step`**

Request body:
```json
{
  "sessionId": "uuid",
  "worldSetup": "string",
  "history": [{ "type": "ai|player", "content": "string" }],
  "playerAction": "string"
}
```

Response:
```json
{
  "scene": "string",
  "choices": ["string", "string", "string"],
  "stateSummary": "string"
}
```

---

## Mastra-Inspired Agentic Architecture

This project's story engine is designed around patterns from the [Mastra AI framework](https://github.com/mastra-ai/mastra), adapted as a lightweight, dependency-free implementation in TypeScript.

### Agent Roles

| Agent | Role | Pattern |
|---|---|---|
| **Story Director** | Interprets the player's action; decides what dramatically happens, what world-state changes occur, and what choices to offer | Supervisor — runs first each turn |
| **World-State Manager** | Applies the Director's `stateChanges` to the in-memory `WorldState`; tracks location, inventory, characters, flags, events | Working Memory (Mastra `workingMemory` template) |
| **Narrator** | Receives the Director's `storyBeat` and writes 2-3 paragraphs of immersive second-person prose | Specialist — runs in parallel with the World-State update |

### Workflow: One Story Turn

```
POST /api/story/step
        |
        v
+-------------------+
|  Story Director   |  -> storyBeat, choices[3], stateChanges
+---------+---------+
          |
     +----+----------+  Promise.all (parallel)
     v               v
World-State       Narrator
Manager           Agent
(sync update)     (Gemini call -> scene + stateSummary)
     |               |
     +-----+----------+
           v
  { scene, choices, stateSummary, debug }
```

The Story Director and Narrator both call the Gemini 1.5 Flash model with structured JSON output. The World-State Manager is a pure function — deterministic and instant. Running the Narrator in parallel with the state update eliminates one round-trip of latency.

### Key Mastra Patterns Adopted

**Agent as typed function** — Each agent exposes a typed `run*` function with `AgentConfig` (id, temperature, maxOutputTokens) rather than a class with inherited complexity.

**Step-based workflow** — `runStoryTurn` in `server/workflows/storyTurn.ts` mirrors Mastra's `createWorkflow().then().parallel()` builder, but as a flat async function for simplicity. Each step records its timing in `stepTimings`.

**Working Memory as WorldState** — `server/agents/worldState.ts` maintains a per-session `WorldState` object across turns. This is the equivalent of Mastra's `workingMemory` template injected into every agent's system prompt. Location, inventory, characters, flags, and recent events persist between HTTP requests without a database.

**Structured JSON output** — Every agent is instructed to return only valid JSON matching a known schema. `parseAgentJSON<T>` mirrors Mastra's output validation layer — it strips markdown fences and throws a typed `AgentError` on failure, surfacing the raw response for debugging.

**Debug envelope** — Every API response includes a `debug` object with turn ID, which agents ran, the full post-turn WorldState, and per-agent timing in milliseconds. This is visible in the UI via the collapsible debug panel below each story turn.

### Extending the Engine

To add a new agent role (e.g., a Combat Resolver):
1. Create `server/agents/combatResolver.ts` following the same `AgentConfig` + `run*` pattern
2. Add a branch in `server/workflows/storyTurn.ts` that detects combat in the Director's output and calls the resolver
3. The resolver's output can feed back into the Narrator as additional context

To add persistent storage, swap the `Map<string, WorldState>` in `worldState.ts` for a Redis or SQLite adapter — the interface is identical.
