import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

/**
 * Central model ID registry. All env-var fallback chains live here.
 * Resolved once at import time; consistent for the process lifetime.
 */
export const MODEL_IDS = {
  chat: process.env.GEMINI_CHAT_MODEL ?? 'gemini-3.1-pro-preview',
  storyteller: process.env.GEMINI_STORY_MODEL ?? process.env.GEMINI_TEXT_MODEL ?? 'gemini-3-pro-preview',
  planning: process.env.GEMINI_PLANNING_MODEL ?? process.env.GEMINI_TEXT_MODEL ?? 'gemini-3-pro-preview',
  summarizer: process.env.GEMINI_SUMMARY_MODEL ?? 'gemini-3-flash-preview',
} as const;

export const OPENROUTER_MODEL_IDS = {
  chat: process.env.OPENROUTER_CHAT_MODEL ?? 'anthropic/claude-3.5-sonnet',
  storyteller: process.env.OPENROUTER_STORY_MODEL ?? 'anthropic/claude-3.5-sonnet',
  planning: process.env.OPENROUTER_PLANNING_MODEL ?? 'anthropic/claude-3.5-sonnet',
  summarizer: process.env.OPENROUTER_SUMMARY_MODEL ?? 'anthropic/claude-3.5-haiku',
} as const;

export type ModelRole = keyof typeof MODEL_IDS;

const PROVIDER = process.env.AI_PROVIDER ?? 'google';

let _googleClient: ReturnType<typeof createGoogleGenerativeAI> | null = null;
let _openRouterClient: ReturnType<typeof createOpenRouter> | null = null;

export function getGoogleClient(): ReturnType<typeof createGoogleGenerativeAI> {
  if (!_googleClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
    _googleClient = createGoogleGenerativeAI({ apiKey });
  }
  return _googleClient;
}

export function getOpenRouterClient(): ReturnType<typeof createOpenRouter> {
  if (!_openRouterClient) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set');
    _openRouterClient = createOpenRouter({ apiKey });
  }
  return _openRouterClient;
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
  zeroOutputStopNoToolSteps: number;
  /** Captured once from the first LLM call; written to trace-level input on finish. */
  initialPrompt?: { prompt: any; tools: any };
  /** Buffered from middleware per LLM call, consumed by onStepFinish. */
  pendingPrompt?: any;
}

let _activeTrace: ActiveTrace | null = null;

/**
 * Buffer the prompt from a middleware hook for per-step capture.
 * Also captures initial prompt once (for trace-level input on finish).
 */
function capturePromptForTrace(params: any) {
  if (!_activeTrace) return;
  try {
    // Buffer prompt for the upcoming onStepFinish call
    _activeTrace.pendingPrompt = params.prompt;

    // Also capture initial prompt + tools once (trace-level)
    if (!_activeTrace.initialPrompt) {
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
    }
  } catch (err) {
    console.error('[Trace] Failed to capture prompt:', err);
  }
}

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
    toolCallCount: 0, frameCount: 0, zeroOutputStopNoToolSteps: 0,
  };
  _activeTrace = trace;

  const onStepFinish = (step: any) => {
    const idx = trace.stepCount++;
    const calls = Array.isArray(step.toolCalls) ? step.toolCalls : [];
    trace.toolCallCount += calls.length;
    trace.frameCount += calls.filter((c: any) => c.toolName === 'frameBuilderTool').length;

    const outputTokensRaw = (step.usage as any)?.outputTokens;
    const outputTokens = typeof outputTokensRaw === 'number' ? outputTokensRaw : Number(outputTokensRaw ?? 0);
    const isZeroOutputStopNoTool = step.finishReason === 'stop' && calls.length === 0 && outputTokens === 0;
    if (isZeroOutputStopNoTool) {
      trace.zeroOutputStopNoToolSteps += 1;
      console.warn(`  [Trace] zero-output stop without tool calls at step=${idx}`);
    }

    // Consume the prompt buffered by middleware (params.prompt per LLM call)
    let request: unknown;
    const bufferedPrompt = trace.pendingPrompt;
    trace.pendingPrompt = undefined;
    if (bufferedPrompt) {
      request = {
        messageCount: Array.isArray(bufferedPrompt) ? bufferedPrompt.length : 0,
        messages: bufferedPrompt,
      };
    }

    appendTraceStep({
      traceId: trace.traceId,
      stepIndex: idx,
      finishReason: step.finishReason,
      usage: step.usage,
      request,
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
        ? {
          stepCount: trace.stepCount,
          toolCallCount: trace.toolCallCount,
          frameCount: trace.frameCount,
          zeroOutputStopNoToolSteps: trace.zeroOutputStopNoToolSteps,
        }
        : undefined,
      error: error
        ? error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) }
        : undefined,
      meta: {
        stepCount: trace.stepCount,
        toolCallCount: trace.toolCallCount,
        frameCount: trace.frameCount,
        zeroOutputStopNoToolSteps: trace.zeroOutputStopNoToolSteps,
        anomalyZeroOutputStopNoTool: trace.zeroOutputStopNoToolSteps > 0,
      },
    });
  };

  return { traceId, onStepFinish, finishTrace };
}

/**
 * Returns the currently active provider and model id for a given role.
 */
export function getActiveModelInfo(role: ModelRole): { provider: string, modelId: string } {
  if (PROVIDER === 'openrouter') {
    if (process.env.OPENROUTER_API_KEY) {
      return { provider: 'openrouter', modelId: OPENROUTER_MODEL_IDS[role] };
    }
  }
  return { provider: 'google', modelId: MODEL_IDS[role] };
}

