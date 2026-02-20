import { tool } from 'ai';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { plotStates, vnPackages } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { VNPackage } from '../types/vnTypes.js';

/**
 * Resolves the next scene (and act) after the completed scene
 * by walking through the plot's acts and scenes in order.
 */
function resolveNextScene(
  pkg: VNPackage,
  completedSceneId: string,
): { nextSceneId: string | null; nextActId: string | null } {
  const acts = pkg.plot.acts;
  for (let ai = 0; ai < acts.length; ai++) {
    const act = acts[ai];
    for (let si = 0; si < act.scenes.length; si++) {
      if (act.scenes[si].id === completedSceneId) {
        // Next scene in the same act
        if (si + 1 < act.scenes.length) {
          return { nextSceneId: act.scenes[si + 1].id, nextActId: act.id };
        }
        // First scene of the next act
        if (ai + 1 < acts.length && acts[ai + 1].scenes.length > 0) {
          return { nextSceneId: acts[ai + 1].scenes[0].id, nextActId: acts[ai + 1].id };
        }
        // No more scenes — game complete
        return { nextSceneId: null, nextActId: null };
      }
    }
  }
  return { nextSceneId: null, nextActId: null };
}

/**
 * Marks the current scene as complete and returns the next scene ID.
 * Storyteller calls this when exit conditions are met.
 * If the LLM does not supply nextSceneId, the tool automatically resolves
 * it from the plot structure stored in the database.
 */
export const sceneCompleteTool = tool({
  description: 'Mark current scene as complete and get next scene ID. Call when exit conditions are met.',
  parameters: z.object({
    sessionId: z.string(),
    completedSceneId: z.string().describe('The ID of the scene that was just completed'),
    nextSceneId: z.string().optional().describe('The ID of the next scene to transition to'),
    nextActId: z.string().optional().describe('The ID of the next act, if transitioning between acts'),
  }),
  execute: async ({ sessionId, completedSceneId, nextSceneId: nextSceneIdParam, nextActId: nextActIdParam }) => {
    const state = db.select().from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();

    if (!state) {
      return { ok: false as const, error: 'No plot state found for session' };
    }

    // Auto-resolve next scene from the plot if the LLM didn't provide one
    let resolvedNextSceneId = nextSceneIdParam ?? null;
    let resolvedNextActId = nextActIdParam ?? null;

    if (!resolvedNextSceneId) {
      const pkgRow = db.select().from(vnPackages).where(eq(vnPackages.id, state.packageId)).get();
      if (pkgRow) {
        const pkg = JSON.parse(pkgRow.metaJson) as VNPackage;
        const resolved = resolveNextScene(pkg, completedSceneId);
        resolvedNextSceneId = resolved.nextSceneId;
        if (!resolvedNextActId) {
          resolvedNextActId = resolved.nextActId;
        }
      }
    }

    const completedScenes: string[] = JSON.parse(state.completedScenes);
    if (!completedScenes.includes(completedSceneId)) {
      completedScenes.push(completedSceneId);
    }

    const updates: Record<string, unknown> = {
      completedScenes: JSON.stringify(completedScenes),
      currentBeat: 0,
      offPathTurns: 0,
      updatedAt: new Date().toISOString(),
    };

    if (resolvedNextSceneId) {
      updates.currentSceneId = resolvedNextSceneId;
    }
    if (resolvedNextActId) {
      updates.currentActId = resolvedNextActId;
    }

    db.update(plotStates).set(updates).where(eq(plotStates.sessionId, sessionId)).run();

    const isGameComplete = !resolvedNextSceneId;

    return {
      ok: true as const,
      completedSceneId,
      nextSceneId: resolvedNextSceneId,
      nextActId: resolvedNextActId,
      isGameComplete,
    };
  },
});
