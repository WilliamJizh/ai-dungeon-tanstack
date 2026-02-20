import { tool } from 'ai';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { plotStates, vnPackages } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { VNPackage } from '../types/vnTypes.js';

/**
 * Reads the current narrative state for this session, including the scene
 * script context from the VNPackage so the storyteller can act as a faithful DM.
 * Call at the start of each turn before building any frames.
 */
export const plotStateTool = tool({
  description: 'Read current narrative position: active beat, next beat to cover, exit conditions, off-path count. Call at the start of each turn.',
  parameters: z.object({
    sessionId: z.string(),
    sceneId: z.string().optional().describe('Optional override — uses DB currentSceneId if omitted'),
  }),
  execute: async ({ sessionId }) => {
    const state = db.select().from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();

    // Look up VNPackage to return scene script context
    let scene: { beats: string[]; exitConditions: string[] } | undefined;
    if (state?.packageId) {
      const pkgRow = db.select().from(vnPackages).where(eq(vnPackages.id, state.packageId)).get();
      if (pkgRow) {
        const pkg = JSON.parse(pkgRow.metaJson) as VNPackage;
        scene = pkg.plot.acts
          .flatMap(a => a.scenes)
          .find(s => s.id === state.currentSceneId);
      }
    }

    const beat = state?.currentBeat ?? 0;
    const nudge = state && state.offPathTurns >= 3
      ? `The player has gone off-track for ${state.offPathTurns} turns. Gently steer toward the exit conditions: ${scene?.exitConditions.join(', ') ?? 'see above'}`
      : undefined;

    return {
      currentSceneId: state?.currentSceneId ?? null,
      currentBeat: beat,
      nextBeat: scene?.beats[beat] ?? null,
      beatsCompleted: scene?.beats.slice(0, beat) ?? [],
      remainingBeats: scene?.beats.slice(beat + 1) ?? [],
      exitConditions: scene?.exitConditions ?? [],
      offPathTurns: state?.offPathTurns ?? 0,
      completedScenes: state ? JSON.parse(state.completedScenes) : [],
      flags: state ? JSON.parse(state.flagsJson) : {},
      nudge,
    };
  },
});
