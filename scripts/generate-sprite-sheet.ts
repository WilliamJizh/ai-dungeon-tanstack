import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'fs'
import { generateSceneImage } from '../server/lib/imageGen.js'

const OUT = 'public/assets/sprite-demo'
mkdirSync(OUT, { recursive: true })

const STYLE =
  'Craig Mullins concept art style, loose expressive oil paint brushstrokes, ' +
  'thick gestural paint texture, dramatic cinematic lighting, strong value contrast, ' +
  'muted earthy tones with warm amber and deep teal accents, slightly realistic proportions'

// 4×4 sprite sheet — 16 frames of a single smooth idle breathing loop
const PROMPT =
  `A 4x4 sprite sheet for a 2D game character idle animation. ` +
  `16 equal square cells in a 4 columns × 4 rows grid. ` +
  `BOTH horizontal AND vertical bright green (#00FF00) 2px separator lines between every cell — full grid visible. ` +
  `Solid pure black (#000000) background behind character in every cell. ` +
  `\n\nCharacter: bust-up portrait (head, neck, shoulders — cropped at mid-chest). ` +
  `3/4 angle facing slightly left. ` +
  `Female sorcerer, silver-white hair, midnight-blue robe with gold trim, pale skin. ${STYLE}` +
  `\n\nFrames are a TIME SEQUENCE — read left-to-right, top-to-bottom as consecutive animation frames. ` +
  `The 16 frames show ONE complete idle breathing cycle: ` +
  `shoulders very slightly rise on inhale and fall on exhale, ` +
  `hair drifts a few pixels left then right with the breath, ` +
  `one slow blink somewhere in the middle. ` +
  `Motion is extremely subtle — only a few pixels of change between adjacent frames. ` +
  `Frame 16 must match frame 1 exactly for seamless looping. ` +
  `\n\nCRITICAL: identical zoom, crop, and head position in every cell. Do not zoom in or shift the character between frames.`

console.log('\n=== Sprite Sheet Generator ===\n')
console.log('Generating 4×4 character sprite sheet (4K)...')

const result = await generateSceneImage(PROMPT, {
  aspectRatio: '1:1',
  model: 'gemini-3-pro-image-preview',
  imageSize: '4K',
})

const buf = Buffer.from(result.base64, 'base64')
writeFileSync(`${OUT}/sprite-sheet.png`, buf)

console.log(`✓ sprite-sheet.png  (${result.durationMs}ms)  size: ${(buf.length / 1024).toFixed(0)}KB`)
console.log(`\nSaved to ${OUT}/sprite-sheet.png`)
console.log('Next: npm run dev  →  http://localhost:3000/demo-sprite.html\n')
