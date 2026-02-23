import type { FastifyInstance } from 'fastify';
import { createAgentUIStreamResponse } from 'ai';
import { createPlanningAgent } from '../agents/planningChatAgent.js';
import { getOrCreatePlanSession } from '../state/planSessionStore.js';
import { startLLMTrace, getActiveModelInfo } from '../../lib/modelFactory.js';

function extractFileParts(messages: unknown[]): Array<{ url: string; mediaType: string }> {
  const result: Array<{ url: string; mediaType: string }> = [];
  // Find the last user message and collect its file parts
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as { role?: string; parts?: Array<{ type?: string; url?: string; mediaType?: string }> };
    if (msg?.role !== 'user') continue;
    for (const part of msg.parts ?? []) {
      if (part.type === 'file' && part.url && part.mediaType) {
        result.push({ url: part.url, mediaType: part.mediaType });
      }
    }
    break; // only the latest user message
  }
  return result;
}

export async function planChatRoute(app: FastifyInstance) {
  app.post<{
    Body: {
      messages: unknown[];
      sessionId: string;
      locale?: string;
    };
  }>('/chat', async (req, reply) => {
    const { messages: uiMessages, sessionId, locale } = req.body;

    if (!sessionId) {
      return reply.status(400).send({ error: 'sessionId is required' });
    }

    if (!Array.isArray(uiMessages)) {
      return reply.status(400).send({ error: 'messages must be an array' });
    }

    req.log.info({ reqId: req.id, sessionId, messageCount: uiMessages.length }, '[VN plan/chat] request');

    const session = getOrCreatePlanSession(sessionId, locale);

    // Extract any file attachments from the latest user message and store in session
    const newFiles = extractFileParts(uiMessages);
    for (const f of newFiles) {
      if (!session.draft.referenceImages.some(r => r.url === f.url)) {
        session.draft.referenceImages.push(f);
      }
    }

    const agent = createPlanningAgent(session);
    const { provider, modelId } = getActiveModelInfo('planning');
    const { traceId, onStepFinish, finishTrace } = startLLMTrace({
      sessionId, requestId: req.id,
      pipeline: 'vn-plan-chat', agentId: 'planning-chat-agent',
      modelProvider: provider, modelId: modelId,
      tags: ['agent', 'plan-chat'], source: 'planChatRoute',
    }, { pipeline: 'vn-plan-chat', sessionId });

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
