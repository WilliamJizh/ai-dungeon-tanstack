import { appendTraceStep, completeTrace, createTrace } from './traceStore.js';
import { MODEL_IDS } from '../lib/modelFactory.js';

/**
 * Creates an onStepFinish callback + bookkeeping for tracing the storyteller ToolLoopAgent
 * (vn-tell-chat pipeline). Returns { traceId, onStepFinish, finishTrace }.
 *
 * Usage in tellChatRoute:
 *   const { traceId, onStepFinish, finishTrace } = createTellChatTrace({ sessionId, requestId });
 *   const response = createAgentUIStreamResponse({ agent, uiMessages, onStepFinish });
 *   pump().then(() => finishTrace('success')).catch((err) => finishTrace('error', err));
 */

export function createTellChatTrace(opts: {
  sessionId: string;
  requestId?: string;
  modelId?: string;
  tags?: string[];
  source?: string;
}) {
  const {
    sessionId,
    requestId,
    modelId = MODEL_IDS.storyteller,
    tags = ['agent', 'storyteller'],
    source = 'tellChatRoute',
  } = opts;

  const traceId = createTrace(
    {
      requestId,
      sessionId,
      pipeline: 'vn-tell-chat',
      agentId: 'storyteller-chat-agent',
      modelProvider: 'google',
      modelId,
      tags,
      source,
    },
    { pipeline: 'vn-tell-chat', sessionId },
    { stage: 'start' },
  );

  const startedAt = Date.now();
  let stepCount = 0;
  let toolCallCount = 0;
  let frameCount = 0;

  const onStepFinish = (step: any) => {
    const idx = stepCount++;
    const calls = Array.isArray(step.toolCalls) ? step.toolCalls : [];
    toolCallCount += calls.length;
    frameCount += calls.filter((c: any) => c.toolName === 'frameBuilderTool').length;

    appendTraceStep({
      traceId,
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
    });
  };

  const finishTrace = (status: 'success' | 'error', error?: unknown) => {
    completeTrace({
      traceId,
      status,
      durationMs: Date.now() - startedAt,
      output: status === 'success' ? { stepCount, toolCallCount, frameCount } : undefined,
      error: error
        ? error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) }
        : undefined,
      meta: { stepCount, toolCallCount, frameCount },
    });
  };

  return { traceId, onStepFinish, finishTrace };
}
