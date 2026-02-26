import { tool } from 'ai';
import { z } from 'zod';
import {
  VNFrameSchema, FrameTypeSchema, VNPanelSchema, VNEffectSchema,
  type VNFrame,
} from '../types/vnFrame.js';
import { FRAME_REGISTRY_MAP } from '../frameRegistry.js';

/**
 * Schema the LLM sees for frameBuilderTool. Uses concrete types (not z.any())
 * so Gemini / other models can produce valid structured output.
 * Normalization in execute() still handles minor deviations.
 */
export const FrameInputSchema = z.object({
  id: z.string().describe('Unique descriptive slug for this frame, e.g. "harbor-arrival-1"'),
  type: FrameTypeSchema.describe('The frame layout type'),
  panels: z.array(VNPanelSchema).optional().describe('Visual panels. Dialogue needs 2 panels (left+right), three-panel needs 3, full-screen needs 1 center panel.'),
  dialogue: z.object({
    speaker: z.string(),
    text: z.string(),
    targetPanel: z.enum(['left', 'right', 'center']).optional(),
    isNarrator: z.boolean().optional(),
    position: z.enum(['bubble', 'bottom']).optional(),
  }).optional().describe('Single character dialogue. @deprecated Use conversation[] instead.'),
  conversation: z.array(z.union([
    z.object({ speaker: z.string(), text: z.string(), effect: VNEffectSchema.optional() }),
    z.object({ narrator: z.string(), effect: VNEffectSchema.optional() }),
    // Legacy backward compat: accept {speaker, text, isNarrator:true} — normalized away below
    z.object({ speaker: z.string(), text: z.string(), isNarrator: z.boolean().optional(), effect: VNEffectSchema.optional() }),
  ])).optional().describe('Conversation lines. Two shapes: {speaker,text} for spoken dialogue, {narrator:"..."} for actions/thoughts/stage direction.'),
  narration: z.object({
    text: z.string(),
    panelId: z.string().optional(),
  }).optional().describe('Narrator text with no speaker. @deprecated Use narrations[] instead.'),
  narrations: z.array(z.object({
    text: z.string(),
    effect: VNEffectSchema.optional(),
  })).optional().describe('Array of narration beats with optional per-beat effects on same visual. Player clicks through each.'),
  choices: z.array(z.object({
    id: z.string(),
    text: z.string(),
    hint: z.string().optional(),
  })).optional().describe('Player choices for choice frames. 2-4 options.'),
  showFreeTextInput: z.boolean().optional().describe('Allow player to type a custom action'),
  effects: z.array(VNEffectSchema).optional().describe('Visual effects: shake, flash, fade-in, etc.'),
  audio: z.object({
    musicAsset: z.string().optional(),
    fadeIn: z.boolean().optional(),
    stopMusic: z.boolean().optional(),
  }).optional(),
  transition: z.object({
    type: z.enum(['crossfade', 'wipe-right', 'black-cut']),
    durationMs: z.number(),
    titleCard: z.string().optional(),
  }).optional(),
  diceRoll: z.object({
    diceNotation: z.string().describe('e.g. "1d20", "2d6"'),
    roll: z.number().optional().describe('Pre-computed result'),
    description: z.string().optional().describe('What is being rolled for'),
  }).optional(),
  skillCheck: z.object({
    stat: z.string(),
    statValue: z.number(),
    difficulty: z.number(),
    roll: z.number(),
    modifier: z.number().optional(),
    total: z.number(),
    succeeded: z.boolean(),
    description: z.string(),
  }).optional(),
  inventoryData: z.object({
    items: z.array(z.object({
      id: z.string(), name: z.string(), description: z.string(),
      icon: z.string(), quantity: z.number(),
      equipped: z.boolean().optional(), effect: z.string().optional(),
    })),
    mode: z.enum(['view', 'select']),
    prompt: z.string().optional(),
  }).optional(),
  mapData: z.object({
    backgroundAsset: z.string(),
    currentLocationId: z.string(),
    level: z.enum(['region', 'area']).optional(),
    locations: z.array(z.object({
      id: z.string(), label: z.string(),
      x: z.number(), y: z.number(),
      accessible: z.boolean(), visited: z.boolean().optional(),
      description: z.string().optional(),
      encounterType: z.enum(['combat', 'dialogue', 'explore']).optional(),
    })),
  }).optional(),
  characterSheet: z.object({
    playerName: z.string(), level: z.number(),
    hp: z.number(), maxHp: z.number(),
    attributes: z.record(z.string(), z.number()).optional(),
    skills: z.array(z.string()).optional(),
    statusEffects: z.array(z.object({
      id: z.string(), name: z.string(),
      type: z.enum(['buff', 'debuff', 'neutral']),
      description: z.string(), icon: z.string().optional(),
    })).optional(),
  }).optional(),
  itemPresentation: z.object({
    itemAsset: z.string().describe('Asset key for the item image'),
    itemName: z.string(),
    description: z.string(),
  }).optional(),
  cgPresentation: z.object({
    cgAsset: z.string().describe('Asset key for the full-screen event CG'),
    description: z.string().describe('Low-distraction text overlay for the CG'),
    emotion: z.enum(['romantic', 'thriller', 'horror', 'happy', 'sad', 'epic', 'neutral']).default('neutral'),
  }).optional(),
  monologue: z.object({
    text: z.string(),
    speaker: z.string().optional(),
    voiceAsset: z.string().optional(),
  }).optional(),
  investigationData: z.object({
    backgroundAsset: z.string(),
    hotspots: z.array(z.object({
      id: z.string(),
      label: z.string().describe('Short descriptive label for the player to click/select'),
    })),
  }).optional(),
  loreEntry: z.object({
    title: z.string(),
    category: z.string(),
    content: z.string(),
  }).optional(),
  cutIn: z.object({
    speaker: z.string(),
    text: z.string(),
    style: z.enum(['shout', 'thought', 'critical']),
    characterAsset: z.string().optional(),
  }).optional(),
  flashback: z.object({
    text: z.string(),
    filter: z.enum(['sepia', 'grayscale', 'glitch']).default('sepia'),
    backgroundAsset: z.string().optional(),
  }).optional(),
  crossExamination: z.object({
    speaker: z.string(),
    statement: z.string(),
    contradictionItemId: z.string().optional().describe('ID of the item that proves this statement false, if any'),
  }).optional(),
  timeLimit: z.object({
    seconds: z.number(),
    text: z.string().describe('The urgent situation description'),
    failureConsequence: z.string().describe('What happens if the player fails to act in time'),
  }).optional(),
  tacticalMapData: z.any().optional().describe('Tactical combat map data — use initCombatTool result directly'),
  hud: z.object({
    chapter: z.string(), scene: z.string(), showNav: z.boolean(),
  }).optional(),
  battle: z.any().optional(),
});

