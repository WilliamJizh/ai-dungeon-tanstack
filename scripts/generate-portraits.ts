import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'fs'
import { generateCharacterImage } from '../server/agents/imageAgent.js'

const STYLE =
  'Craig Mullins concept art style, loose expressive oil paint brushstrokes, thick gestural paint texture, dramatic cinematic chiaroscuro lighting, strong value contrast deep shadows and brilliant highlights, muted earthy tones with warm amber and deep teal accents, slightly realistic proportions, atmospheric depth and haze, professional digital matte painting'

mkdirSync('public/assets', { recursive: true })
console.log('Generating 2 portrait assets in parallel...\n')

const [detective, kim] = await Promise.all([
  generateCharacterImage(
    `Close-up portrait bust shot of a gaunt haunted noir detective, hollow eyes with dark circles, disheveled sandy hair, cigarette at lip, three-quarter face angle, dramatic side lighting casting half the face in shadow, worn coat collar visible at bottom. ${STYLE}`,
    '1:1',
  ),
  generateCharacterImage(
    `Close-up portrait bust shot of a composed precise police lieutenant, short dark hair, calm determined expression, three-quarter face angle, warm amber rim lighting on one side, orange jacket collar visible at bottom, direct steady gaze. ${STYLE}`,
    '1:1',
  ),
])

writeFileSync('public/assets/portrait-detective.png', Buffer.from(detective.base64, 'base64'))
writeFileSync('public/assets/portrait-kim.png', Buffer.from(kim.base64, 'base64'))

console.log(`portrait-detective.png  ${detective.durationMs}ms`)
console.log(`portrait-kim.png        ${kim.durationMs}ms`)
console.log('\nDone → public/assets/')
