import type { FastifyInstance } from 'fastify';
import { runPlanPhase } from '../workflows/planPhase.js';

export async function planRoute(app: FastifyInstance) {
  app.get<{
    Querystring: {
      genre: string;
      setting: string;
      protagonist: string;
      context?: string;
    };
  }>('/plan', async (req, reply) => {
    const { genre, setting, protagonist, context } = req.query;

    if (!genre || !setting || !protagonist) {
      return reply.status(400).send({ error: 'genre, setting, and protagonist are required' });
    }

    req.log.info({
      reqId: req.id,
      genre,
      settingLength: setting.length,
      protagonistLength: protagonist.length,
      hasContext: Boolean(context && context.trim().length > 0),
    }, '[VN plan] request accepted');

    reply.hijack();
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.writeHead(200);
    reply.raw.flushHeaders?.();

    reply.raw.on('close', () => {
      req.log.info({ reqId: req.id }, '[VN plan] SSE stream closed');
    });

    await runPlanPhase(
      {
        genre,
        setting,
        protagonistDescription: protagonist,
        additionalContext: context,
      },
      reply.raw,
      { requestId: req.id, log: req.log },
    );
  });
}
