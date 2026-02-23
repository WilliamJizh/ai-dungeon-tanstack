// scripts/test-reference-image.ts
// Tests Gemini image generation with a reference image passed as inline data.
// Run: npx tsx scripts/test-reference-image.ts

import { GoogleGenAI } from '@google/genai'
import fs from 'fs/promises'
import { config } from 'dotenv'

config()

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })

async function main() {
  // ── Step 1: Generate a base image ─────────────────────────────────────────
  console.log('Step 1: generating base image (cartoon cat)...')
  const base = await genAI.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: 'A simple cartoon cat sitting, white background, clean art style',
    config: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: '1:1' },
    },
  })

  const basePart = base.candidates?.[0]?.content?.parts?.find(p => p.inlineData)
  if (!basePart?.inlineData?.data) throw new Error('No base image in response')

  const refB64 = basePart.inlineData.data
  const refMime = basePart.inlineData.mimeType ?? 'image/png'

  await fs.writeFile('scripts/test-ref-base.png', Buffer.from(refB64, 'base64'))
  console.log('  saved → scripts/test-ref-base.png')

  // ── Step 2: Use that image as reference for a new generation ───────────────
  console.log('Step 2: generating new scene using base image as reference...')
  const ref = await genAI.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: [
      { inlineData: { mimeType: refMime, data: refB64 } },
      { text: 'Same character but in a neon-lit cyberpunk city at night, same art style' },
    ] as any,
    config: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: '16:9' },
    },
  })

  const refOut = ref.candidates?.[0]?.content?.parts?.find(p => p.inlineData)
  if (!refOut?.inlineData?.data) throw new Error('No reference output image in response')

  await fs.writeFile('scripts/test-ref-output.png', Buffer.from(refOut.inlineData.data, 'base64'))
  console.log('  saved → scripts/test-ref-output.png')

  // ── Step 3: Test with a data URL (simulating what AI SDK sends) ────────────
  console.log('Step 3: testing data URL → base64 extraction...')
  const dataUrl = `data:${refMime};base64,${refB64}`
  const [prefix, extracted] = dataUrl.split(',')
  const extractedMime = prefix.split(':')[1].split(';')[0]
  console.log(`  extracted mimeType: ${extractedMime}, base64 length: ${extracted.length}`)
  console.log(`  matches original: ${extracted === refB64 && extractedMime === refMime}`)

  console.log('\nDone! Open scripts/test-ref-base.png and scripts/test-ref-output.png to compare.')
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
