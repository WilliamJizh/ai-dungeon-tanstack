import { generateObject, generateText } from 'ai';
import { appendTraceStep, completeTrace, createTrace, type TraceContext } from './traceStore.js';
import { sanitizeForTrace } from './redact.js';

export interface AIDebugContext {
  requestId?: string;
  sessionId?: string;
  pipeline: string;
  agentId: string;
  modelProvider?: string;
  modelId: string;
  /** Category tags for filtering e.g. ['image-gen', 'scene']. */
  tags?: string[];
  /** Call origin for filtering e.g. 'imageAgent.generateSceneImage'. */
  source?: string;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function isTraceEnabled(): boolean {
  return envBool('AI_TRACE_ENABLED', process.env.NODE_ENV !== 'production');
}

function includeRawPayloads(): boolean {
  return envBool('AI_TRACE_INCLUDE_RAW', process.env.NODE_ENV !== 'production');
}

function traceContextFrom(input: AIDebugContext): TraceContext {
  return {
    requestId: input.requestId,
    sessionId: input.sessionId,
    pipeline: input.pipeline,
    agentId: input.agentId,
    modelProvider: input.modelProvider ?? 'google',
    modelId: input.modelId,
    tags: input.tags,
    source: input.source,
  };
}

function serializeError(err: unknown) {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }
  return {
    name: 'UnknownError',
    message: String(err),
  };
}

function toStepRows(steps: any[], includeRaw: boolean) {
  return steps.map((step, stepIndex) => ({
    stepIndex,
    finishReason: step?.finishReason,
    rawFinishReason: step?.rawFinishReason,
    usage: step?.usage,
    request: includeRaw ? step?.request : undefined,
    response: includeRaw ? step?.response : undefined,
    toolCalls: step?.toolCalls,
    toolResults: step?.toolResults,
    content: includeRaw ? step?.content : undefined,
  }));
}

export async function tracedGenerateText(input: any, context: AIDebugContext): Promise<any> {
  if (!isTraceEnabled()) return generateText(input);

  const includeRaw = includeRawPayloads();
  const traceInput = {
    type: 'generateText',
    system: includeRaw ? input.system : '[hidden]',
    prompt: includeRaw ? input.prompt : undefined,
    messages: includeRaw ? input.messages : '[hidden]',
    tools: input.tools ? Object.keys(input.tools) : [],
    stopWhen: input.stopWhen ? '[provided]' : undefined,
  };

  const traceId = createTrace(traceContextFrom(context), sanitizeForTrace(traceInput), {
    includeRaw,
    stage: 'start',
  });
  const startedAt = Date.now();

  try {
    const result = await generateText(input);
    const steps = Array.isArray(result.steps) ? result.steps : [];
    const stepRows = toStepRows(steps, includeRaw);
    for (const step of stepRows) {
      appendTraceStep({ traceId, ...step });
    }

    completeTrace({
      traceId,
      status: 'success',
      durationMs: Date.now() - startedAt,
      output: sanitizeForTrace({
        text: result.text,
        finishReason: result.finishReason,
        usage: result.usage,
        totalUsage: result.totalUsage,
        warnings: result.warnings,
        output: includeRaw ? result.output : undefined,
      }),
      meta: {
        stepCount: steps.length,
        toolCallCount: stepRows.reduce((sum, step) => sum + (Array.isArray(step.toolCalls) ? step.toolCalls.length : 0), 0),
        promptTokens: (result.totalUsage as any)?.inputTokens,
        completionTokens: (result.totalUsage as any)?.outputTokens,
        totalTokens: (result.totalUsage as any)?.totalTokens,
      },
    });
    return result;
  } catch (err) {
    completeTrace({
      traceId,
      status: 'error',
      durationMs: Date.now() - startedAt,
      error: serializeError(err),
      meta: { stage: 'generateText' },
    });
    throw err;
  }
}

export async function tracedGenerateObject(input: any, context: AIDebugContext): Promise<any> {
  if (!isTraceEnabled()) return generateObject(input);

  const includeRaw = includeRawPayloads();
  const traceInput = {
    type: 'generateObject',
    system: includeRaw ? input.system : '[hidden]',
    prompt: includeRaw ? input.prompt : '[hidden]',
    schema: '[provided]',
  };

  const traceId = createTrace(traceContextFrom(context), sanitizeForTrace(traceInput), {
    includeRaw,
    stage: 'start',
  });
  const startedAt = Date.now();

  try {
    const result = await generateObject(input);
    appendTraceStep({
      traceId,
      stepIndex: 0,
      finishReason: result.finishReason,
      usage: result.usage,
      request: includeRaw ? result.request : undefined,
      response: includeRaw ? result.response : undefined,
    });

    completeTrace({
      traceId,
      status: 'success',
      durationMs: Date.now() - startedAt,
      output: sanitizeForTrace({
        object: result.object,
        finishReason: result.finishReason,
        reasoning: result.reasoning,
        usage: result.usage,
        warnings: result.warnings,
      }),
      meta: {
        stepCount: 1,
        promptTokens: (result.usage as any)?.inputTokens,
        completionTokens: (result.usage as any)?.outputTokens,
        totalTokens: (result.usage as any)?.totalTokens,
      },
    });

    return result;
  } catch (err) {
    completeTrace({
      traceId,
      status: 'error',
      durationMs: Date.now() - startedAt,
      error: serializeError(err),
      meta: { stage: 'generateObject' },
    });
    throw err;
  }
}

/**
 * Wraps any async native SDK call (e.g. Google GenAI image/music generation)
 * with trace recording. Pass an inputSummary of safe, non-binary fields only.
 */
export async function tracedNativeCall<T>(
  fn: () => Promise<T>,
  context: AIDebugContext,
  inputSummary: Record<string, unknown>,
): Promise<T> {
  if (!isTraceEnabled()) return fn();

  const traceId = createTrace(traceContextFrom(context), sanitizeForTrace(inputSummary), {
    stage: 'start',
  });
  const startedAt = Date.now();

  try {
    const result = await fn();
    completeTrace({
      traceId,
      status: 'success',
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (err) {
    completeTrace({
      traceId,
      status: 'error',
      durationMs: Date.now() - startedAt,
      error: serializeError(err),
    });
    throw err;
  }
}
