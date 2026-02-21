import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'fs'
import {
  generateSceneImage,
  generateCharacterImage,
} from '../server/lib/imageGen.js'

const STYLE =
  'Craig Mullins concept art style, loose expressive oil paint brushstrokes, thick gestural paint texture, dramatic cinematic chiaroscuro lighting, strong value contrast deep shadows and brilliant highlights, muted earthy tones with warm amber and deep teal accents, slightly realistic proportions, atmospheric depth and haze, professional digital matte painting'

const OUT = 'public/assets'
mkdirSync(OUT, { recursive: true })

console.log('Generating fight scene asset set in parallel...\n')

const [cityBg, fightBg, playerBack, enemy1, enemy2] = await Promise.all([
  // Redo city background in Craig Mullins style
  generateSceneImage(
    `Wide establishing shot of a gloomy industrial harbour city at dusk, brutalist concrete apartment blocks, foggy cobblestone streets, orange sodium lamp glow against deep teal twilight sky, rain-slicked empty plaza, cargo cranes and ships silhouetted against the horizon. ${STYLE}`,
    { aspectRatio: '16:9', model: 'gemini-3-pro-image-preview' },
  ),

  // Fight scene interior background
  generateSceneImage(
    `Interior of a dimly lit luxury noir office, warm golden atmospheric light from side wall sconces, dark polished wood paneling, vertical architectural elements receding into depth, reflective dark floor, wide empty foreground space for characters to be composited in, dramatic warm back-lighting creating silhouette depth layers, moody atmospheric haze. ${STYLE}`,
    { aspectRatio: '16:9', model: 'gemini-3-pro-image-preview' },
  ),

  // Player character — back/diagonal view for battle scene
  generateCharacterImage(
    `Full body shot of a noir detective viewed from behind and slightly to one side, three-quarter back view looking diagonally forward into a dimly lit scene, long dark trenchcoat, disheveled hair, right shoulder prominent in frame, dramatic rim lighting outlining the silhouette against warm background light, large heroic figure filling lower frame. ${STYLE}`,
    '3:4',
  ),

  // Enemy type 1 — heavy enforcer
  generateCharacterImage(
    `Full body front-facing figure of a threatening mob enforcer, standing combat-ready pose facing the viewer directly, heavy build, dark suit, scarred angular face, menacing expression, hands loose at sides, atmospheric rim lighting. ${STYLE}`,
    '3:4',
  ),

  // Enemy type 2 — sleek fixer
  generateCharacterImage(
    `Full body front-facing figure of a sleek dangerous fixer in a long coat, lean athletic build, cold calculating expression, facing viewer, one hand in coat pocket, subtle threat in posture, visually distinct silhouette from the enforcer. ${STYLE}`,
    '3:4',
  ),
])

writeFileSync(`${OUT}/background-city.png`,      Buffer.from(cityBg.base64,     'base64'))
writeFileSync(`${OUT}/background-fight.png`,     Buffer.from(fightBg.base64,    'base64'))
writeFileSync(`${OUT}/character-player-back.png`,Buffer.from(playerBack.base64, 'base64'))
writeFileSync(`${OUT}/enemy-1.png`,              Buffer.from(enemy1.base64,     'base64'))
writeFileSync(`${OUT}/enemy-2.png`,              Buffer.from(enemy2.base64,     'base64'))

console.log(`background-city.png       ${cityBg.durationMs}ms`)
console.log(`background-fight.png      ${fightBg.durationMs}ms`)
console.log(`character-player-back.png ${playerBack.durationMs}ms`)
console.log(`enemy-1.png               ${enemy1.durationMs}ms`)
console.log(`enemy-2.png               ${enemy2.durationMs}ms`)
console.log(`\nAll assets saved to ${OUT}/`)
