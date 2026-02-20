import { z } from 'zod';

/** The layout type of a VN frame, determines which React component renders it. */
export const FrameTypeSchema = z.enum(['full-screen', 'dialogue', 'three-panel', 'choice', 'battle', 'transition', 'skill-check', 'inventory', 'map', 'character-sheet', 'tactical-map']);
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
  /** Skill check / dice roll data — for type='skill-check'. */
  skillCheck: z.object({
    stat: z.string().describe('Attribute used, e.g. "intelligence", "luck"'),
    statValue: z.number().describe('Current attribute score'),
    difficulty: z.number().describe('Difficulty Class (DC) to beat'),
    roll: z.number().describe('Raw dice roll result (1-20)'),
    modifier: z.number().optional().describe('Attribute modifier = floor((statValue-10)/2)'),
    total: z.number().describe('Final result = roll + modifier'),
    succeeded: z.boolean().describe('true if total >= difficulty'),
    description: z.string().describe('What the check was for, e.g. "Perception check — spot the hidden door"'),
  }).optional(),
  /** Inventory display — for type='inventory'. */
  inventoryData: z.object({
    items: z.array(z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      icon: z.string().describe('Emoji or short icon text'),
      quantity: z.number(),
      equipped: z.boolean().optional(),
      effect: z.string().optional().describe('Game effect description'),
    })),
    mode: z.enum(['view', 'select']).describe('view=display only, select=player picks an item'),
    prompt: z.string().optional().describe('Instruction shown in select mode'),
  }).optional(),
  /** Location map — for type='map'. */
  mapData: z.object({
    backgroundAsset: z.string().describe('Asset key for map background image'),
    currentLocationId: z.string().describe('ID of where player currently is'),
    /** Map hierarchy level: region = world overview, area = detailed local layout with encounter nodes. */
    level: z.enum(['region', 'area']).default('region'),
    locations: z.array(z.object({
      id: z.string(),
      label: z.string(),
      x: z.number().describe('Horizontal position 0-100 as % of frame width'),
      y: z.number().describe('Vertical position 0-100 as % of frame height'),
      accessible: z.boolean(),
      visited: z.boolean().optional(),
      description: z.string().optional(),
      /** What happens when the player enters this location. combat → triggers initCombatTool. */
      encounterType: z.enum(['combat', 'dialogue', 'explore']).optional(),
    })),
  }).optional(),
  /** Full character sheet — for type='character-sheet'. */
  characterSheet: z.object({
    playerName: z.string(),
    level: z.number(),
    hp: z.number(),
    maxHp: z.number(),
    attributes: z.record(z.string(), z.number()).optional(),
    skills: z.array(z.string()).optional(),
    statusEffects: z.array(z.object({
      id: z.string(),
      name: z.string(),
      type: z.enum(['buff', 'debuff', 'neutral']),
      description: z.string(),
      icon: z.string().optional(),
    })).optional(),
  }).optional(),
  /** Tactical combat map — for type='tactical-map'. */
  tacticalMapData: z.object({
    mapImageUrl: z.string().describe('base64 data URL or https URL for the generated map image'),
    gridCols: z.number().default(12),
    gridRows: z.number().default(8),
    tokens: z.array(z.object({
      id: z.string(),
      type: z.enum(['player', 'enemy', 'ally', 'objective', 'npc']),
      label: z.string(),
      icon: z.string().describe('emoji icon'),
      portraitAsset: z.string().optional(),
      col: z.number(),
      row: z.number(),
      hp: z.number(),
      maxHp: z.number(),
      attack: z.number().default(4),
      defense: z.number().default(10),
      moveRange: z.number().default(3),
      attackRange: z.number().default(1),
      aiPattern: z.enum(['aggressive', 'defensive', 'patrol', 'guard-objective']).optional(),
      patrolPath: z.array(z.object({ col: z.number(), row: z.number() })).optional(),
      hasActed: z.boolean().default(false),
      hasMoved: z.boolean().default(false),
      statusEffects: z.array(z.string()).default([]),
    })),
    terrain: z.array(z.object({
      col: z.number(),
      row: z.number(),
      type: z.enum(['blocked', 'difficult', 'hazard', 'cover']),
      icon: z.string().optional(),
    })).default([]),
    combat: z.object({
      round: z.number().default(1),
      phase: z.enum(['player', 'enemy', 'cutscene']).default('player'),
      turnOrder: z.array(z.string()).default([]),
      activeTokenId: z.string(),
      log: z.array(z.string()).default([]),
      isComplete: z.boolean().default(false),
      result: z.enum(['victory', 'defeat', 'escape']).optional(),
    }),
    rules: z.object({
      playerMoveRange: z.number().default(4),
      playerAttackRange: z.number().default(1),
      showGrid: z.boolean().default(true),
    }).default({ playerMoveRange: 4, playerAttackRange: 1, showGrid: true }),
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
