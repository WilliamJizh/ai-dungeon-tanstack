import 'dotenv/config'
import { writeFileSync } from 'fs'
import { generateSceneImage } from '../server/lib/imageGen.js'

console.log('Testing image generation...')
const result = await generateSceneImage(
  'A dark fantasy dungeon entrance with torches on stone walls',
  { aspectRatio: '16:9' },
)
const buf = Buffer.from(result.base64, 'base64')
writeFileSync('scripts/output-image.png', buf)
console.log(
  `Done in ${result.durationMs}ms — ${buf.length} bytes → scripts/output-image.png`,
)
