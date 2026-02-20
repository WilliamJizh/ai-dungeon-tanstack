import { z } from 'zod';

/** The layout type of a VN frame, determines which React component renders it. */
export const FrameTypeSchema = z.enum(['full-screen', 'dialogue', 'three-panel', 'choice', 'battle', 'transition']);
export type FrameType = z.infer<typeof FrameTypeSchema>;

/** Visual effects applied to a frame or panel. Auto-cleared after durationMs. */
export const EffectTypeSchema = z.enum(['shake', 'flash', 'fade-in', 'fade-out', 'scan-lines', 'vignette-pulse']);

export const VNEffectSchema = z.object({
  type: EffectTypeSchema,
  /** Which part of the screen the effect targets. Defaults to 'screen'. */
  target: z.enum(['screen', 'left', 'right', 'center']).optional(),
  /** How long the effect lasts in milliseconds before auto-removal. */
  durationMs: z.number(),
  /** Effect intensity from 0 (subtle) to 1 (maximum). */
  intensity: z.number().min(0).max(1).optional(),
  /** CSS color string for flash/vignette effects. */
  color: z.string().optional(),
});

export const VNPanelSchema = z.object({
  id: z.enum(['left', 'right', 'center']),
  /** Key into AssetPack.backgrounds — resolves to a file URL. */
  backgroundAsset: z.string().optional(),
  /** Key into AssetPack.characters — resolves to a transparent PNG URL. */
  characterAsset: z.string().optional(),
  /** Mirror the character image horizontally (for characters facing left). */
  characterFlipped: z.boolean().optional(),
  /** Apply dark/desaturated treatment to inactive panels. */
  dimmed: z.boolean().optional(),
  /** Panel flex weight for accordion layout. Active: 62, Inactive: 38. */
  panelWeight: z.number().optional(),
});

export const VNFrameSchema = z.object({
  id: z.string(),
  type: FrameTypeSchema,
  /** HUD overlay shown at the top of the screen. */
  hud: z.object({
    chapter: z.string(),
    scene: z.string(),
    showNav: z.boolean(),
  }).optional(),
  /** One or more panels composing the visual layout. */
  panels: z.array(VNPanelSchema),
  /** Dialogue spoken by a character or narrator. */
  dialogue: z.object({
    speaker: z.string(),
    text: z.string(),
    /** Which panel the speech bubble attaches to. */
    targetPanel: z.enum(['left', 'right', 'center']),
    isNarrator: z.boolean().optional(),
    /** 'bubble' attaches to panel, 'bottom' shows as bottom bar. */
    position: z.enum(['bubble', 'bottom']).optional(),
  }).optional(),
  /** Narration box (no speaker attribution). */
  narration: z.object({
    text: z.string(),
    panelId: z.string().optional(),
  }).optional(),
  /** Player choice options. */
  choices: z.array(z.object({
    id: z.string(),
    text: z.string(),
    hint: z.string().optional(),
  })).optional(),
  /** Whether to show a free-text input below choices. */
  showFreeTextInput: z.boolean().optional(),
  /** Battle layout data — only for type='battle'. */
  battle: z.object({
    player: z.object({
      name: z.string(),
      level: z.number(),
      hp: z.number(),
      maxHp: z.number(),
      portraitAsset: z.string(),
    }),
    enemies: z.array(z.object({
      name: z.string(),
      hp: z.number(),
      maxHp: z.number(),
    })),
    combatLog: z.array(z.string()),
    skills: z.array(z.object({
      icon: z.string(),
      label: z.string(),
      active: z.boolean().optional(),
    })),
    round: z.number(),
  }).optional(),
  /** Visual effects applied when this frame renders. */
  effects: z.array(VNEffectSchema).optional(),
  /** Audio cue for this frame. */
  audio: z.object({
    musicAsset: z.string().optional(),
    fadeIn: z.boolean().optional(),
    stopMusic: z.boolean().optional(),
  }).optional(),
  /** Scene transition data — only for type='transition'. */
  transition: z.object({
    type: z.enum(['crossfade', 'wipe-right', 'black-cut']),
    durationMs: z.number(),
    titleCard: z.string().optional(),
  }).optional(),
  /**
   * Internal metadata used by agents to track narrative position.
   * Stripped before sending frames to the client.
   */
  _meta: z.object({
    sceneId: z.string(),
    beatIndex: z.number(),
    plotProgressPercent: z.number(),
    narrativeNotes: z.string(),
  }).optional(),
});

export type VNEffect = z.infer<typeof VNEffectSchema>;
export type VNPanel = z.infer<typeof VNPanelSchema>;
export type VNFrame = z.infer<typeof VNFrameSchema>;
