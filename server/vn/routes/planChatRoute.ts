import type { FastifyInstance } from 'fastify';
import { createAgentUIStreamResponse } from 'ai';
import { createPlanningAgent } from '../agents/planningChatAgent.js';
import { getOrCreatePlanSession } from '../state/planSessionStore.js';
import { createPlanChatTrace } from '../../debug/tracePlanChat.js';

export async function planChatRoute(app: FastifyInstance) {
  app.post<{
    Body: {
      messages: unknown[];
      sessionId: string;
    };
  }>('/chat', async (req, reply) => {
    const { messages: uiMessages, sessionId } = req.body;

    if (!sessionId) {
      return reply.status(400).send({ error: 'sessionId is required' });
    }

    if (!Array.isArray(uiMessages)) {
      return reply.status(400).send({ error: 'messages must be an array' });
    }

    req.log.info({ reqId: req.id, sessionId, messageCount: uiMessages.length }, '[VN plan/chat] request');

    const session = getOrCreatePlanSession(sessionId);
    const agent = createPlanningAgent(session);
    const { traceId, onStepFinish, finishTrace } = createPlanChatTrace({
      sessionId,
      requestId: req.id,
    });

    req.log.info({ traceId }, '[VN plan/chat] trace started');

    let response: Response;
    try {
      response = await createAgentUIStreamResponse({ agent, uiMessages, onStepFinish });
    } catch (err) {
      finishTrace('error', err);
      req.log.error({ err }, '[VN plan/chat] agent init error');
      return reply.status(500).send({ error: 'Agent initialization failed' });
    }

    // Forward headers and body from the Response object to Fastify reply
    reply.hijack();
    const nodeReply = reply.raw;

    response.headers.forEach((value, key) => {
      nodeReply.setHeader(key, value);
    });
    nodeReply.writeHead(response.status);

    const reader = response.body!.getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) { nodeReply.end(); break; }
        nodeReply.write(value);
      }
    };
    pump()
      .then(() => finishTrace('success'))
      .catch((err) => {
        req.log.error({ err }, '[VN plan/chat] stream error');
        finishTrace('error', err);
        nodeReply.end();
      });
  });
}
