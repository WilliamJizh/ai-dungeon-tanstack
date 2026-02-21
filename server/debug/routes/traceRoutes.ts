import type { FastifyInstance } from 'fastify';
import { getTraceById, listTraces } from '../traceStore.js';
import { summarizeTraces } from '../traceSummarizer.js';

export async function traceRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: {
      sessionId?: string;
      requestId?: string;
      pipeline?: string;
      agentId?: string;
      status?: string;
      source?: string;
      tag?: string;
      from?: string;
      to?: string;
      limit?: string;
      offset?: string;
    };
  }>('/traces', async (req, reply) => {
    const traces = listTraces({
      sessionId: req.query.sessionId,
      requestId: req.query.requestId,
      pipeline: req.query.pipeline,
      agentId: req.query.agentId,
      status: req.query.status,
      source: req.query.source,
      tag: req.query.tag,
      from: req.query.from,
      to: req.query.to,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      offset: req.query.offset ? Number(req.query.offset) : undefined,
    });
    return reply.send({ traces });
  });

  app.get<{
    Params: { traceId: string };
  }>('/traces/:traceId', async (req, reply) => {
    const trace = getTraceById(req.params.traceId);
    if (!trace) return reply.status(404).send({ error: 'Trace not found' });
    return reply.send(trace);
  });

  app.post<{
    Body: {
      traceId?: string;
      sessionId?: string;
      requestId?: string;
      maxTraces?: number;
    };
  }>('/traces/summarize', async (req, reply) => {
    const summary = summarizeTraces({
      traceId: req.body?.traceId,
      sessionId: req.body?.sessionId,
      requestId: req.body?.requestId,
      maxTraces: req.body?.maxTraces,
    });
    return reply.send(summary);
  });
}

