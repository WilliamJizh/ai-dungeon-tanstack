import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'fs'
import { GoogleGenAI } from '@google/genai'
import { removeBackground } from '@imgly/background-removal-node'
import { generateCharacterImage } from '../server/lib/imageGen.js'

const STYLE =
  'Craig Mullins concept art style, loose expressive oil paint brushstrokes, thick gestural paint texture, dramatic cinematic chiaroscuro lighting, strong value contrast deep shadows and brilliant highlights, muted earthy tones with warm amber and deep teal accents, slightly realistic proportions, atmospheric depth and haze, professional digital matte painting'

const OUT = 'public/assets/live2d-demo'
mkdirSync(OUT, { recursive: true })

function getGenAI() {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')
  return new GoogleGenAI({ apiKey })
}

type Ref = { base64: string; mimeType: 'image/png' | 'image/jpeg'; label: string }

/**
 * Core image→image extraction.
 *
 * `refs` is an ordered list of images passed to the model:
 *   refs[0] = original reference
 *   refs[1..] = layers already extracted ("claimed" regions the model must avoid)
 *
 * The instruction string explicitly references each image by number (IMAGE 1, IMAGE 2, …)
 * so the model understands the accumulating extraction context.
 */
async function extractLayer(
  refs: Ref[],
  instruction: string,
  label: string,
): Promise<Ref> {
  const start = Date.now()
  const genAI = getGenAI()

  const parts: any[] = [{ text: instruction }]
  for (const ref of refs) {
    parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.base64 } })
  }

  const response = await getGenAI().models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: [{ role: 'user', parts }] as any,
    config: { responseModalities: ['TEXT', 'IMAGE'] },
  })

  const imgPart = response.candidates?.[0]?.content?.parts?.find(
    (p: any) => p.inlineData?.mimeType?.startsWith('image/'),
  )
  if (!imgPart?.inlineData?.data) throw new Error(`No image returned for: ${label}`)

  // Strip white background → transparent PNG
  const buf = Buffer.from(imgPart.inlineData.data, 'base64')
  const blob = new Blob([buf], { type: imgPart.inlineData.mimeType })
  const outBlob = await removeBackground(blob)
  const outBase64 = Buffer.from(await outBlob.arrayBuffer()).toString('base64')

  console.log(`  ✓ ${label}.png  (${Date.now() - start}ms)`)
  return { base64: outBase64, mimeType: 'image/png', label }
}

function save(label: string, r: Ref) {
  writeFileSync(`${OUT}/${label}.png`, Buffer.from(r.base64, 'base64'))
}

// ─── PASS 1: Reference character ────────────────────────────────────────────
console.log('\n=== Live2D Layer Generator ===\n')
console.log('Pass 1: Generating reference character...')

const refResult = await generateCharacterImage(
  `Full body portrait of a young female sorcerer, long flowing silver hair, ` +
    `ornate midnight-blue robes with gold trim, pale skin, violet eyes, ` +
    `elegant neutral stance, both arms relaxed at sides, centered, full body head to feet. ${STYLE}`,
  '3:4',
)
const REF: Ref = { base64: refResult.base64, mimeType: 'image/png', label: 'IMAGE 1 — original full-body character reference' }
save('character-ref', REF)
console.log(`  ✓ character-ref.png  (${refResult.durationMs}ms)\n`)

// ─── PASS 2: Sequential extraction with accumulated context ──────────────────
//
// Each step passes all previously extracted layers so the model knows which
// regions are already "claimed" and must not be included again.
//
// Order matters: extract what overlaps first (arms) before what they overlap with (body).

console.log('Pass 2: Sequential layer extraction...\n')

// ── Step 1: Right arm — nothing claimed yet ──────────────────────────────────
const armRight = await extractLayer(
  [REF],
  `IMAGE 1 is the full-body character reference.

Extract ONLY the character's RIGHT arm:
- The right sleeve (the wide flowing fabric panel on her right side)
- The right forearm visible within the sleeve
- The right hand

Rules:
- Keep it at its EXACT pixel position from IMAGE 1 — do not move or resize it
- Replace absolutely everything else with solid plain white (head, hair, body, left arm, legs)
- Plain white background only`,
  'arm-right',
)
save('arm-right', armRight)

// ── Step 2: Left arm — right arm claimed ─────────────────────────────────────
const armLeft = await extractLayer(
  [REF, { ...armRight, label: 'IMAGE 2 — right arm already extracted (CLAIMED — do not include)' }],
  `IMAGE 1 is the full-body character reference.
IMAGE 2 shows the character's RIGHT arm which has already been extracted. That region is CLAIMED.

Extract ONLY the character's LEFT arm:
- The left sleeve (the wide flowing fabric panel on her left side)
- The left forearm visible within the sleeve
- The left hand

Rules:
- Keep it at its EXACT pixel position from IMAGE 1 — do not move or resize it
- Replace absolutely everything else — including the right arm region shown in IMAGE 2 — with solid plain white
- Plain white background only`,
  'arm-left',
)
save('arm-left', armLeft)

