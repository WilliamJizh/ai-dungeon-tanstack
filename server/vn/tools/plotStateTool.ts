import { tool } from 'ai';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { plotStates, vnPackages } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { VNPackage, Act, Location, WorldInfo } from '../types/vnTypes.js';

/**
 * Intelligent context router for the Storyteller Agent.
 * Reads the current narrative state, checks for triggered World Info via regex,
 * and compiles the necessary flags and pacing info for the LLM.
 */
export const plotStateTool = tool({
  description: 'Read current narrative position, actively triggered world info, and active state flags. Call at the start of each turn.',
  inputSchema: z.object({
    sessionId: z.string(),
    playerQuery: z.string().describe('The raw text the player most recently inputted'),
  }),
  execute: async ({ sessionId, playerQuery }) => {
    const state = db.select().from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();

    let act: Act | undefined;
    let location: Location | undefined;
    let triggeredWorldInfo: WorldInfo[] = [];
    let pkg: VNPackage | undefined;

    if (state?.packageId) {
      const pkgRow = db.select().from(vnPackages).where(eq(vnPackages.id, state.packageId)).get();
      if (pkgRow) {
        pkg = JSON.parse(pkgRow.metaJson) as VNPackage;
        act = pkg.plot.acts.find(a => a.id === state.currentActId);
        location = act?.sandboxLocations.find(l => l.id === state.currentLocationId);
      }
    }

    const beatIndex = state?.currentBeat ?? 0;
    const currentBeat = location?.beats[beatIndex];

    // --- Regex Matching for World Info ---
    // Combine what the player just said with the current beat's description to see if lore should trigger
    const matchingText = `${playerQuery} ${currentBeat?.description ?? ''}`.toLowerCase();

    const checkWorldInfo = (infoArray?: WorldInfo[]) => {
      if (!infoArray) return;
      for (const info of infoArray) {
        // If any key matches as a substring (or simple regex) within the combined text
        const isTriggered = info.keys.some(key => {
          try {
            const regex = new RegExp(`\\b${key}\\b`, 'i');
            return regex.test(matchingText);
          } catch (e) {
            // Fallback to simple includes if regex fails to compile
            return matchingText.includes(key.toLowerCase());
          }
        });
        if (isTriggered) {
          triggeredWorldInfo.push(info);
        }
      }
    };

    checkWorldInfo(pkg?.plot.globalWorldInfo);
    checkWorldInfo(act?.scenarioWorldInfo);

    const flags = state ? JSON.parse(state.flagsJson) : {};

    return {
      currentActId: state?.currentActId ?? null,
      actObjective: act?.objective ?? null,
      currentLocationId: state?.currentLocationId ?? null,
      currentLocationTitle: location?.title ?? null,
      ambientDetail: location?.ambientDetail ?? null,

      currentBeatDescription: currentBeat?.description ?? null,
      pacingFocus: currentBeat?.pacing.focus ?? 'standard',
      potentialFlags: currentBeat?.potentialFlags ?? [],

      // Dynamic Context Injections
      triggeredWorldInfo: triggeredWorldInfo.map(wi => ({ type: wi.type, content: wi.content })),
      activeFlags: flags,

      // Routing boundaries
      availableConnections: location?.connections ?? [],
      pendingInevitableEvents: act?.inevitableEvents?.map(e => ({
        id: e.id,
        title: e.title,
        triggerCondition: e.triggerCondition
      })) ?? [],
    };
  },
});