// ─── Normalization helpers ────────────────────────────────────────────────────

/** Normalize a single panel from any legacy format to canonical {id, characterAsset, ...} */
function normalizePanel(p: any): any {
  if (!p) return p;
  const result: any = { ...p };

  // position → id
  if (p.position && !p.id) {
    result.id = p.position;
    delete result.position;
  }
  // assetKey → figure out if it's a character or background asset
  if (p.assetKey && !p.characterAsset && !p.backgroundAsset) {
    if (p.assetKey.startsWith('bg_')) {
      result.backgroundAsset = p.assetKey;
    } else {
      result.characterAsset = p.assetKey;
    }
    delete result.assetKey;
  }
  // weight → panelWeight
  if (p.weight !== undefined && p.panelWeight === undefined) {
    result.panelWeight = p.weight;
    delete result.weight;
  }
  // dim → dimmed
  if (p.dim !== undefined && p.dimmed === undefined) {
    result.dimmed = p.dim;
    delete result.dim;
  }
  return result;
}

/** Normalize legacy effects object ({shake: true, flash: true}) to canonical array */
function normalizeEffects(effects: any): any {
  if (!effects || Array.isArray(effects)) return effects;
  if (typeof effects === 'object') {
    return Object.entries(effects)
      .filter(([, v]) => v === true)
      .map(([k]) => ({ type: k }));
  }
  return effects;
}

