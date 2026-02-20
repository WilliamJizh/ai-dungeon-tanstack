import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'fs'
import {
  generateSceneImage,
  generateCharacterImage,
} from '../server/agents/imageAgent.js'

const STYLE =
  'Craig Mullins concept art style, loose expressive oil paint brushstrokes, thick gestural paint texture, dramatic cinematic chiaroscuro lighting, strong value contrast deep shadows and brilliant highlights, muted earthy tones with warm amber and deep teal accents, slightly realistic proportions, atmospheric depth and haze, professional digital matte painting'

const OUT = 'public/assets'
mkdirSync(OUT, { recursive: true })

console.log('Generating 3 game assets in parallel...\n')

const [detective, kim, background] = await Promise.all([
  generateCharacterImage(
    `Full body portrait of a rumpled noir detective, disheveled sandy hair, long dark coat, haunted hollow eyes, cigarette. ${STYLE}`,
    '1:1',
  ),
  generateCharacterImage(
    `Full body portrait of a precise efficient police lieutenant, neat orange jacket, calm determined expression, short dark hair, clipboard. ${STYLE}`,
    '1:1',
  ),
  generateSceneImage(
    `Wide establishing shot of a gloomy industrial harbour city at dusk, brutalist apartment blocks, foggy cobblestone streets, orange sodium lamp glow against teal twilight sky, empty rain-slicked plaza. ${STYLE}`,
    { aspectRatio: '16:9', model: 'gemini-3-pro-image-preview' },
  ),
])

writeFileSync(`${OUT}/character-detective.png`, Buffer.from(detective.base64, 'base64'))
writeFileSync(`${OUT}/character-kim.png`, Buffer.from(kim.base64, 'base64'))
writeFileSync(`${OUT}/background-city.png`, Buffer.from(background.base64, 'base64'))

console.log(`character-detective.png  ${detective.durationMs}ms`)
console.log(`character-kim.png        ${kim.durationMs}ms`)
console.log(`background-city.png      ${background.durationMs}ms`)
console.log(`\nAll assets saved to ${OUT}/`)
