import { tool } from 'ai';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { plotStates } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

/**
 * Tool for the Storyteller Agent to explicitly record significant player choices
 * or outcomes as state flags. These flags are then used by the Planner's 
 * conditional branches (e.g., Inevitable Events) to alter the story.
 */
export const recordPlayerActionTool = tool({
    description: 'Record a significant player action, choice, or acquired state as a flag. Look at the `potentialFlags` in the `plotStateTool` output for suggestions.',
    inputSchema: z.object({
        sessionId: z.string(),
        flagName: z.string().describe('A semantic key representing the state change (e.g., "barricaded_study_door", "found_turners_revolver", "angered_npm_townsfolk")'),
        value: z.union([z.boolean(), z.string(), z.number()]).describe('The value of the flag. Usually a boolean, but can hold string/number data if needed.')
    }),
    execute: async ({ sessionId, flagName, value }) => {
        // 1. Fetch current abstract plot state 
        const state = db.select().from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();

        if (!state) {
            return { success: false, error: 'Session not found' };
        }

        // 2. Parse existing flags
        const flags = state.flagsJson ? JSON.parse(state.flagsJson) : {};

        // 3. Update the flag
        flags[flagName] = value;

        // 4. Save back to DB
        db.update(plotStates)
            .set({ flagsJson: JSON.stringify(flags), updatedAt: new Date().toISOString() })
            .where(eq(plotStates.sessionId, sessionId))
            .run();

        return {
            success: true,
            message: `Successfully recorded flag: ${flagName} = ${value}`
        };
    },
});