/** Unwrap the LLM payload and normalize to a canonical-ish flat frame object */
function normalizeInput(input: any): any {
  // Unwrap { frame: {...} } or { frames: [{...}] } wrapper
  let raw: any = input;
  if (input?.frames && Array.isArray(input.frames) && input.frames.length > 0) {
    raw = input.frames[0];
  } else if (input?.frame) {
    raw = input.frame;
  }

  // id fallbacks
  const id = raw.id ?? raw.frameId ?? `frame-${Date.now()}`;

  // backgroundAsset: accept top-level background / backgroundAsset and fold into panels
  const topBg = raw.backgroundAsset ?? raw.background ?? null;
  const topMusic = raw.music ?? null;

  // Normalize panels
  let panels: any[] = (raw.panels ?? []).map(normalizePanel);
  if (panels.length === 0) {
    panels = [{ id: 'center', ...(topBg ? { backgroundAsset: topBg } : {}) }];
  } else if (topBg) {
    panels = panels.map(p => ({ backgroundAsset: topBg, ...p }));
  }

  // Audio: merge legacy top-level music key
  const audio = raw.audio ?? (topMusic ? { musicAsset: topMusic } : undefined);

  // Effects: normalize legacy object format
  const effects = normalizeEffects(raw.effects);

  // Dialogue: infer targetPanel from panels if missing
  let dialogue = raw.dialogue;
  if (dialogue && !dialogue.targetPanel && panels.length > 0) {
    const charPanel = panels.find((p: any) => p.characterAsset && !p.characterAsset.startsWith('bg_'));
    if (charPanel?.id) {
      dialogue = { ...dialogue, targetPanel: charPanel.id };
    }
  }

  // Normalize old → new: single dialogue → conversation[]
  let conversation = raw.conversation;
  if (!conversation && dialogue) {
    conversation = [
      dialogue.isNarrator
        ? { narrator: dialogue.text }
        : { speaker: dialogue.speaker, text: dialogue.text },
    ];
    dialogue = undefined;
  }

  // Normalize legacy isNarrator entries → {narrator} shape
  if (Array.isArray(conversation)) {
    conversation = conversation.map((line: any) => {
      if (line.isNarrator && line.text) {
        const result: any = { narrator: line.text };
        if (line.effect) result.effect = line.effect;
        return result;
      }
      if ('isNarrator' in line) {
        const { isNarrator, ...rest } = line;
        return rest;
      }
      return line;
    });
  }

  // Soft warning: detect fake stat modifiers in conversation text
  if (Array.isArray(conversation)) {
    const STAT_PATTERN = /[\u4e00-\u9fff]+[+\-]\d|[A-Z][a-z]+\s*[+\-]\d/;
    for (const line of conversation) {
      const text = 'narrator' in line ? (line as any).narrator : (line as any).text;
      if (text && STAT_PATTERN.test(text)) {
        console.warn(`[frameBuilderTool] Fake stat modifier in text: "${text.substring(0, 80)}…" — use dice-roll frames instead`);
      }
    }
  }

  // Normalize old → new: single narration → narrations[]
  let narrations = raw.narrations;
  if (!narrations && raw.narration) {
    narrations = [{ text: raw.narration.text }];
  }

  return {
    ...raw,
    id,
    panels,
    ...(conversation ? { conversation, dialogue: undefined } : dialogue ? { dialogue } : {}),
    ...(narrations ? { narrations, narration: undefined } : raw.narration ? { narration: raw.narration } : {}),
    ...(audio ? { audio } : {}),
    ...(effects ? { effects } : {}),
  };
}

// ─── Tool export ──────────────────────────────────────────────────────────────

/**
 * Validates and registers one VNFrame for display.
 * The storyteller agent calls this once per frame it wants to show.
 * Frames are collected from tool results in result.steps after the agent loop completes.
 *
 * Returns ok:false (error) for frames missing required content — this forces
 * the model to retry with actual narrative text instead of silently rendering
 * empty frames.
 */
export const frameBuilderTool = tool({
  description: 'Build and validate one VNFrame for display to the player. Call once per frame. Frames are collected in order and shown sequentially.',
  inputSchema: FrameInputSchema,
  execute: async (rawInput: any) => {
    try {
      const normalized = normalizeInput(rawInput);

      // Reject frames that have no renderable content — force the model to retry
      if (
        normalized.type &&
        FRAME_REGISTRY_MAP.get(normalized.type)?.requiresNarration
        && !normalized.dialogue?.text
        && !normalized.narration?.text
        && !normalized.conversation?.length
        && !normalized.narrations?.length
      ) {
        return {
          ok: false as const,
          error: `Frame "${normalized.id}" (${normalized.type}) has no content. You MUST provide conversation[] or narrations[] with actual narrative text.`,
        };
      }

      // Reject choice frames with no choices
      if (normalized.type === 'choice' && (!normalized.choices || normalized.choices.length === 0)) {
        return {
          ok: false as const,
          error: `Choice frame "${normalized.id}" has no choices[]. You MUST provide 2-4 choice options.`,
        };
      }

      // Auto-coerce: if a non-choice frame has choices[], upgrade type to 'choice'
      // This ensures the stop condition fires immediately instead of retrying
      if (normalized.type !== 'choice' && normalized.choices && normalized.choices.length > 0) {
        normalized.type = 'choice';
      }

      const parsed = VNFrameSchema.safeParse(normalized);
      if (parsed.success) {
        return { ok: true as const, frame: parsed.data as VNFrame };
      }
      // If strict schema fails, still return the normalized frame — don't block rendering
      return { ok: true as const, frame: normalized as VNFrame };
    } catch (err: any) {
      return { ok: false as const, error: String(err) };
    }
  },
});
