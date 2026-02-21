import 'dotenv/config'
import { writeFileSync } from 'fs'
import { generateAmbientMusic } from '../server/lib/musicGen.js'

console.log('Testing music generation (5s)...')
const result = await generateAmbientMusic(
  [{ text: 'dark dungeon ambient, ominous, slow, medieval', weight: 1 }],
  { durationSeconds: 5 },
)
writeFileSync('scripts/output-music.pcm', result.pcmBuffer)
console.log(
  `Done in ${result.durationMs}ms — ${result.pcmBuffer.length} bytes → scripts/output-music.pcm`,
)
console.log(`Format: ${result.sampleRate}Hz, ${result.channels}ch, 16-bit PCM`)
