# Automatic Testing Guide

This document defines the automated test flow for the VN system with focus on API contract and real usage behavior.

## 1) Scope

These checks are intended to catch:

- `VNFrame` / `VNPackage` schema regressions
- Storyteller tool-output shape drift (legacy vs canonical frame payloads)
- `/api/vn/tell-chat` and `/api/vn/chat` runtime contract breakage
- Build/type failures that break app usability

This guide intentionally does not include browser UI test automation yet.

## 2) Prerequisites

- Dependencies installed: `npm install`
- Local server DB initialized by app boot (auto-created on first server run)
- Environment for live model calls:
  - `GEMINI_API_KEY`
  - optional model overrides:
    - `GEMINI_TEXT_MODEL` — used by the planning agent (default: `gemini-3-flash-preview`)
    - `GEMINI_STORY_MODEL` — used by the storyteller agent (default: `gemini-3-flash-preview`)
- Optional trace control:
  - `AI_TRACE_ENABLED=1` — force-enable tracing (default: on in non-production)
  - `AI_TRACE_INCLUDE_RAW=1` — include raw request/response payloads in traces

## 3) Fast Local Gate (recommended on every change)

```bash
npx tsc -p tsconfig.app.json --noEmit --pretty false
npm test -- tests/vnFrame.spec.ts tests/vnPackage.spec.ts tests/resolveAsset.spec.ts tests/frameBuilderTool.spec.ts
npm run build
```

What this validates:

- Type-level safety across client/server shared contracts
- Core schema and asset resolution behavior
- Frame tool normalization for AI SDK tool payload variants
- Production build viability

## 4) API Architecture: ToolLoopAgent + Streaming

Both chat pipelines use the Vercel AI SDK `ToolLoopAgent` with `createAgentUIStreamResponse`. This means:

- The server returns a **streaming SSE response** (not a JSON body) — cannot be parsed by `jq` directly
- The client uses `useChat<T>` from `@ai-sdk/react` to consume the stream
- Tool calls are embedded in the SSE stream as `tool-<toolName>` parts
- The loop stops when a designated stop-signal tool is called (`finalizePackage` for planning, `yieldToPlayer` or `sceneCompleteTool` for storytelling)

### Message format

Both endpoints accept messages in **AI SDK UIMessage format** (not the old `{role, content}` format):

```json
{
  "id": "msg-1",
  "role": "user",
  "parts": [{ "type": "text", "text": "your message here" }]
}
```

### Pipeline names

| Pipeline         | Endpoint              | Agent                    | Stop signal           |
|------------------|-----------------------|--------------------------|-----------------------|
| `vn-plan-chat`   | `POST /api/vn/chat`   | `planning-chat-agent`    | `finalizePackage`     |
| `vn-tell-chat`   | `POST /api/vn/tell-chat` | `storyteller-chat-agent` | `yieldToPlayer` / `sceneCompleteTool` |

## 5) Live API Contract Smoke Test

Start server:

```bash
npm run server
```

### Storyteller smoke test (tell-chat)

The `tell-chat` endpoint streams SSE — verify via traces rather than parsing the stream body:

```bash
API_BASE="http://localhost:3001"
PACKAGE_ID="<your-package-id>"   # from sqlite.db vnPackages table or VN projects page
SESSION_ID="$(uuidgen | tr '[:upper:]' '[:lower:]')"

echo "Session: $SESSION_ID"

# Turn 1: scene opener — send [scene start] as the initial player action
curl -sS -X POST "$API_BASE/api/vn/tell-chat" \
  -H 'content-type: application/json' \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"packageId\": \"$PACKAGE_ID\",
    \"messages\": [{
      \"id\": \"msg-1\",
      \"role\": \"user\",
      \"parts\": [{\"type\": \"text\", \"text\": \"[scene start]\"}]
    }]
  }" > /dev/null

echo "Turn 1: streamed (check trace below)"

# Verify via trace
sleep 1  # allow trace write to complete
curl -sS "$API_BASE/api/debug/traces?pipeline=vn-tell-chat&sessionId=$SESSION_ID" \
  | python3 -c "
import json, sys
data = json.load(sys.stdin)
traces = data.get('traces', [])
if not traces:
    print('ERROR: no trace found'); exit(1)
t = traces[0]
meta = t.get('meta') or {}
fc = meta.get('frameCount', 0)
sc = meta.get('stepCount', 0)
print(f'status={t[\"status\"]}  steps={sc}  frames={fc}')
assert t['status'] == 'success', f'expected success, got {t[\"status\"]}'
assert fc > 0, f'expected frameCount > 0, got {fc}'
print('Turn 1: OK')
"
```

To send a player action in a subsequent turn, accumulate the messages array from the SSE response. In practice this is handled by `useChat` on the client — for scripted testing, use the trace endpoint to confirm behavior instead.

### Planning smoke test (plan-chat)