// ── Step 3: Body — both arms claimed ─────────────────────────────────────────
const body = await extractLayer(
  [
    REF,
    { ...armRight, label: 'IMAGE 2 — right arm already extracted (CLAIMED)' },
    { ...armLeft,  label: 'IMAGE 3 — left arm already extracted (CLAIMED)' },
  ],
  `IMAGE 1 is the full-body character reference.
IMAGE 2 shows the RIGHT arm already extracted — that region is CLAIMED, do not redraw it.
IMAGE 3 shows the LEFT arm already extracted — that region is CLAIMED, do not redraw it.

Extract ONLY the central body:
- The neck/collar area
- The chest and torso of the robe
- The skirt/lower robe hanging straight down
- Nothing that extends outward to either side as a sleeve wing

Rules:
- Do NOT include the head or hair
- Do NOT include either arm sleeve — those are claimed in IMAGES 2 and 3
- Keep it at its EXACT pixel position from IMAGE 1
- Replace everything else (head, hair, both arms, background) with solid plain white`,
  'body',
)
save('body', body)

// ── Step 4: Hair — arms + body claimed ───────────────────────────────────────
const hair = await extractLayer(
  [
    REF,
    { ...armRight, label: 'IMAGE 2 — right arm (CLAIMED)' },
    { ...armLeft,  label: 'IMAGE 3 — left arm (CLAIMED)' },
    { ...body,     label: 'IMAGE 4 — body (CLAIMED)' },
  ],
  `IMAGE 1 is the full-body character reference.
IMAGES 2, 3, 4 show parts already extracted — those regions are CLAIMED.

Extract ONLY the character's hair:
- Every strand of the silver/white flowing hair
- Hair that falls over the shoulders

Rules:
- Do NOT include the face, the body, the arms, or the background
- Keep it at its EXACT pixel position from IMAGE 1
- Replace everything else with solid plain white`,
  'hair',
)
save('hair', hair)

// ── Step 5: Head silhouette — hair + body claimed ────────────────────────────
const headBase = await extractLayer(
  [
    REF,
    { ...hair, label: 'IMAGE 2 — hair (CLAIMED)' },
    { ...body, label: 'IMAGE 3 — body (CLAIMED)' },
  ],
  `IMAGE 1 is the full-body character reference.
IMAGE 2 shows the hair already extracted — CLAIMED.
IMAGE 3 shows the body already extracted — CLAIMED.

Extract ONLY the head shape:
- The bare head/skull silhouette and neck
- No hair (claimed in IMAGE 2), no facial features, no expression — just the skin-coloured head shape and neck

Rules:
- Keep it at its EXACT pixel position from IMAGE 1
- Replace everything else with solid plain white`,
  'head-base',
)
save('head-base', headBase)

console.log('\n  — Body parts complete. Generating face expressions...\n')

// ── Step 6: Face neutral — zoom crop from ref ────────────────────────────────
const faceNeutral = await extractLayer(
  [REF],
  `IMAGE 1 is the full-body character reference.

Zoom in and crop to show ONLY the character's face as a tight close-up portrait.
The face should fill the entire frame.
Expression: eyes open and relaxed, mouth gently closed — neutral and calm.
Keep the exact art style, lighting direction, skin tone, and hair framing.
Plain white background. No shoulders or body visible.`,
  'face-neutral',
)
save('face-neutral', faceNeutral)
console.log('\n  — face-neutral saved — deriving expressions from it...\n')

// ── Steps 7-9: Expression variants, all from face-neutral ───────────────────
const FACE_REF: Ref = { ...faceNeutral, label: 'IMAGE 1 — face-neutral reference portrait' }

const [faceTalk, faceBlink, faceEmote] = await Promise.all([
  extractLayer(
    [FACE_REF],
    `IMAGE 1 is a face portrait (neutral expression).
Edit ONLY the mouth: open it naturally as if mid-speech — lips slightly parted, relaxed talking position.
Keep EVERYTHING else identical: hair, eyes, skin tone, lighting, art style, face shape, background.`,
    'face-talk',
  ),
  extractLayer(
    [FACE_REF],
    `IMAGE 1 is a face portrait (neutral expression).
Edit ONLY the eyes: close them gently in a natural, relaxed blink.
Keep EVERYTHING else identical: hair, mouth, skin tone, lighting, art style, face shape, background.`,
    'face-blink',
  ),
  extractLayer(
    [FACE_REF],
    `IMAGE 1 is a face portrait (neutral expression).
Edit ONLY the expression: raise the eyebrows high and widen the eyes — a surprised or awestruck look.
Keep EVERYTHING else identical: hair, skin tone, lighting, art style, face shape, background.`,
    'face-emote',
  ),
])

save('face-talk',  faceTalk)
save('face-blink', faceBlink)
save('face-emote', faceEmote)

console.log(`\n✓ All 10 layers saved to ${OUT}/`)
console.log('Next: npm run dev  →  http://localhost:3000/demo-live2d.html\n')
