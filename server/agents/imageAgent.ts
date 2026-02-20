import { removeBackground } from '@imgly/background-removal-node'
import { GoogleGenAI } from '@google/genai'
import type { ImageGenOptions, ImageGenResult } from './types.js'
import { AgentError } from './types.js'

let _genAI: GoogleGenAI | null = null

function getGenAI(): GoogleGenAI {
  if (_genAI) return _genAI
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set')
  _genAI = new GoogleGenAI({ apiKey })
  return _genAI
}

/**
 * generateSceneImage: text-to-image via Gemini image model.
 * Returns base64 PNG + timing. Throws AgentError on failure.
 * Default model: gemini-2.5-flash-image (fast); use gemini-3-pro-image-preview for higher quality.
 */
export async function generateSceneImage(
  prompt: string,
  options: ImageGenOptions = {},
): Promise<ImageGenResult> {
  const { aspectRatio = '16:9', model = 'gemini-2.5-flash-image' } = options
  const genAI = getGenAI()
  const start = Date.now()

  const response = await genAI.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio },
    },
  })

  const imagePart = response.candidates?.[0]?.content?.parts?.find(
    (p) => p.inlineData?.mimeType?.startsWith('image/'),
  )
  if (!imagePart?.inlineData?.data) {
    throw new AgentError('image-agent', 'No image data in response')
  }

  return {
    base64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType as 'image/png' | 'image/jpeg',
    durationMs: Date.now() - start,
  }
}

/**
 * generateCharacterImage: generates a character image then uses ONNX-based
 * AI segmentation (@imgly/background-removal-node) to remove the background,
 * producing a true transparent-background PNG. No API key required — model
 * files (~100MB) are downloaded on first run from IMG.LY's CDN.
 */
export async function generateCharacterImage(
  prompt: string,
  aspectRatio: '1:1' | '4:3' | '3:4' = '1:1',
): Promise<ImageGenResult> {
  const characterPrompt = `${prompt}.
Background: plain simple light background, minimal, uncluttered.
Style: clear defined edges on subject, centered with padding.`

  const genAI = getGenAI()
  const start = Date.now()

  const response = await genAI.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: characterPrompt,
    config: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio },
    },
  })

  const imagePart = response.candidates?.[0]?.content?.parts?.find(
    (p) => p.inlineData?.mimeType?.startsWith('image/'),
  )
  if (!imagePart?.inlineData?.data) {
    throw new AgentError('image-agent', 'No image data in response')
  }

  const inputBuffer = Buffer.from(imagePart.inlineData.data, 'base64')
  const inputBlob = new Blob([inputBuffer], { type: imagePart.inlineData.mimeType })
  const outputBlob = await removeBackground(inputBlob)
  const outputBuffer = Buffer.from(await outputBlob.arrayBuffer())

  return {
    base64: outputBuffer.toString('base64'),
    mimeType: 'image/png',
    durationMs: Date.now() - start,
  }
}
