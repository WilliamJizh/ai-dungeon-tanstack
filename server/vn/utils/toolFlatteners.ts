export interface ToolHistoryFlattener {
    /** Flattens the Assistant's tool *arguments* into natural narrative text */
    flattenCall?: (args: any) => string;
    /** Flattens the Server's returned *result* into text (only for state-reading tools) */
    flattenResult?: (result: any) => string;
}

export const TOOL_FLATTENERS: Record<string, ToolHistoryFlattener> = {
    frameBuilderTool: {
        flattenCall: (args) => {
            let narrative = '';
            if (args.conversation && Array.isArray(args.conversation)) {
                narrative = args.conversation.map((line: any) => {
                    if (line.isNarrator) return `${line.text}`;
                    return `${line.speaker ? line.speaker + ': ' : ''}"${line.text}"`;
                }).join(' ');
            }
            if (args.narrations && Array.isArray(args.narrations)) {
                narrative += args.narrations.map((n: any) => n.text).join(' ');
            }
            return `[Narrative Scene Generated]: ${narrative || 'Scene advanced.'}`.trim();
        }
    },

    plotStateTool: {
        flattenCall: () => `[System Checked Plot State]`,
        flattenResult: (result) => `[System Memory - Plot State]: ${JSON.stringify(result)}`
    },

    playerStatsTool: {
        flattenCall: (args) => `[System Modified Player Stats]: Action - ${args.action}`,
        flattenResult: (result) => `[System Memory - Player Stats]: ${JSON.stringify(result)}`
    },

    recordPlayerActionTool: {
        flattenCall: (args) => `[System Recorded Player Action FLAG]: ${args.flagName} = ${args.value}`
    },

    yieldToPlayer: {
        flattenCall: (args) => `[System Yielded Turn To Player]: Waiting for ${args.waitingFor}`
    },

    nodeCompleteTool: {
        flattenCall: (args) => `[System Completed Node]: Transitioning to ${args.nextNodeId}`
    },

    initCombatTool: {
        flattenCall: () => `[System Initialized Tactical Combat]`
    },

    combatEventTool: {
        flattenCall: (args) => `[System Injected Combat Event]: ${args.type}`
    }
};
