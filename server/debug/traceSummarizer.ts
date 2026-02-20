import { getTraceById, listTraces } from './traceStore.js';

interface SummarizeInput {
  traceId?: string;
  sessionId?: string;
  requestId?: string;
  maxTraces?: number;
}

function countToolResultAnomalies(trace: any): number {
  if (!Array.isArray(trace.steps)) return 0;
  let anomalies = 0;
  for (const step of trace.steps) {
    const toolResults = step.toolResults;
    if (!Array.isArray(toolResults)) continue;
    for (const result of toolResults) {
      if (result?.output === undefined) anomalies += 1;
    }
  }
  return anomalies;
}

function extractToolNames(trace: any): string[] {
  if (!Array.isArray(trace.steps)) return [];
  const names = new Set<string>();
  for (const step of trace.steps) {
    if (!Array.isArray(step.toolCalls)) continue;
    for (const call of step.toolCalls) {
      if (typeof call?.toolName === 'string') names.add(call.toolName);
    }
  }
  return Array.from(names);
}

export function summarizeTraces(input: SummarizeInput) {
  const traces = input.traceId
    ? (() => {
        const trace = getTraceById(input.traceId!);
        return trace ? [trace] : [];
      })()
    : listTraces({
        sessionId: input.sessionId,
        requestId: input.requestId,
        limit: input.maxTraces ?? 5,
      }).map((summary) => getTraceById(summary.id)).filter(Boolean) as any[];

  const timeline = traces.map((trace) => ({
    traceId: trace.id,
    createdAt: trace.createdAt,
    pipeline: trace.pipeline,
    agentId: trace.agentId,
    status: trace.status,
    durationMs: trace.durationMs ?? null,
    stepCount: Array.isArray(trace.steps) ? trace.steps.length : 0,
    toolNames: extractToolNames(trace),
    anomalyCount: countToolResultAnomalies(trace),
  }));

  const totalAnomalies = timeline.reduce((sum, item) => sum + item.anomalyCount, 0);
  const failedTraces = timeline.filter((item) => item.status === 'error').length;

  const findings: string[] = [];
  if (failedTraces > 0) findings.push(`${failedTraces} trace(s) ended with status=error.`);
  if (totalAnomalies > 0) findings.push(`${totalAnomalies} tool result anomaly/anomalies detected (missing output payloads).`);
  if (timeline.length > 0 && timeline.every((t) => t.stepCount === 0)) {
    findings.push('No step data was captured; inspect instrumentation wiring.');
  }
  if (findings.length === 0) findings.push('No critical anomalies detected in selected traces.');

  const recommendations: string[] = [];
  if (totalAnomalies > 0) {
    recommendations.push('Inspect tool execution results for provider-side tool-output omissions.');
    recommendations.push('Verify tool schema compliance and ensure model is configured for tool calling.');
  }
  if (failedTraces > 0) {
    recommendations.push('Review trace error payloads and stack traces for failing call path.');
  }
  if (recommendations.length === 0) {
    recommendations.push('Use trace detail endpoint for deeper prompt and step-level analysis.');
  }

  return {
    traceCount: traces.length,
    findings,
    recommendations,
    timeline,
  };
}

