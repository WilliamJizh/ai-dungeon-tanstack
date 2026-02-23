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
  inputSchema: z.object({
    sessionId: z.string(),
    nodeId: z.string().optional().describe('Optional override — uses DB currentNodeId if omitted'),
  }),
  execute: async ({ sessionId }: { sessionId: string }) => {
    const state = db.select().from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();

    // Look up VNPackage to return node script context
    let act: { id: string; title: string; objective: string; nodes: any[] } | undefined;
    let node: { beats: any[]; exitConditions: { condition: string }[]; interactables?: string[]; findings?: string[]; callbacks?: string[]; id: string } | undefined;
    if (state?.packageId) {
      const pkgRow = db.select().from(vnPackages).where(eq(vnPackages.id, state.packageId)).get();
      if (pkgRow) {
        const pkg = JSON.parse(pkgRow.metaJson) as VNPackage;
        act = pkg.plot.acts.find(a => a.id === state.currentActId);
        node = act?.nodes.find(n => n.id === state.currentNodeId);
      }
    }

    const beat = state?.currentBeat ?? 0;
    const nudge = state && state.offPathTurns >= 3
      ? `The player has gone off-track for ${state.offPathTurns} turns. Gently steer toward the exit conditions: ${node?.exitConditions.map(e => e.condition).join(', ') ?? 'see above'}`
      : undefined;

    return {
      currentActId: state?.currentActId ?? null,
      actObjective: act?.objective ?? null,
      currentNodeId: state?.currentNodeId ?? null,
      currentBeat: beat,
      nextBeat: node?.beats[beat] ?? null,
      beatsCompleted: node?.beats.slice(0, beat) ?? [],
      remainingBeats: node?.beats.slice(beat + 1) ?? [],
      interactables: node?.interactables ?? [],
      findings: node?.findings ?? [],
      callbacks: node?.callbacks ?? [],
      exitConditions: node?.exitConditions ?? [],
      offPathTurns: state?.offPathTurns ?? 0,
      completedNodes: state ? JSON.parse(state.completedNodes) : [],
      flags: state ? JSON.parse(state.flagsJson) : {},
      nudge,
    };
  },
});