```bash
SESSION_ID="$(uuidgen | tr '[:upper:]' '[:lower:]')"

curl -sS -X POST "$API_BASE/api/vn/chat" \
  -H 'content-type: application/json' \
  -d "{
    \"sessionId\": \"$SESSION_ID\",
    \"messages\": [{
      \"id\": \"msg-1\",
      \"role\": \"user\",
      \"parts\": [{\"type\": \"text\", \"text\": \"I want a noir detective story set in 1940s Tokyo\"}]
    }]
  }" > /dev/null

sleep 1
curl -sS "$API_BASE/api/debug/traces?pipeline=vn-plan-chat&sessionId=$SESSION_ID" \
  | python3 -c "
import json, sys
data = json.load(sys.stdin)
traces = data.get('traces', [])
if not traces:
    print('ERROR: no trace found'); exit(1)
t = traces[0]
print(f'status={t[\"status\"]}  steps={t.get(\"meta\", {}).get(\"stepCount\", 0)}')
assert t['status'] == 'success', f'expected success, got {t[\"status\"]}'
print('Plan chat: OK')
"
```

## 6) Tracing System

Both AI pipelines emit structured traces to the local SQLite DB. Traces capture per-step tool calls, tool results, token usage, and overall duration.

### Querying traces

```bash
# List recent traces for a session (both pipelines)
curl -sS "$API_BASE/api/debug/traces?sessionId=$SESSION_ID" | jq '.traces[] | {pipeline, status, meta}'

# Filter by pipeline
curl -sS "$API_BASE/api/debug/traces?pipeline=vn-tell-chat&limit=5" | jq '.traces[] | {status, meta}'

# Get full trace with all steps (tool calls + results)
curl -sS "$API_BASE/api/debug/traces/<traceId>" | jq '{status, meta, steps: [.steps[] | {stepIndex, finishReason, toolCalls, toolResults}]}'
```

### Reading tool call details from a trace

```bash
TRACE_ID="<traceId>"
curl -sS "$API_BASE/api/debug/traces/$TRACE_ID" | jq '
  .steps[] | {
    step: .stepIndex,
    tools: [.toolCalls[]? | {name: .toolName, input: .input}],
    results: [.toolResults[]? | {name: .toolName, ok: .output.ok}]
  }
'
```

### Trace fields

| Field | Description |
|-------|-------------|
| `pipeline` | `vn-plan-chat` or `vn-tell-chat` |
| `agentId` | `planning-chat-agent` or `storyteller-chat-agent` |
| `status` | `running` / `success` / `error` |
| `meta.stepCount` | Number of agent loop iterations |
| `meta.toolCallCount` | Total tool invocations |
| `meta.frameCount` | (`vn-tell-chat` only) Number of `frameBuilderTool` calls — equals frames rendered |
| `steps[].toolCalls` | What the model called (name + input) |
| `steps[].toolResults` | What each tool returned |
| `steps[].usage` | Token counts per step |

### AI trace environment flags

```bash
# Disable tracing entirely (e.g. production)
AI_TRACE_ENABLED=0 npm run server

# Include raw model request/response payloads (verbose — useful for prompt debugging)
AI_TRACE_INCLUDE_RAW=1 npm run server
```

## 7) Trace-Aware Failure Analysis

When a smoke check fails, pull the trace for the failing session:

```bash
# List traces to find the failing one
curl -sS "$API_BASE/api/debug/traces?sessionId=$SESSION_ID&pipeline=vn-tell-chat" | jq '.traces[0]'

# Get AI-agent-readable diagnosis
curl -sS -X POST "$API_BASE/api/debug/traces/summarize" \
  -H 'content-type: application/json' \
  -d "{\"sessionId\":\"$SESSION_ID\",\"maxTraces\":5}" | jq
```

This output is designed for AI-agent consumption during debugging loops.

Common failure signatures:

| Symptom | Likely cause | Where to look |
|---------|-------------|---------------|
| `status: "error"` | Agent threw / model refused | `trace.error.message` |
| `frameCount: 0` | Agent skipped `frameBuilderTool` | `steps[].toolCalls` — check if only `plotStateTool` called |
| `stepCount: 1` | Agent stopped after first step | `steps[0].finishReason` — often `"stop"` without tool calls |
| Background placeholder in UI | `frameBuilderTool` returned `ok: false` | `steps[].toolResults[].output.error` |
| Music plays but no background | First frame missing `backgroundAsset` | `steps[].toolResults[]` where `toolName === "frameBuilderTool"` |

## 8) Suggested CI Sequence

```bash
npm ci
npx tsc -p tsconfig.app.json --noEmit --pretty false
npm test -- tests/vnFrame.spec.ts tests/vnPackage.spec.ts tests/resolveAsset.spec.ts tests/frameBuilderTool.spec.ts
npm run build
```

Optional CI stage with live model credentials:

- boot server
- run the storyteller smoke test from section 5
- on failure, run `traces/summarize` and upload the output as CI artifact
