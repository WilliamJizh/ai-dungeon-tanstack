// Image generation
export interface ImageGenOptions {
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4'
  model?: 'gemini-2.5-flash-image' | 'gemini-3-pro-image-preview'
}

export interface ImageGenResult {
  base64: string
  mimeType: 'image/png' | 'image/jpeg'
  durationMs: number
}

// Music generation
export interface WeightedPrompt {
  text: string
  weight: number // non-zero
}

export interface MusicGenConfig {
  bpm?: number // 60–200
  density?: number // 0.0–1.0
  brightness?: number // 0.0–1.0
  durationSeconds?: number // how long to collect audio (default: 10)
}

export interface MusicGenResult {
  pcmBuffer: Buffer // raw 16-bit PCM, 48kHz stereo
  sampleRate: 48000
  channels: 2
  durationMs: number
}

export class AgentError extends Error {
  constructor(
    public readonly agentId: string,
    message: string,
    public readonly raw?: string,
  ) {
    super(`[${agentId}] ${message}`)
    this.name = 'AgentError'
  }
}
