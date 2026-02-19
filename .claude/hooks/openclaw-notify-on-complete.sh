#!/bin/bash
set -euo pipefail
if [[ "${OPENCLAW_CC_HOOK:-}" != "1" ]]; then exit 0; fi
INPUT="$(cat)"
TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
LOG_FILE="${OPENCLAW_CC_HOOK_LOG:-$CLAUDE_PROJECT_DIR/.claude/cc-hook.log}"
mkdir -p "$(dirname "$LOG_FILE")"
EVENT_NAME="$(echo "$INPUT" | jq -r '.hook_event_name // .event_name // "Stop"' 2>/dev/null || echo "Stop")"
SESSION_ID="$(echo "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null || echo "unknown")"
echo "[$TS] event=$EVENT_NAME session=$SESSION_ID" >> "$LOG_FILE"
openclaw system event --mode now --text "Reminder: Claude Code completed an iteration for ai-dungeon-tanstack. Review output, test in browser, and plan next PM iteration." >/dev/null 2>&1 || true
