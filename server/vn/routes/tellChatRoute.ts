import type { FastifyInstance } from 'fastify';
import { createAgentUIStreamResponse } from 'ai';
import { db } from '../../db/index.js';
import { plotStates, vnPackages } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { createStorytellerAgent } from '../agents/storytellerChatAgent.js';
import { vnPackageStore } from '../state/vnPackageStore.js';
import { startLLMTrace, MODEL_IDS } from '../../lib/modelFactory.js';
import { compressContext, summarizeNodeInBackground } from '../utils/contextCompressor.js';
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

  if (!vnPackage.plot.acts || vnPackage.plot.acts.length === 0 || vnPackage.plot.acts[0].nodes.length === 0) {
    // Original instruction had `return c.json(...)`, adapting to current function context
    // This function is void, so just return.
    return;
  }

  const firstNode = vnPackage.plot.acts[0].nodes[0];

  // Initialize fresh playback state
  db.insert(plotStates).values({
    sessionId,
    packageId: packageId,
    currentNodeId: firstNode.id,
    currentActId: vnPackage.plot.acts[0].id,
    currentBeat: 0,
    offPathTurns: 0,
    completedNodes: '[]',
    playerStatsJson: '{}', // starting inventory/skills
    flagsJson: '{}',       // starting flags
    updatedAt: new Date().toISOString()
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

    // Get the current node ID and story summary before the AI acts
    const preTurnState = db.select({ currentNodeId: plotStates.currentNodeId, storySummary: plotStates.storySummary }).from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();

    // Compress the context array before giving it to the LLM
    // (summarize-then-cut if messages exceed HIGH_WATER threshold)
    const compressedMessages = await compressContext(uiMessages as any[], sessionId, preTurnState?.storySummary || '');

    const agent = createStorytellerAgent(vnPackage, sessionId);
    const { traceId, onStepFinish, finishTrace } = startLLMTrace({
      sessionId, requestId: req.id,
      pipeline: 'vn-tell-chat', agentId: 'storyteller-chat-agent',
      modelProvider: 'google', modelId: MODEL_IDS.storyteller,
      tags: ['agent', 'storyteller'], source: 'tellChatRoute',
    }, { pipeline: 'vn-tell-chat', sessionId });

    req.log.info({ traceId }, '[VN tell/chat] trace started');

    let response: Response;
    try {
      response = await createAgentUIStreamResponse({ agent, uiMessages: compressedMessages, onStepFinish });
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
      .then(() => {
        finishTrace('success');

        // After the stream finishes, check if the node changed during this turn
        if (preTurnState) {
          const postTurnState = db.select({ currentNodeId: plotStates.currentNodeId }).from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();
          if (postTurnState && postTurnState.currentNodeId !== preTurnState.currentNodeId) {
            req.log.info({ sessionId, from: preTurnState.currentNodeId, to: postTurnState.currentNodeId }, '[VN tell/chat] Node transitioned. Kicking off background summarizer.');
            // Fire and forget the summariser
            summarizeNodeInBackground(sessionId, uiMessages as any[], preTurnState.storySummary);
          }
        }
      })
      .catch((err) => {
        req.log.error({ err }, '[VN tell/chat] stream error');
        finishTrace('error', err);
        nodeReply.end();
      });
  });
}
