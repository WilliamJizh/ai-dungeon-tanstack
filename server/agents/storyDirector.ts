import type { AgentConfig, DirectorOutput, WorldState } from './types.js'
import { AgentError } from './types.js'
import { runAgent, parseAgentJSON } from './agentLoop.js'
import { formatWorldStateForPrompt } from './worldState.js'

export const DIRECTOR_CONFIG: AgentConfig = {
  id: 'story-director',
  name: 'Story Director',
  temperature: 0.9,
  maxOutputTokens: 512,
}

const SYSTEM_INSTRUCTION = `You are a narrative architect for an interactive text adventure game.
Your job: given the world setup, player action, recent history, and current world state, decide:
1. The story beat — what dramatically happens next (1-2 sentences).
2. Three player choices that emerge from the situation (short action phrases, max 8 words each).
3. World-state changes that result from the action.

Output ONLY valid JSON matching this schema:
{
  "storyBeat": "string",
  "choices": ["string", "string", "string"],
  "stateChanges": {
    "newLocation": "string (optional)",
    "addInventory": ["string"] (optional),
    "removeInventory": ["string"] (optional),
    "flagChanges": { "flagName": true/false } (optional),
    "newCharacters": { "name": "description" } (optional),
    "newEvent": "string (optional)",
    "newPlayerStatus": "string (optional) — e.g. 'injured', 'poisoned', 'healthy', 'exhausted'"
  }
}

Be creative but consistent with the established world. Keep choices as short action phrases.`

export async function runStoryDirector(input: {
  worldSetup: string
  playerAction: string
  history: Array<{ type: 'ai' | 'player'; content: string }>
  worldState: WorldState
}): Promise<{ output: DirectorOutput; durationMs: number }> {
  const { worldSetup, playerAction, history, worldState } = input

  const recentHistory = history.slice(-8)
  const historyText =
    recentHistory.length > 0
      ? recentHistory
          .map((h) => `[${h.type.toUpperCase()}]: ${h.content}`)
          .join('\n')
      : '(no history yet)'

  const worldStateText = formatWorldStateForPrompt(worldState)

  const userMessage = `World Setup:
${worldSetup}

Current World State:
${worldStateText}

Recent History:
${historyText}

Player Action: ${playerAction || '(opening scene — no action yet)'}

Respond with a JSON object containing: storyBeat, choices (array of 3 strings), and stateChanges.`

  const { text, durationMs } = await runAgent({
    systemInstruction: SYSTEM_INSTRUCTION,
    userMessage,
    config: DIRECTOR_CONFIG,
  })

  const parsed = parseAgentJSON<DirectorOutput>(text, DIRECTOR_CONFIG.id)

  if (!parsed.storyBeat || typeof parsed.storyBeat !== 'string') {
    throw new AgentError(
      DIRECTOR_CONFIG.id,
      'storyBeat must be a non-empty string',
      text,
    )
  }

  if (
    !Array.isArray(parsed.choices) ||
    parsed.choices.length !== 3 ||
    parsed.choices.some((c) => !c || typeof c !== 'string')
  ) {
    throw new AgentError(
      DIRECTOR_CONFIG.id,
      'choices must be an array of exactly 3 non-empty strings',
      text,
    )
  }

  if (
    !parsed.stateChanges ||
    typeof parsed.stateChanges !== 'object' ||
    Array.isArray(parsed.stateChanges)
  ) {
    throw new AgentError(
      DIRECTOR_CONFIG.id,
      'stateChanges must be an object',
      text,
    )
  }

  return { output: parsed, durationMs }
}