/**
 * Returns a configured language model for the given role based on the active provider.
 * Fallbacks to Google if AI_PROVIDER is not openrouter or if OPENROUTER_API_KEY is missing.
 */
export function getModel(role: ModelRole) {
  if (PROVIDER === 'openrouter') {
    // Only attempt OpenRouter if a key is explicitly set
    if (process.env.OPENROUTER_API_KEY) {
      return getOpenRouterModel(role);
    }
  }
  return getGoogleModel(role);
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
        const llmStart = Date.now();
        const toolNames = params.tools ? Object.keys(params.tools).join(', ') : 'none';
        console.log(`  [LLM Call] Starting... tools=[${toolNames}]`);
        try {
          const result = await doGenerate();
          const llmMs = Date.now() - llmStart;
          const reason = typeof result.finishReason === 'string' ? result.finishReason : JSON.stringify(result.finishReason);

          let toolCallCount = 0;
          if (Array.isArray(result.toolCalls)) toolCallCount = result.toolCalls.length;
          // Some providers return tool calls inside message parts in V3
          if (!toolCallCount && Array.isArray(result.message?.parts)) {
            toolCallCount = result.message.parts.filter((p: any) => p.type === 'tool-call').length;
          }

          const usageObj = result.usage;
          const usageStr = usageObj ? `in=${(usageObj as any).inputTokens} out=${(usageObj as any).outputTokens}` : `usage=unknown`;

          const textContent = result.text ?? '';
          const textPreview = textContent.length > 300 ? textContent.substring(0, 300) + '...' : textContent;

          console.log(`  [LLM Call] Done in ${llmMs}ms | reason=${reason} | toolCalls=${toolCallCount} | ${usageStr}`);
          if (textPreview.trim()) {
            console.log(`  [LLM Text] ${textPreview}`);
          }

          capturePromptForTrace(params);
          return result;
        } catch (err) {
          const llmMs = Date.now() - llmStart;
          console.error(`  [LLM Call] FAILED after ${llmMs}ms:`, err);
          throw err;
        }
      },
      wrapStream: async ({ doStream, params }: any) => {
        const llmStart = Date.now();
        const toolNames = params.tools ? Object.keys(params.tools).join(', ') : 'none';
        console.log(`  [LLM Stream] Starting... tools=[${toolNames}]`);
        capturePromptForTrace(params);
        const result = await doStream();
        const llmMs = Date.now() - llmStart;
        console.log(`  [LLM Stream] Connected in ${llmMs}ms`);
        return result;
      },
    }
  });
}

/**
 * Returns an OpenRouter language model for the given role.
 */
export function getOpenRouterModel(role: ModelRole) {
  const model = getOpenRouterClient()(OPENROUTER_MODEL_IDS[role], {
    usage: { include: true }
  });

  // OpenRouter doesn't strictly need the Gemini message merging, 
  // but we still wrap it to inject our centralized logging/tracing middleware.
  return wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: 'v3',
      wrapGenerate: async ({ doGenerate, params }: any) => {
        const llmStart = Date.now();
        const toolNames = params.tools ? Object.keys(params.tools).join(', ') : 'none';
        console.log(`  [OpenRouter LLM Call] Starting... tools=[${toolNames}]`);
        try {
          const result = await doGenerate();
          const llmMs = Date.now() - llmStart;
          const reason = typeof result.finishReason === 'string' ? result.finishReason : JSON.stringify(result.finishReason);
          const cachedStr = (result.usage as any)?.cachedTokens ? ` cached=${(result.usage as any).cachedTokens}` : '';
          const usage = result.usage ? `in=${result.usage.promptTokens} out=${result.usage.completionTokens}${cachedStr}` : '';
          const toolCallCount = result.toolCalls?.length ?? 0;

          const textContent = result.text ?? '';
          const textPreview = textContent.length > 300 ? textContent.substring(0, 300) + '...' : textContent;
          console.log(`  [OpenRouter LLM Call] Done in ${llmMs}ms | reason=${reason} | toolCalls=${toolCallCount} | ${usage}`);
          if (textPreview.trim()) {
            console.log(`  [OpenRouter LLM Text] ${textPreview}`);
          }

          capturePromptForTrace(params);
          return result;
        } catch (err) {
          const llmMs = Date.now() - llmStart;
          console.error(`  [OpenRouter LLM Call] FAILED after ${llmMs}ms:`, err);
          throw err;
        }
      },
      wrapStream: async ({ doStream, params }: any) => {
        const llmStart = Date.now();
        const toolNames = params.tools ? Object.keys(params.tools).join(', ') : 'none';
        console.log(`  [OpenRouter LLM Stream] Starting... tools=[${toolNames}]`);
        capturePromptForTrace(params);
        const result = await doStream();
        const llmMs = Date.now() - llmStart;
        console.log(`  [OpenRouter LLM Stream] Connected in ${llmMs}ms`);
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
  // Gemini does not allow consecutive messages of the same role (e.g. user -> user).
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

  // NOTE: We intentionally DO NOT merge [tool] and [user] messages here.
  // The @ai-sdk/google provider natively translates `tool` roles to `user` role + functionResponse.
  // Converting tool-result parts to text parts manually breaks Gemini's strict sequence rule
  // that a `functionCall` turn must be followed by a `functionResponse` turn.

  return pass1;
}
