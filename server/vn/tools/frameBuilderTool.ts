import { tool } from 'ai';
import { z } from 'zod';
import { VNFrameSchema, type VNFrame } from '../types/vnFrame.js';

// Schema for tool input: VNFrame without internal _meta field
const FrameInputSchema = VNFrameSchema.omit({ _meta: true });
const LegacyPanelSchema = z.object({
  position: z.enum(['left', 'right', 'center']).optional(),
  assetKey: z.string().optional(),
  dim: z.boolean().optional(),
  weight: z.number().optional(),
  id: z.enum(['left', 'right', 'center']).optional(),
  backgroundAsset: z.string().optional(),
  characterAsset: z.string().optional(),
  dimmed: z.boolean().optional(),
  panelWeight: z.number().optional(),
}).passthrough();

const LegacyFrameSchema = z.object({
  id: z.string(),
  type: z.enum(['full-screen', 'dialogue', 'three-panel', 'choice', 'battle', 'transition', 'skill-check', 'inventory', 'map', 'character-sheet', 'tactical-map']),
  panels: z.array(LegacyPanelSchema).optional(),
  dialogue: z.object({
    speaker: z.string().optional(),
    text: z.string().optional(),
    targetPanel: z.enum(['left', 'right', 'center']).optional(),
    isNarrator: z.boolean().optional(),
    position: z.enum(['bubble', 'bottom']).optional(),
  }).optional(),
  narration: z.object({
    text: z.string(),
    panelId: z.string().optional(),
  }).optional(),
  background: z.string().optional(),
  music: z.string().optional(),
  effects: z.union([
    z.array(z.object({
      type: z.enum(['shake', 'flash', 'fade-in', 'fade-out', 'scan-lines', 'vignette-pulse']),
      target: z.enum(['screen', 'left', 'right', 'center']).optional(),
      durationMs: z.number(),
      intensity: z.number().optional(),
      color: z.string().optional(),
    })),
    z.record(z.string(), z.boolean()),
  ]).optional(),
  choices: z.array(z.object({
    id: z.string(),
    text: z.string(),
    hint: z.string().optional(),
  })).optional(),
  showFreeTextInput: z.boolean().optional(),
  hud: z.object({
    chapter: z.string(),
    scene: z.string(),
    showNav: z.boolean(),
  }).optional(),
  audio: z.object({
    musicAsset: z.string().optional(),
    fadeIn: z.boolean().optional(),
    stopMusic: z.boolean().optional(),
  }).optional(),
  battle: z.any().optional(),
  transition: z.any().optional(),
  skillCheck: z.any().optional(),
  inventoryData: z.any().optional(),
  mapData: z.any().optional(),
  characterSheet: z.any().optional(),
  tacticalMapData: z.any().optional(),
}).passthrough();

const FrameToolInputSchema = z.union([
  FrameInputSchema,
  z.object({ frame: FrameInputSchema }),
  LegacyFrameSchema,
  z.object({ frame: LegacyFrameSchema }),
]);

function normalizeEffects(
  effects: z.infer<typeof LegacyFrameSchema>['effects'],
): z.infer<typeof FrameInputSchema>['effects'] {
  if (!effects) return undefined;
  if (Array.isArray(effects)) {
    return effects as z.infer<typeof FrameInputSchema>['effects'];
  }
  const mapped: z.infer<typeof FrameInputSchema>['effects'] = [];
  if (effects.shake) mapped.push({ type: 'shake', target: 'screen', durationMs: 700, intensity: 0.5 });
  if (effects.flash) mapped.push({ type: 'flash', target: 'screen', durationMs: 300, intensity: 0.7 });
  if (effects.fadeIn) mapped.push({ type: 'fade-in', target: 'screen', durationMs: 450, intensity: 0.4 });
  if (effects.fadeOut) mapped.push({ type: 'fade-out', target: 'screen', durationMs: 450, intensity: 0.4 });
  if (effects.scanLines) mapped.push({ type: 'scan-lines', target: 'screen', durationMs: 1000, intensity: 0.3 });
  if (effects.vignettePulse) mapped.push({ type: 'vignette-pulse', target: 'screen', durationMs: 700, intensity: 0.4 });
  return mapped.length > 0 ? mapped : undefined;
}

function inferDialogueTarget(
  panels: z.infer<typeof FrameInputSchema>['panels'],
): 'left' | 'right' | 'center' {
  const withWeight = [...panels].sort((a, b) => (b.panelWeight ?? 0) - (a.panelWeight ?? 0));
  return (withWeight[0]?.id ?? panels[0]?.id ?? 'center') as 'left' | 'right' | 'center';
}

