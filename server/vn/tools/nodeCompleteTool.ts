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
function resolveNextLocation(
  pkg: VNPackage,
  completedLocationId: string,
): { nextLocationId: string | null; nextActId: string | null } {
  const acts = pkg.plot.acts;
  if (!acts) return { nextLocationId: null, nextActId: null };

  for (let ai = 0; ai < acts.length; ai++) {
    const locations = acts[ai].sandboxLocations;
    if (!locations) continue;

    for (let ni = 0; ni < locations.length; ni++) {
      if (locations[ni].id === completedLocationId) {
        if (ni + 1 < locations.length) {
          return { nextLocationId: locations[ni + 1].id, nextActId: acts[ai].id };
        } else if (ai + 1 < acts.length) {
          return { nextLocationId: acts[ai + 1].sandboxLocations?.[0]?.id || null, nextActId: acts[ai + 1].id };
        }
        return { nextLocationId: null, nextActId: null };
      }
    }
  }
  return { nextLocationId: null, nextActId: null };
}

/**
 * Marks the current node as complete and returns the next location ID.
 * Storyteller calls this when exit conditions are met.
 */
export const nodeCompleteTool = tool({
  description: 'Mark current node as complete and get next node ID. Call when exit conditions are met.',
  inputSchema: z.object({
    sessionId: z.string(),
    completedLocationId: z.string().optional().describe('Optional: the ID of the location that was just completed'),
    nextLocationId: z.string().optional().describe('The ID of the next location to transition to'),
  }),
  execute: async ({ sessionId, completedLocationId: userCompletedLocationId, nextLocationId: nextLocationIdParam, nextActId: nextActIdParam }: { sessionId: string, completedLocationId?: string, nextLocationId?: string, nextActId?: string }) => {
    const state = db.select().from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();

    if (!state) {
      return { ok: false as const, error: 'No plot state found for session' };
    }

    const completedLocationId = userCompletedLocationId || state.currentLocationId;
    if (!completedLocationId) {
      return { ok: false as const, error: 'No current location ID found' };
    }

    // Auto-resolve next node from the plot if the LLM didn't provide one
    let resolvedNextLocationId = nextLocationIdParam ?? null;
    let resolvedNextActId = nextActIdParam ?? null;

    if (!resolvedNextLocationId) {
      const pkgRow = db.select().from(vnPackages).where(eq(vnPackages.id, state.packageId)).get();
      if (pkgRow) {
        const pkg = JSON.parse(pkgRow.metaJson) as VNPackage;
        const resolved = resolveNextLocation(pkg, completedLocationId);
        resolvedNextLocationId = resolved.nextLocationId;
        if (!resolvedNextActId) resolvedNextActId = resolved.nextActId;
      }
    }

    const completedLocations: string[] = JSON.parse(state.completedLocations || "[]");
    if (!completedLocations.includes(completedLocationId)) {
      completedLocations.push(completedLocationId);
    }

    const updates: Record<string, unknown> = {
      completedLocations: JSON.stringify(completedLocations),
      currentBeat: 0,
      offPathTurns: 0,
      updatedAt: new Date().toISOString(),
    };

    if (resolvedNextLocationId) {
      updates.currentLocationId = resolvedNextLocationId;
    }
    if (resolvedNextActId) {
      updates.currentActId = resolvedNextActId;
    }

    db.update(plotStates).set(updates).where(eq(plotStates.sessionId, sessionId)).run();

    const isGameComplete = !resolvedNextLocationId;

    return {
      ok: true as const,
      completedLocationId,
      nextLocationId: resolvedNextLocationId,
      isGameComplete,
    };
  },
});
