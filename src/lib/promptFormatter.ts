import type { GameSession } from '../types/story'

const SYSTEM_PREAMBLE = `You are a safe, family-friendly text adventure game narrator.
You create engaging, imaginative stories appropriate for all ages.
Never generate violent, sexual, hateful, or otherwise harmful content.
All conflict should be resolved through wit, courage, and cooperation.`

const JSON_SCHEMA = `{
  "scene": "string — vivid 2-3 paragraph description of what happens and what the hero sees",
  "choices": ["string", "string", "string"],
  "stateSummary": "string — one sentence: current location, key items held, and notable status"
}`

export function formatOpeningPrompt(worldSetup: string): string {
  return `${SYSTEM_PREAMBLE}

The player has chosen this adventure setting:
"${worldSetup}"

Begin the adventure! Describe the opening scene and present three choices for the player.

Respond ONLY with valid JSON matching this schema (no markdown fences, no extra text):
${JSON_SCHEMA}`
}

export function formatStepPrompt(
  session: Pick<GameSession, 'worldSetup' | 'steps'>,
  playerAction: string,
): string {
  const historyText = buildHistoryText(session.steps)

  return `${SYSTEM_PREAMBLE}

Adventure setting: "${session.worldSetup}"

Story so far:
${historyText}

The player chooses: "${sanitizePlayerInput(playerAction)}"

Continue the story based on the player's action. Keep narrative coherent and safe for all ages.

Respond ONLY with valid JSON matching this schema (no markdown fences, no extra text):
${JSON_SCHEMA}`
}

function buildHistoryText(
  steps: GameSession['steps'],
): string {
  if (steps.length === 0) return '(Story just beginning)'

  return steps
    .slice(-12) // keep last 12 steps for context window economy
    .map((step) =>
      step.type === 'ai'
        ? `[NARRATOR]: ${step.content}`
        : `[PLAYER ACTION]: ${step.content}`,
    )
    .join('\n\n')
}

function sanitizePlayerInput(input: string): string {
  return input
    .trim()
    .slice(0, 500) // cap at 500 chars
    .replace(/[<>]/g, '') // strip angle brackets to prevent injection
}
