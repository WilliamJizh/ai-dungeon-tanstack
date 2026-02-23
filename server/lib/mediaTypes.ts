// Image generation
export interface ImageGenOptions {
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '2:3' | '3:2' | '4:5' | '5:4' | '21:9'
  model?: 'gemini-2.5-flash-image' | 'gemini-3-pro-image-preview'
  /** Output resolution — only supported by gemini-3-pro-image-preview. Default: '1K' */
  imageSize?: '1K' | '2K' | '4K'
  /** Raw base64 reference image (no data: prefix) to use as visual reference */
  referenceImageB64?: string
  /** IANA media type of the reference image, e.g. 'image/png' */
  referenceImageMimeType?: string
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

export class MediaGenError extends Error {
  constructor(
    public readonly source: string,
    message: string,
    public readonly raw?: string,
  ) {
    super(`[${source}] ${message}`)
    this.name = 'MediaGenError'
  }
}
