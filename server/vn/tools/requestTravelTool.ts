import { tool } from 'ai';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { plotStates, vnPackages } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { VNPackage } from '../types/vnTypes.js';
import { vnPackageStore } from '../state/vnPackageStore.js';

/**
 * Instant sandbox location travel tool.
 * Validates the target is reachable from current location via connections[],
 * updates currentLocationId in the DB, and returns the new location's data.
 *
 * Unlike the old nodeCompleteTool, this does NOT mark locations as "completed"
 * — sandbox locations are revisitable.
 */
export const requestTravelTool = tool({
  description: 'Travel to a connected location in the sandbox. Validates the target is reachable and updates the current location immediately.',
  inputSchema: z.object({
    sessionId: z.string(),
    targetLocationId: z.string().describe('The ID of the location to travel to (must be in availableConnections)'),
  }),
  execute: async ({ sessionId, targetLocationId }) => {
    const state = db.select().from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();
    if (!state) {
      return { ok: false, error: 'No plot state found for session' };
    }

    // Load package
    let pkg: VNPackage | undefined;
    if (vnPackageStore.has(state.packageId)) {
      pkg = vnPackageStore.get(state.packageId)!;
    } else {
      const pkgRow = db.select().from(vnPackages).where(eq(vnPackages.id, state.packageId)).get();
      if (pkgRow) {
        pkg = JSON.parse(pkgRow.metaJson) as VNPackage;
        vnPackageStore.set(state.packageId, pkg);
      }
    }

    if (!pkg) return { ok: false, error: 'VN package not found' };

    const act = pkg.plot.acts.find(a => a.id === state.currentActId);
    const currentLocation = act?.sandboxLocations.find(l => l.id === state.currentLocationId);

    if (!act || !currentLocation) {
      return { ok: false, error: 'Current act or location not found' };
    }

    // Validate target is in connections
    if (!currentLocation.connections.includes(targetLocationId)) {
      return {
        ok: false,
        error: `Cannot travel to "${targetLocationId}" — not in connections. Available: ${currentLocation.connections.join(', ')}`,
      };
    }

    // Find target location
    const targetLocation = act.sandboxLocations.find(l => l.id === targetLocationId);
    if (!targetLocation) {
      return { ok: false, error: `Location "${targetLocationId}" not found in current act` };
    }

    // Update DB — move to new location, reset beat counter
    db.update(plotStates)
      .set({
        currentLocationId: targetLocationId,
        currentBeat: 0,
        offPathTurns: 0,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(plotStates.sessionId, sessionId))
      .run();

    return {
      ok: true,
      previousLocationId: state.currentLocationId,
      newLocationId: targetLocationId,
      newLocationTitle: targetLocation.title,
      ambientDetail: targetLocation.ambientDetail ?? null,
      connections: targetLocation.connections,
    };
  },
});
