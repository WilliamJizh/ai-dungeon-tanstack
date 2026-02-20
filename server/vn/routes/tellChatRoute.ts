import type { FastifyInstance } from 'fastify';
import { createAgentUIStreamResponse } from 'ai';
import { db } from '../../db/index.js';
import { plotStates, vnPackages } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { createStorytellerAgent } from '../agents/storytellerChatAgent.js';
import { vnPackageStore } from '../state/vnPackageStore.js';
import { createTellChatTrace } from '../../debug/traceTellChat.js';
import type { VNPackage } from '../types/vnTypes.js';

async function loadVNPackage(packageId: string): Promise<VNPackage | null> {
  if (vnPackageStore.has(packageId)) {
    return vnPackageStore.get(packageId)!;
  }
  const row = db.select().from(vnPackages).where(eq(vnPackages.id, packageId)).get();
  if (!row) return null;
  const pkg = JSON.parse(row.metaJson) as VNPackage;
  vnPackageStore.set(packageId, pkg);
  return pkg;
}

function initPlotStateIfNeeded(sessionId: string, packageId: string, vnPackage: VNPackage) {
  const existing = db
    .select({ sessionId: plotStates.sessionId })
    .from(plotStates)
    .where(eq(plotStates.sessionId, sessionId))
    .get();
  if (existing) return;

  const firstAct = vnPackage.plot.acts[0];
  const firstScene = firstAct?.scenes[0];
  if (!firstAct || !firstScene) return;

  db.insert(plotStates).values({
    sessionId,
    packageId,
    currentActId: firstAct.id,
    currentSceneId: firstScene.id,
    currentBeat: 0,
    offPathTurns: 0,
    completedScenes: '[]',
    flagsJson: '{}',
    updatedAt: new Date().toISOString(),
  }).run();
}

export async function tellChatRoute(app: FastifyInstance) {
  app.post<{
    Body: {
      messages: unknown[];
      sessionId: string;
      packageId: string;
    };
  }>('/tell-chat', async (req, reply) => {
    const { messages: uiMessages, sessionId, packageId } = req.body;

    if (!sessionId || !packageId) {
      return reply.status(400).send({ error: 'sessionId and packageId are required' });
    }

    if (!Array.isArray(uiMessages)) {
      return reply.status(400).send({ error: 'messages must be an array' });
    }

    req.log.info(
      { reqId: req.id, sessionId, packageId, messageCount: uiMessages.length },
      '[VN tell/chat] request',
    );

    const vnPackage = await loadVNPackage(packageId);
    if (!vnPackage) {
      return reply.status(404).send({ error: 'VN package not found' });
    }

    initPlotStateIfNeeded(sessionId, packageId, vnPackage);

    const agent = createStorytellerAgent(vnPackage, sessionId);
    const { traceId, onStepFinish, finishTrace } = createTellChatTrace({
      sessionId,
      requestId: req.id,
    });

    req.log.info({ traceId }, '[VN tell/chat] trace started');

    let response: Response;
    try {
      response = await createAgentUIStreamResponse({ agent, uiMessages, onStepFinish });
    } catch (err) {
      finishTrace('error', err);
      req.log.error({ err }, '[VN tell/chat] agent init error');
      return reply.status(500).send({ error: 'Agent initialization failed' });
    }

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
        if (done) {
          nodeReply.end();
          break;
        }
        nodeReply.write(value);
      }
    };
    pump()
      .then(() => finishTrace('success'))
      .catch((err) => {
        req.log.error({ err }, '[VN tell/chat] stream error');
        finishTrace('error', err);
        nodeReply.end();
      });
  });
}
