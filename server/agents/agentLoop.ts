import { GoogleGenerativeAI } from '@google/generative-ai'
import type { AgentConfig } from './types.js'
import { AgentError } from './types.js'

let _genAI: GoogleGenerativeAI | null = null

function getGenAI(): GoogleGenerativeAI {
  if (_genAI) return _genAI
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set')
  _genAI = new GoogleGenerativeAI(apiKey)
  return _genAI
}

export interface AgentCallOptions {
  systemInstruction: string
  userMessage: string
  config?: AgentConfig
}

export interface AgentCallResult {
  text: string
  durationMs: number
}

/**
 * runAgent: sends a prompt+system to Gemini, returns raw text + timing.
 * Inspired by Mastra's workflowLoopStream — single structured-output LLM call.
 * Model: gemini-1.5-flash, responseMimeType: application/json
 */
export async function runAgent(
  options: AgentCallOptions,
): Promise<AgentCallResult> {
  const { systemInstruction, userMessage, config } = options
  const genAI = getGenAI()

  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    systemInstruction,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: config?.temperature ?? 0.85,
      maxOutputTokens: config?.maxOutputTokens ?? 1024,
    },
  })

  const start = Date.now()
  const result = await model.generateContent(userMessage)
  const durationMs = Date.now() - start

  const text = result.response.text()
  return { text, durationMs }
}

/**
 * parseAgentJSON<T>: strips markdown fences, parses JSON, throws AgentError on failure.
 */
export function parseAgentJSON<T>(raw: string, agentId: string): T {
  let cleaned = raw.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/```\s*$/, '')
  }
  try {
    return JSON.parse(cleaned) as T
  } catch {
    throw new AgentError(agentId, 'Failed to parse JSON response', raw)
  }
}
