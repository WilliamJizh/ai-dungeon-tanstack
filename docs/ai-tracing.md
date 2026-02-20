# AI Tracing

This project includes a unified AI trace system for debugging model/tool behavior.

## What is captured

- Raw-ish AI SDK input envelope (`system`, `prompt/messages`, tool names)
- Model metadata (`provider`, `modelId`, duration, status)
- Step-level data:
  - `toolCalls`
  - `toolResults`
  - `usage`
  - request/response metadata (when raw capture enabled)
- Error payloads and stack snapshots

## Storage

SQLite tables:

- `ai_traces`
- `ai_trace_steps`

## Endpoints

- `GET /api/debug/traces`
  - Filters: `sessionId`, `requestId`, `pipeline`, `agentId`, `status`, `from`, `to`, `limit`, `offset`
- `GET /api/debug/traces/:traceId`
  - Full trace with ordered step details
- `POST /api/debug/traces/summarize`
  - Body: `{ traceId?, sessionId?, requestId?, maxTraces? }`
  - Returns findings + recommendations for fast diagnosis

## Human-Readable UI

- Open `http://localhost:5173/debug/traces`
- Features:
  - Filter by `sessionId`, `requestId`, `pipeline`, `agentId`, `status`
  - Browse recent traces with status, model, duration
  - Inspect selected trace input/output/error and per-step tool activity
  - Run summarize directly from UI

## Environment flags

- `AI_TRACE_ENABLED`
  - default: `true` in non-production, `false` in production
- `AI_TRACE_INCLUDE_RAW`
  - default: `true` in non-production, `false` in production

Examples:

```bash
AI_TRACE_ENABLED=true AI_TRACE_INCLUDE_RAW=true npm run dev
```

## AI-agent debugging workflow

1. Reproduce a failing request.
2. Query traces by session/request:
   - `GET /api/debug/traces?sessionId=...`
3. Inspect raw step data:
   - `GET /api/debug/traces/:traceId`
4. Ask for summarized diagnosis:
   - `POST /api/debug/traces/summarize`

The summarize endpoint is intentionally machine-readable so another agent can consume it directly.
