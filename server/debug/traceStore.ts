import { and, asc, desc, eq, gte, like, lte } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db, sqlite } from '../db/index.js';
import { aiTraceSteps, aiTraces } from '../db/schema.js';
import { safeJsonStringify } from './redact.js';

// Pre-compiled prepared statement for trace step inserts (raw SQL bypasses Drizzle bug)
const insertStepStmt = sqlite.prepare(`
  INSERT INTO ai_trace_steps (id, trace_id, step_index, finish_reason, raw_finish_reason,
    usage_json, request_json, response_json, tool_calls_json, tool_results_json, content_json)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

export function appendTraceStep(step: TraceStepInput): void {
  // AI SDK v3 may return finishReason as an object — ensure it's always a string or null
  const finishReason = step.finishReason == null ? null
    : typeof step.finishReason === 'string' ? step.finishReason
      : JSON.stringify(step.finishReason);
  const rawFinishReason = step.rawFinishReason == null ? null
    : typeof step.rawFinishReason === 'string' ? step.rawFinishReason
      : JSON.stringify(step.rawFinishReason);

  const sql = `INSERT INTO ai_trace_steps (id, trace_id, step_index, finish_reason, raw_finish_reason,
    usage_json, request_json, response_json, tool_calls_json, tool_results_json, content_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  sqlite.prepare(sql).run(
    uuidv4(),
    step.traceId,
    step.stepIndex,
    finishReason,
    rawFinishReason,
    step.usage === undefined ? null : safeJsonStringify(step.usage),
    step.request === undefined ? null : safeJsonStringify(step.request),
    step.response === undefined ? null : safeJsonStringify(step.response),
    step.toolCalls === undefined ? null : safeJsonStringify(step.toolCalls),
    step.toolResults === undefined ? null : safeJsonStringify(step.toolResults),
    step.content === undefined ? null : safeJsonStringify(step.content),
  );
}

export interface TraceContext {
  requestId?: string;
  sessionId?: string;
  pipeline: string;
  agentId: string;
  modelProvider: string;
  modelId: string;
  /** Category tags for filtering e.g. ['image-gen', 'scene']. */
  tags?: string[];
  /** Call origin for filtering e.g. 'imageAgent.generateSceneImage'. */
  source?: string;
}

export interface TraceStepInput {
  traceId: string;
  stepIndex: number;
  finishReason?: string;
  rawFinishReason?: string;
  usage?: unknown;
  request?: unknown;
  response?: unknown;
  toolCalls?: unknown;
  toolResults?: unknown;
  content?: unknown;
}

export function createTrace(context: TraceContext, input: unknown, meta: Record<string, unknown> = {}): string {
  const traceId = uuidv4();
  db.insert(aiTraces).values({
    id: traceId,
    createdAt: new Date().toISOString(),
    requestId: context.requestId ?? null,
    sessionId: context.sessionId ?? null,
    pipeline: context.pipeline,
    agentId: context.agentId,
    modelProvider: context.modelProvider,
    modelId: context.modelId,
    status: 'running',
    inputJson: safeJsonStringify(input),
    metaJson: safeJsonStringify(meta),
    tags: context.tags ? JSON.stringify(context.tags) : null,
    source: context.source ?? null,
  }).run();
  return traceId;
}




export function completeTrace(args: {
  traceId: string;
  status: 'success' | 'error';
  durationMs: number;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  meta?: Record<string, unknown>;
}): void {
  db.update(aiTraces)
    .set({
      status: args.status,
      durationMs: args.durationMs,
      inputJson: args.input !== undefined ? safeJsonStringify(args.input) : undefined,
      outputJson: args.output === undefined ? null : safeJsonStringify(args.output),
      errorJson: args.error === undefined ? null : safeJsonStringify(args.error),
      metaJson: args.meta ? safeJsonStringify(args.meta) : undefined,
    })
    .where(eq(aiTraces.id, args.traceId))
    .run();
}

export interface ListTraceFilters {
  sessionId?: string;
  requestId?: string;
  pipeline?: string;
  agentId?: string;
  status?: string;
  /** Exact match on the source column e.g. 'imageAgent.generateSceneImage'. */
  source?: string;
  /** Filter traces containing this tag in their JSON array e.g. 'image-gen'. */
  tag?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

function parseJsonField(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function listTraces(filters: ListTraceFilters) {
  const conditions = [];
  if (filters.sessionId) conditions.push(eq(aiTraces.sessionId, filters.sessionId));
  if (filters.requestId) conditions.push(eq(aiTraces.requestId, filters.requestId));
  if (filters.pipeline) conditions.push(eq(aiTraces.pipeline, filters.pipeline));
  if (filters.agentId) conditions.push(eq(aiTraces.agentId, filters.agentId));
  if (filters.status) conditions.push(eq(aiTraces.status, filters.status));
  if (filters.source) conditions.push(eq(aiTraces.source, filters.source));
  // Tags is stored as a JSON array string; LIKE '%"tag"%' checks array membership.
  if (filters.tag) conditions.push(like(aiTraces.tags, `%"${filters.tag}"%`));
  if (filters.from) conditions.push(gte(aiTraces.createdAt, filters.from));
  if (filters.to) conditions.push(lte(aiTraces.createdAt, filters.to));

  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  const rows = db.select().from(aiTraces)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(aiTraces.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  return rows.map((row) => ({
    ...row,
    tags: parseJsonField(row.tags) as string[] | null,
    input: parseJsonField(row.inputJson),
    output: parseJsonField(row.outputJson),
    error: parseJsonField(row.errorJson),
    meta: parseJsonField(row.metaJson),
  }));
}

export function getTraceById(traceId: string) {
  const trace = db.select().from(aiTraces).where(eq(aiTraces.id, traceId)).get();
  if (!trace) return null;

  const steps = db.select().from(aiTraceSteps)
    .where(eq(aiTraceSteps.traceId, traceId))
    .orderBy(asc(aiTraceSteps.stepIndex))
    .all()
    .map((s) => ({
      ...s,
      usage: parseJsonField(s.usageJson),
      request: parseJsonField(s.requestJson),
      response: parseJsonField(s.responseJson),
      toolCalls: parseJsonField(s.toolCallsJson),
      toolResults: parseJsonField(s.toolResultsJson),
      content: parseJsonField(s.contentJson),
    }));

  return {
    ...trace,
    tags: parseJsonField(trace.tags) as string[] | null,
    input: parseJsonField(trace.inputJson),
    output: parseJsonField(trace.outputJson),
    error: parseJsonField(trace.errorJson),
    meta: parseJsonField(trace.metaJson),
    steps,
  };
}
