export interface ToolHistoryFlattener {
    /** Flattens the Assistant's tool *arguments* into natural narrative text */
    flattenCall?: (args: any) => string;
    /** Flattens the Server's returned *result* into text (only for state-reading tools) */
    flattenResult?: (result: any) => string;
}

export const TOOL_FLATTENERS: Record<string, ToolHistoryFlattener> = {
    frameBuilderTool: {
        flattenCall: (args) => {
            const type = args.type || 'scene';
            let narrative = '';
            if (args.conversation && Array.isArray(args.conversation)) {
                narrative = args.conversation.map((line: any) => {
                    if ('narrator' in line) return `${line.narrator}`;
                    return `${line.speaker ? line.speaker + ': ' : ''}"${line.text}"`;
                }).join(' ');
            }
            if (args.narrations && Array.isArray(args.narrations)) {
                narrative += args.narrations.map((n: any) => n.text).join(' ');
            }
            if (args.choices && Array.isArray(args.choices)) {
                narrative += ` Choices presented: ${args.choices.map((c: any) => c.text).join(' / ')}`;
            }
            if (args.diceRoll) {
                narrative += ` Dice: ${args.diceRoll.diceNotation} for ${args.diceRoll.description || 'check'}`;
            }
            if (args.skillCheck) {
                narrative += ` Skill check: ${args.skillCheck.stat} DC${args.skillCheck.difficulty} → ${args.skillCheck.succeeded ? 'passed' : 'failed'}`;
            }
            return `[Already shown ${type} frame]: ${narrative || 'Scene advanced.'}`.trim();
        }
    },

    plotStateTool: {
        flattenCall: () => `[System Checked Plot State]`,
        flattenResult: (result) => {
            // For sandbox mode (Director-powered), flatten to a concise summary
            if (result.directorBrief) {
                const parts = [
                    `Location: ${result.currentLocationTitle ?? result.currentLocationId}`,
                    `Director: ${result.directorBrief}`,
                ];
                if (result.activeComplication) parts.push(`Complication: ${result.activeComplication}`);
                if (result.currentEncounter) parts.push(`Encounter: ${result.currentEncounter.title}`);
                if (result.globalProgression) parts.push(`Progress: ${result.globalProgression.current}/${result.globalProgression.required}`);
                return `[System Memory - Direction Pack]: ${parts.join(' | ')}`;
            }
            // Legacy beat mode
            return `[System Memory - Plot State]: ${JSON.stringify(result)}`;
        }
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

    requestTravelTool: {
        flattenCall: (args) => `[System Travel]: Moving to location ${args.targetLocationId}`,
        flattenResult: (result) => `[System Arrived]: ${result.newLocationTitle ?? result.newLocationId ?? 'new location'}`
    },

    initCombatTool: {
        flattenCall: () => `[System Initialized Tactical Combat]`
    },

    combatEventTool: {
        flattenCall: (args) => `[System Injected Combat Event]: ${args.type}`
    }
};
