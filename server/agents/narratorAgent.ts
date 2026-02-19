import type { AgentConfig, NarratorOutput, WorldState } from './types.js'
import { AgentError } from './types.js'
import { runAgent, parseAgentJSON } from './agentLoop.js'
import { formatWorldStateForPrompt } from './worldState.js'

export const NARRATOR_CONFIG: AgentConfig = {
  id: 'narrator',
  name: 'Narrator',
  temperature: 0.92,
  maxOutputTokens: 800,
}

const SYSTEM_INSTRUCTION = `You are the narrator for an immersive text adventure game.
Given a story beat and world context, write 2-3 vivid paragraphs of narrative prose.
Use second-person perspective ("You..."). Keep language family-friendly.

Also produce a one-sentence stateSummary in this format:
"Location: X. Status: Y. [key item if any]."

Output ONLY valid JSON:
{
  "scene": "your narrative prose here",
  "stateSummary": "Location: X. Status: Y."
}`

export async function runNarrator(input: {
  worldSetup: string
  storyBeat: string
  worldState: WorldState
}): Promise<{ output: NarratorOutput; durationMs: number }> {
  const { worldSetup, storyBeat, worldState } = input

  const worldStateText = formatWorldStateForPrompt(worldState)

  const userMessage = `World Setup:
${worldSetup}

Current World State:
${worldStateText}

Story Beat: ${storyBeat}

Write an immersive narrative scene (2-3 paragraphs, second-person) and a one-sentence stateSummary. Respond with JSON containing "scene" and "stateSummary".`

  const { text, durationMs } = await runAgent({
    systemInstruction: SYSTEM_INSTRUCTION,
    userMessage,
    config: NARRATOR_CONFIG,
  })

  const parsed = parseAgentJSON<NarratorOutput>(text, NARRATOR_CONFIG.id)

  if (!parsed.scene || typeof parsed.scene !== 'string') {
    throw new AgentError(
      NARRATOR_CONFIG.id,
      'scene must be a non-empty string',
      text,
    )
  }

  if (!parsed.stateSummary || typeof parsed.stateSummary !== 'string') {
    throw new AgentError(
      NARRATOR_CONFIG.id,
      'stateSummary must be a non-empty string',
      text,
    )
  }

  return { output: parsed, durationMs }
}
