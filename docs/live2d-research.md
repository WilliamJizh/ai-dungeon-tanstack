# Live2D-Style Animation Research — Findings

## Goal
Explore a pipeline for animating AI-generated characters in the browser without video:
- Split a generated character image into body-part layers (hair, body, arms, face)
- Animate layers independently (breathing, hair sway, expression swaps)
- Parallax background from layered environment images
- Target: Live2D / Spine-style feel, fully browser-native, zero per-use cost

---

## Pipeline Built

### Generation (`scripts/generate-live2d-layers.ts`)
Two-pass pipeline using the Gemini API:

**Pass 1** — Generate full-body character reference
`generateCharacterImage()` → transparent PNG via ONNX background removal (`@imgly/background-removal-node`)

**Pass 2** — Sequential layer extraction (image → image)
`gemini-3-pro-image-preview` with `responseModalities: ['TEXT', 'IMAGE']`

Key pattern — **incremental "claimed" context**: each extraction call receives all previously extracted
layers as additional input images, labelled as CLAIMED, so the model avoids re-including those regions:
```
arm-right   ← [ref]
arm-left    ← [ref, arm-right (claimed)]
body        ← [ref, arm-right (claimed), arm-left (claimed)]
hair        ← [ref, arm-right, arm-left, body (all claimed)]
```

Expression variants derived from `face-neutral` (not from the full body ref):
```
face-neutral ← [ref] (zoom/crop instruction)
face-talk    ← [face-neutral] (morph: mouth open)
face-blink   ← [face-neutral] (morph: eyes closed)
face-emote   ← [face-neutral] (morph: eyes wide)
```

### Demo (`public/demo-live2d.html`)
Standalone HTML — PixiJS 8 via CDN, no build step.
- Layers composited as PixiJS Sprites in Z-ordered Container
- Idle animation: breathing (scaleY sine), body bob, hair sway (pivot at scalp), arm drift
- Mouse parallax: 3 background layers at different speeds
- Expression state machine: idle / talking / emote / hit
- Graceful degradation: missing layers skipped silently

---

## What Worked

| Layer | Result |
|-------|--------|
| `body` | ✅ Cleanly isolated torso/skirt, arms excluded when claimed context used |
| `hair` | ✅ Correctly isolated shape; slight scale drift but recognisable |
| `face-neutral` | ✅ Consistent close-up portrait |
| `face-talk/blink/emote` | ✅ Excellent — expressions are tightly consistent, only the targeted feature changes |
| Background parallax | ✅ Works well visually in demo |
| Breathing / hair sway / idle animation | ✅ Looks natural with sine-wave + spring parameters |

---

## What Didn't Work — Root Cause

### Gemini generates, it does not crop or mask

These are **generative** image models. Sending an input image + "extract only X" does not perform
pixel-level masking. The model uses the input as style/content reference and **generates a new image**.
Canvas coordinates, scale, and pixel alignment are not preserved.

Consequences:

**Arms (left/right)**
The model cannot reliably distinguish character-space left/right from canvas-space left/right.
Both `arm-left` and `arm-right` consistently ended up at the same canvas position (whichever arm was
more visually dominant in the reference). The incremental claimed-context approach helped somewhat
but did not fully solve this.

**Face close-up**
"Zoom in and crop to the face" causes the model to **generate a new portrait** in the same style,
not crop the existing pixels. The resulting face consistently matched the expression request well
(good for morphing) but did not match the body's face — different lighting, slightly different
bone structure, disconnected from the full-body render.

**Hair scale**
Hair isolated correctly in shape, but scale/position drifts — the model tends to re-centre and
zoom the element rather than preserving its tiny position in the full-body canvas.

---

## Gemini Model Notes

| Model | Use case | Notes |
|-------|----------|-------|
| `gemini-2.5-flash-image` | Text → image (fast) | Does not truly edit input images |
| `gemini-3-pro-image-preview` | Text → image or image → image | Best results; truly uses reference for style; still generative not mask-based |

For `gemini-3-pro-image-preview` image editing:
- `responseModalities: ['TEXT', 'IMAGE']` required (not `['IMAGE']` alone)
- Content order: text instruction first, then `inlineData` image parts
- Multiple images supported in one request (multi-image context)

---

## Recommended Next Steps

### Option A — Accept generative nature, fix compositor positioning
Generate each layer as its own primary output (not extracted from the body).
Use a shared style prompt for consistency. Position layers in the compositor using
known proportional offsets (head at 10% from top, arms at 35%, etc.) rather than
relying on pixel alignment from generation.

### Option B — Dedicated segmentation model
Generate the full character once, run **Meta SAM (Segment Anything Model)** to produce
semantic masks (hair, face, body, arms), apply masks to extract transparent PNGs.
Zero prompt ambiguity, pixel-perfect splits. Adds a Python/ONNX dependency.

### Option C — Face-first pipeline
Generate the **face close-up first** as the master reference.
Generate full body *from* the face reference (asking the model to match it).
This ensures face consistency with the body and gives a high-quality face layer directly
without any extraction step.

### Option D — Sprite sheet approach
Prompt Gemini to generate a **single sprite sheet** image with all body parts laid out
on a grid (head, body, arms, hair in separate cells). Crop with known pixel coordinates
in Node.js using `sharp`. More reliable than extraction since the model places parts
where instructed in a flat layout.

---

## Files

| File | Purpose |
|------|---------|
| `scripts/generate-live2d-layers.ts` | Generation pipeline (two-pass, sequential claimed context) |
| `public/demo-live2d.html` | Standalone PixiJS animation demo |
| `server/agents/imageAgent.ts` | `generateCharacterImage()`, `generateSceneImage()` — reused |
