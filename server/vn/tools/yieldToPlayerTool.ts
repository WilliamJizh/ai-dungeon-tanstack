import { tool } from 'ai';
import { z } from 'zod';

/**
 * Signal that the storyteller agent has finished building frames for this turn
 * and is waiting for player input. No execute fn → ToolLoopAgent stops the loop here.
 * Analogous to `finalizePackage` in the planning agent.
 */
export const yieldToPlayerTool = tool({
  description: 'Signal end of your turn. Call after building all frames for this turn, when waiting for player input. This ends the agent loop.',
  inputSchema: z.object({
    waitingFor: z.enum(['choice', 'free-text', 'continue'])
      .describe("'choice' = player must pick from choice frame options, 'free-text' = player types a custom action, 'continue' = player just advances"),
  }),
  // No execute fn — ToolLoopAgent stops here when this is called
});
