import type { AIStoryResponse } from '../types/story'

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly raw: string,
  ) {
    super(message)
    this.name = 'ParseError'
  }
}

export function parseAIResponse(raw: string): AIStoryResponse {
  // Strip markdown code fences if the model wraps response
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new ParseError(`Failed to parse JSON from AI response`, raw)
  }

  return validateResponse(parsed, raw)
}

function validateResponse(data: unknown, raw: string): AIStoryResponse {
  if (typeof data !== 'object' || data === null) {
    throw new ParseError('Response is not an object', raw)
  }

  const obj = data as Record<string, unknown>

  if (typeof obj.scene !== 'string' || obj.scene.trim().length === 0) {
    throw new ParseError('Missing or empty "scene" field', raw)
  }

  if (!Array.isArray(obj.choices) || obj.choices.length !== 3) {
    throw new ParseError('"choices" must be an array of exactly 3 items', raw)
  }

  const choices = obj.choices as unknown[]
  if (!choices.every((c) => typeof c === 'string' && c.trim().length > 0)) {
    throw new ParseError('All choices must be non-empty strings', raw)
  }

  if (typeof obj.stateSummary !== 'string' || obj.stateSummary.trim().length === 0) {
    throw new ParseError('Missing or empty "stateSummary" field', raw)
  }

  return {
    scene: obj.scene.trim(),
    choices: [
      (obj.choices as string[])[0].trim(),
      (obj.choices as string[])[1].trim(),
      (obj.choices as string[])[2].trim(),
    ],
    stateSummary: obj.stateSummary.trim(),
  }
}
