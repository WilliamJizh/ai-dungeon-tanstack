import { tool } from 'ai';
import { z } from 'zod';

/**
 * Signal that the storyteller agent has finished building frames for this turn
 * and is waiting for player input. The loop stops via stopWhen: hasToolCall('yieldToPlayer').
 * execute returns {} so a tool result is stored in message history for subsequent turns.
 */
export const yieldToPlayerTool = tool({
  description: 'Signal end of your turn. Call after building all frames for this turn, when waiting for player input. This ends the agent loop.',
  inputSchema: z.object({
    waitingFor: z.enum(['choice', 'free-text', 'continue', 'combat-result'])
      .describe("'choice' = player must pick from choice frame options, 'free-text' = player types a custom action, 'continue' = player just advances, 'combat-result' = client runs tactical combat and reports outcome"),
  }),
  execute: async () => ({}), // empty result stored in history — prevents MissingToolResultsError on next turn
});
