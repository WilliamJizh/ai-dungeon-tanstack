import { GoogleGenAI } from '@google/genai'
import type { WeightedPrompt, MusicGenConfig, MusicGenResult } from './mediaTypes.js'
import { MediaGenError } from './mediaTypes.js'
import { tracedNativeCall } from '../debug/traceAI.js'

/**
 * Wraps raw PCM in a WAVE container (44-byte header).
 * Input must be 16-bit signed little-endian, 48kHz stereo.
 */
export function pcmToWav(pcm: Buffer, sampleRate = 48000, channels = 2, bitDepth = 16): Buffer {
  const byteRate = sampleRate * channels * (bitDepth / 8)
  const blockAlign = channels * (bitDepth / 8)
  const dataSize = pcm.length
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataSize, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)          // PCM = 1
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitDepth, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataSize, 40)
  return Buffer.concat([header, pcm])
}

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

  return tracedNativeCall(
    async () => {
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
            connectionError = new MediaGenError('musicGen', msg)
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
        throw new MediaGenError('musicGen', 'No audio chunks received')
      }

      return {
        pcmBuffer: Buffer.concat(chunks),
        sampleRate: 48000,
        channels: 2,
        durationMs: Date.now() - start,
      }
    },
    {
      pipeline: 'music-gen',
      agentId: 'music-gen',
      modelProvider: 'google',
      modelId: 'models/lyria-realtime-exp',
      tags: ['music-gen', 'ambient'],
      source: 'musicGen.generateAmbientMusic',
    },
    { promptCount: prompts.length, durationSeconds, bpm },
  )
}
