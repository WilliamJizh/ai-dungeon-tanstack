import { createGoogleGenerativeAI } from '@ai-sdk/google';

/**
 * Central model ID registry. All env-var fallback chains live here.
 * Resolved once at import time; consistent for the process lifetime.
 */
export const MODEL_IDS = {
  chat: process.env.GEMINI_CHAT_MODEL ?? 'gemini-3.1-pro-preview',
  storyteller: process.env.GEMINI_STORY_MODEL ?? process.env.GEMINI_TEXT_MODEL ?? 'gemini-3.1-pro-preview',
  planning: process.env.GEMINI_PLANNING_MODEL ?? process.env.GEMINI_TEXT_MODEL ?? 'gemini-3.1-pro-preview',
  summarizer: process.env.GEMINI_SUMMARY_MODEL ?? 'gemini-3-flash-preview',
} as const;

export type ModelRole = keyof typeof MODEL_IDS;

let _googleClient: ReturnType<typeof createGoogleGenerativeAI> | null = null;

export function getGoogleClient(): ReturnType<typeof createGoogleGenerativeAI> {
  if (!_googleClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
    _googleClient = createGoogleGenerativeAI({ apiKey });
  }
  return _googleClient;
}

import { wrapLanguageModel } from 'ai';
import { appendTraceStep, completeTrace, createTrace, type TraceContext } from '../debug/traceStore.js';

// ── Centralized LLM tracing ─────────────────────────────────────────────────
// The middleware buffers raw prompt + tools per LLM call. `onStepFinish`
// (returned by startLLMTrace) merges the buffer with agent step data
// (tool calls, tool results, content) and writes a complete trace step.

interface ActiveTrace {
  traceId: string;
  stepCount: number;
  startedAt: number;
  toolCallCount: number;
  frameCount: number;
  /** Captured once from the first LLM call; written to trace-level input on finish. */
  initialPrompt?: { prompt: any; tools: any };
}

let _activeTrace: ActiveTrace | null = null;

/**
 * Start tracing all LLM calls through the model middleware.
 * Returns { traceId, onStepFinish, finishTrace } — pass `onStepFinish`
 * to the AI SDK agent so it records tool calls + results per step.
 */
export function startLLMTrace(
  context: TraceContext,
  input?: unknown,
): { traceId: string; onStepFinish: (step: any) => void; finishTrace: (status: 'success' | 'error', error?: unknown) => void } {
  const traceId = createTrace(context, input ?? {});
  const trace: ActiveTrace = {
    traceId, stepCount: 0, startedAt: Date.now(),
    toolCallCount: 0, frameCount: 0,
  };
  _activeTrace = trace;

  const onStepFinish = (step: any) => {
    const idx = trace.stepCount++;
    const calls = Array.isArray(step.toolCalls) ? step.toolCalls : [];
    trace.toolCallCount += calls.length;
    trace.frameCount += calls.filter((c: any) => c.toolName === 'frameBuilderTool').length;

    appendTraceStep({
      traceId: trace.traceId,
      stepIndex: idx,
      finishReason: step.finishReason,
      usage: step.usage,
      toolCalls: calls.map((c: any) => ({
        toolCallId: c.toolCallId,
        toolName: c.toolName,
        input: c.input,
      })),
      toolResults: Array.isArray(step.toolResults)
        ? step.toolResults.map((r: any) => ({
            toolCallId: r.toolCallId,
            toolName: r.toolName,
            output: r.output,
          }))
        : undefined,
      content: step.text ?? '',
    });
  };

  const finishTrace = (status: 'success' | 'error', error?: unknown) => {
    if (_activeTrace === trace) _activeTrace = null;
    completeTrace({
      traceId: trace.traceId,
      status,
      durationMs: Date.now() - trace.startedAt,
      input: trace.initialPrompt
        ? { prompt: trace.initialPrompt.prompt, tools: trace.initialPrompt.tools }
        : undefined,
      output: status === 'success'
        ? { stepCount: trace.stepCount, toolCallCount: trace.toolCallCount, frameCount: trace.frameCount }
        : undefined,
      error: error
        ? error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) }
        : undefined,
      meta: { stepCount: trace.stepCount, toolCallCount: trace.toolCallCount, frameCount: trace.frameCount },
    });
  };

  return { traceId, onStepFinish, finishTrace };
}

/**
 * Returns a Google Generative AI language model for the given role.
 * Reuses a single google client across the process.
 */
