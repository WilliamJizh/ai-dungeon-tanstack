import { v4 as uuidv4 } from 'uuid';
import { appendTraceStep, completeTrace, createTrace } from './traceStore.js';

/**
 * Creates an onStepFinish callback + bookkeeping for tracing a ToolLoopAgent
 * (plan/chat pipeline). Returns { traceId, onStepFinish, finishTrace }.
 *
 * Usage in planChatRoute:
 *   const { onStepFinish, finishTrace } = createPlanChatTrace({ sessionId, requestId });
 *   const response = createAgentUIStreamResponse({ agent, uiMessages, onStepFinish });
 *   pump().then(() => finishTrace('success')).catch(() => finishTrace('error'));
 */

export function createPlanChatTrace(opts: {
  sessionId: string;
  requestId?: string;
  modelId?: string;
}) {
  const { sessionId, requestId, modelId = process.env.GEMINI_CHAT_MODEL ?? 'gemini-3-flash-preview' } = opts;

  const traceId = createTrace(
    {
      requestId,
      sessionId,
      pipeline: 'vn-plan-chat',
      agentId: 'planning-chat-agent',
      modelProvider: 'google',
      modelId,
    },
    { pipeline: 'vn-plan-chat', sessionId },
    { stage: 'start' },
  );

  const startedAt = Date.now();
  let stepCount = 0;
  let toolCallCount = 0;

  const onStepFinish = (step: any) => {
    const idx = stepCount++;
    const calls = Array.isArray(step.toolCalls) ? step.toolCalls : [];
    toolCallCount += calls.length;

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
      output: status === 'success' ? { stepCount, toolCallCount } : undefined,
      error: error
        ? error instanceof Error
          ? { name: error.name, message: error.message }
          : { message: String(error) }
        : undefined,
      meta: { stepCount, toolCallCount },
    });
  };

  return { traceId, onStepFinish, finishTrace };
}