function normalizeLegacyFrame(frame: z.infer<typeof LegacyFrameSchema>): z.infer<typeof FrameInputSchema> {
  const normalizedPanels: z.infer<typeof FrameInputSchema>['panels'] = (frame.panels ?? []).map((panel, index) => {
    const inferredId = panel.id
      ?? panel.position
      ?? (index === 0 ? 'left' : index === 1 ? 'right' : 'center');
    const inheritedBackground = panel.backgroundAsset ?? frame.background;
    const rawCharacter = panel.characterAsset ?? panel.assetKey;
    const characterAsset = rawCharacter
      && rawCharacter !== inheritedBackground
      && !rawCharacter.startsWith('bg_')
      ? rawCharacter
      : undefined;
    return {
      id: inferredId,
      backgroundAsset: inheritedBackground ?? (rawCharacter?.startsWith('bg_') ? rawCharacter : undefined),
      characterAsset,
      dimmed: panel.dimmed ?? panel.dim,
      panelWeight: panel.panelWeight ?? panel.weight,
    };
  });

  const panels = normalizedPanels.length > 0
    ? normalizedPanels
    : [{ id: 'center', backgroundAsset: frame.background }];

  const dialogue = frame.dialogue?.text
    ? {
        speaker: frame.dialogue.speaker ?? 'Narrator',
        text: frame.dialogue.text,
        targetPanel: frame.dialogue.targetPanel ?? inferDialogueTarget(panels),
        isNarrator: frame.dialogue.isNarrator,
        position: frame.dialogue.position,
      }
    : undefined;

  const normalizedFrame: z.infer<typeof FrameInputSchema> = {
    id: frame.id,
    type: frame.type,
    hud: frame.hud,
    panels,
    dialogue,
    narration: frame.narration,
    choices: frame.choices,
    showFreeTextInput: frame.showFreeTextInput,
    battle: frame.battle,
    effects: normalizeEffects(frame.effects),
    audio: frame.audio ?? (frame.music ? { musicAsset: frame.music } : undefined),
    transition: frame.transition,
    skillCheck: frame.skillCheck,
    inventoryData: frame.inventoryData,
    mapData: frame.mapData,
    characterSheet: frame.characterSheet,
    tacticalMapData: frame.tacticalMapData,
  };

  if (
    (normalizedFrame.type === 'full-screen'
      || normalizedFrame.type === 'dialogue'
      || normalizedFrame.type === 'three-panel')
    && !normalizedFrame.dialogue?.text
    && !normalizedFrame.narration?.text
  ) {
    normalizedFrame.narration = { text: '...' };
  }

  return normalizedFrame;
}

function ensureRenderableFrame(frame: z.infer<typeof FrameInputSchema>): z.infer<typeof FrameInputSchema> {
  const panels = frame.panels.length > 0 ? frame.panels : [{ id: 'center' as const }];
  const ensured = { ...frame, panels };

  if (
    (ensured.type === 'full-screen' || ensured.type === 'dialogue' || ensured.type === 'three-panel')
    && !ensured.dialogue?.text
    && !ensured.narration?.text
  ) {
    ensured.narration = { text: '...' };
  }

  return ensured;
}

function normalizeToolInput(input: z.infer<typeof FrameToolInputSchema>): z.infer<typeof FrameInputSchema> {
  const raw = (typeof input === 'object' && input !== null && 'frame' in input)
    ? input.frame
    : input;

  const asCanonical = FrameInputSchema.safeParse(raw);
  if (asCanonical.success) return asCanonical.data;

  const asLegacy = LegacyFrameSchema.safeParse(raw);
  if (asLegacy.success) return normalizeLegacyFrame(asLegacy.data);

  return raw as z.infer<typeof FrameInputSchema>;
}

/**
 * Validates and registers one VNFrame for display.
 * The storyteller agent calls this once per frame it wants to show.
 * Frames are collected from tool results in result.steps after generateText completes.
 */
export const frameBuilderTool = tool({
  description: 'Build and validate one VNFrame for display to the player. Call once per frame. Frames are collected in order and shown sequentially.',
  parameters: FrameToolInputSchema,
  execute: async (frameData) => {
    const normalized = normalizeToolInput(frameData as z.infer<typeof FrameToolInputSchema>);
    const parsed = FrameInputSchema.safeParse(normalized);
    if (!parsed.success) {
      return { ok: false as const, error: parsed.error.message };
    }
    return { ok: true as const, frame: ensureRenderableFrame(parsed.data) as VNFrame };
  },
});
