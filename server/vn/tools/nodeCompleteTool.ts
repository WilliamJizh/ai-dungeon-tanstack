import { tool } from 'ai';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { plotStates, vnPackages } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { VNPackage } from '../types/vnTypes.js';

/**
 * Resolves the next node after the completed node
 * by checking if the LLM provided one, or falling back to the plot nodes array.
 */
function resolveNextNode(
  pkg: VNPackage,
  completedNodeId: string,
): { nextNodeId: string | null; nextActId: string | null } {
  const acts = pkg.plot.acts;
  for (let ai = 0; ai < acts.length; ai++) {
    const nodes = acts[ai].nodes;
    for (let ni = 0; ni < nodes.length; ni++) {
      if (nodes[ni].id === completedNodeId) {
        if (ni + 1 < nodes.length) {
          return { nextNodeId: nodes[ni + 1].id, nextActId: acts[ai].id };
        } else if (ai + 1 < acts.length) {
          return { nextNodeId: acts[ai + 1].nodes[0]?.id || null, nextActId: acts[ai + 1].id };
        }
        return { nextNodeId: null, nextActId: null };
      }
    }
  }
  return { nextNodeId: null, nextActId: null };
}

/**
 * Marks the current node as complete and returns the next node ID.
 * Storyteller calls this when exit conditions are met.
 */
export const nodeCompleteTool = tool({
  description: 'Mark current node as complete and get next node ID. Call when exit conditions are met.',
  inputSchema: z.object({
    sessionId: z.string(),
    completedNodeId: z.string().optional().describe('Optional: the ID of the node that was just completed'),
    nextNodeId: z.string().optional().describe('The ID of the next node to transition to'),
  }),
  execute: async ({ sessionId, completedNodeId: userCompletedNodeId, nextNodeId: nextNodeIdParam, nextActId: nextActIdParam }: { sessionId: string, completedNodeId?: string, nextNodeId?: string, nextActId?: string }) => {
    const state = db.select().from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();

    if (!state) {
      return { ok: false as const, error: 'No plot state found for session' };
    }

    const completedNodeId = userCompletedNodeId || state.currentNodeId;
    if (!completedNodeId) {
      return { ok: false as const, error: 'No current node ID found' };
    }

    // Auto-resolve next node from the plot if the LLM didn't provide one
    let resolvedNextNodeId = nextNodeIdParam ?? null;
    let resolvedNextActId = nextActIdParam ?? null;

    if (!resolvedNextNodeId) {
      const pkgRow = db.select().from(vnPackages).where(eq(vnPackages.id, state.packageId)).get();
      if (pkgRow) {
        const pkg = JSON.parse(pkgRow.metaJson) as VNPackage;
        const resolved = resolveNextNode(pkg, completedNodeId);
        resolvedNextNodeId = resolved.nextNodeId;
        if (!resolvedNextActId) resolvedNextActId = resolved.nextActId;
      }
    }

    const completedNodes: string[] = JSON.parse(state.completedNodes || "[]");
    if (!completedNodes.includes(completedNodeId)) {
      completedNodes.push(completedNodeId);
    }

    const updates: Record<string, unknown> = {
      completedNodes: JSON.stringify(completedNodes),
      currentBeat: 0,
      offPathTurns: 0,
      updatedAt: new Date().toISOString(),
    };

    if (resolvedNextNodeId) {
      updates.currentNodeId = resolvedNextNodeId;
    }
    if (resolvedNextActId) {
      updates.currentActId = resolvedNextActId;
    }

    db.update(plotStates).set(updates).where(eq(plotStates.sessionId, sessionId)).run();

    const isGameComplete = !resolvedNextNodeId;

    return {
      ok: true as const,
      completedNodeId,
      nextNodeId: resolvedNextNodeId,
      isGameComplete,
    };
  },
});