export function getGoogleModel(role: ModelRole) {
  const model = getGoogleClient()(MODEL_IDS[role]);

  // Gemini 3 Pro strictly requires alternating System/User -> Assistant -> User -> Assistant.
  // The Vercel AI SDK sometimes emits back-to-back assistant tool-calls or user tool-results
  // when maxSteps > 1. This middleware merges consecutive messages of the same role.
  return wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: 'v3',
      transformParams: async ({ params }) => {
        return {
          ...params,
          prompt: mergePromptRulesForGemini(params.prompt)
        };
      },
      wrapGenerate: async ({ doGenerate, params }: any) => {
        const result = await doGenerate();
        // Capture prompt + tools from the first LLM call only (same for every step in a turn)
        if (_activeTrace && !_activeTrace.initialPrompt) {
          try {
            let toolSummary: Record<string, any> | undefined;
            if (params.tools) {
              toolSummary = {};
              for (const [name, t] of Object.entries(params.tools ?? {})) {
                const tool = t as any;
                toolSummary[name] = {
                  type: tool.type,
                  description: tool.description,
                  parameters: tool.parameters,
                };
              }
            }
            _activeTrace.initialPrompt = { prompt: params.prompt, tools: toolSummary };
          } catch (err) {
            console.error('[Trace] Failed to capture initial prompt:', err);
          }
        }
        return result;
      },
    }
  });
}

// LanguageModelV3Prompt is an array of { role: 'system'|'user'|'assistant'|'tool', content: [...] }
//
// Gemini strictly requires alternating turns: user → model → user → model.
// In Gemini's REST API, BOTH AI SDK 'user' and 'tool' messages map to the Gemini "user" role.
// This means a sequence like:  assistant → tool → user  creates TWO consecutive Gemini "user"
// turns, causing an INVALID_ARGUMENT error.
//
// Strategy (three-pass):
//   Pass 1: Merge consecutive messages that share the EXACT same V3 role.
//   Pass 2: When a 'tool' message is immediately followed by a 'user' message,
//           absorb the tool-result parts (as text) INTO the user message and drop
//           the tool message. This keeps everything in one Gemini "user" turn
//           without putting text parts in tool messages (which crashes the SDK).
//   Pass 3: Validate content parts — strip nulls and ensure tool messages only
//           contain tool-result parts.
function mergePromptRulesForGemini(prompt: any[]): any[] {
  if (!prompt || prompt.length === 0) return prompt;

  // ── Pass 1: merge consecutive same-role messages ──────────────────────
  const pass1: any[] = [];
  for (const msg of prompt) {
    if (msg.role === 'system') {
      pass1.push({ ...msg });
      continue;
    }
    const prev = pass1[pass1.length - 1];
    if (prev && prev.role === msg.role && prev.role !== 'system') {
      prev.content.push(...msg.content);
    } else {
      pass1.push({ role: msg.role, content: [...msg.content] });
    }
  }

  // ── Pass 2: merge [tool] → [user] into one user message ─────────────
  // Both roles map to Gemini "user", so consecutive [tool][user] causes
  // INVALID_ARGUMENT. The old approach pushed user text INTO the tool msg,
  // but the Google SDK crashes on non-tool-result parts in tool messages
  // (it assumes every part has `.output`). Instead, we absorb tool results
  // as text into the user message — safe for the SDK's user-role converter.
  const pass2: any[] = [];
  for (let i = 0; i < pass1.length; i++) {
    const msg = pass1[i];
    if (msg.role === 'user' && pass2.length > 0 && pass2[pass2.length - 1].role === 'tool') {
      const toolMsg = pass2.pop()!;
      // Convert tool-result parts to text summaries
      const toolParts = toolMsg.content
        .filter((p: any) => p?.type === 'tool-result')
        .map((p: any) => {
          const out = p.output;
          const text = typeof out === 'string' ? out
            : (out?.type === 'content' && Array.isArray(out.value))
              ? out.value.map((v: any) => v.text ?? '').join('')
              : JSON.stringify(out);
          return { type: 'text' as const, text: `[${p.toolName} result]: ${text}` };
        });
      // Prepend tool results before user content in a single user message
      pass2.push({ role: 'user', content: [...toolParts, ...msg.content] });
    } else {
      pass2.push(msg);
    }
  }

  // ── Pass 3: validate content parts ─────────────────────────────────
  // Strip nulls and ensure tool messages only contain tool-result parts.
  for (const msg of pass2) {
    if (Array.isArray(msg.content)) {
      msg.content = msg.content.filter((part: any) => {
        if (part == null || part.type == null) return false;
        if (msg.role === 'tool' && part.type !== 'tool-result' && part.type !== 'tool-approval-response') return false;
        return true;
      });
    }
  }

  return pass2;
}
