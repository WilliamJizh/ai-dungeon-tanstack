import { GoogleGenAI } from '@google/genai'
import type { WeightedPrompt, MusicGenConfig, MusicGenResult } from './types.js'
import { AgentError } from './types.js'

let _genAI: GoogleGenAI | null = null

function getGenAI(): GoogleGenAI {
  if (_genAI) return _genAI
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set')
  _genAI = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } })
  return _genAI
}

/**
 * generateAmbientMusic: connects to Lyria realtime via WebSocket, collects
 * PCM audio chunks for durationSeconds, then stops and returns the buffer.
 * Output: raw 16-bit PCM, 48kHz, stereo.
 */
export async function generateAmbientMusic(
  prompts: WeightedPrompt[],
  config: MusicGenConfig = {},
): Promise<MusicGenResult> {
  const { bpm, density, brightness, durationSeconds = 10 } = config
  const genAI = getGenAI()
  const start = Date.now()
  const chunks: Buffer[] = []
  let connectionError: Error | null = null

  const session = await genAI.live.music.connect({
    model: 'models/lyria-realtime-exp',
    callbacks: {
      onmessage(message: any) {
        const audioChunks = message.serverContent?.audioChunks
        if (audioChunks) {
          for (const chunk of audioChunks) {
            if (chunk.data) chunks.push(Buffer.from(chunk.data, 'base64'))
          }
        }
      },
      onerror(e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        connectionError = new AgentError('music-agent', msg)
      },
    },
  })

  if (connectionError) throw connectionError

  await session.setWeightedPrompts({ weightedPrompts: prompts })

  if (bpm !== undefined || density !== undefined || brightness !== undefined) {
    await session.setMusicGenerationConfig({
      musicGenerationConfig: { bpm, density, brightness },
    })
  }

  await session.play()
  await new Promise((resolve) => setTimeout(resolve, durationSeconds * 1000))
  await session.stop()

  if (chunks.length === 0) {
    throw new AgentError('music-agent', 'No audio chunks received')
  }

  return {
    pcmBuffer: Buffer.concat(chunks),
    sampleRate: 48000,
    channels: 2,
    durationMs: Date.now() - start,
  }
}
