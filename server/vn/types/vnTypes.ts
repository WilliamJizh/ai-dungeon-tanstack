import { z } from 'zod';

/** Reference to a generated asset file stored on disk. */
export const AssetRefSchema = z.object({
  /** Relative URL served by @fastify/static, e.g. '/generated/{packageId}/harbor-night.png' */
  url: z.string(),
  /** MIME type of the asset file, e.g. 'image/png' or 'audio/pcm' */
  mimeType: z.string(),
});

/**
 * All assets for a VN package, indexed by slug key.
 * Keys are stable identifiers that agents and frames reference to load assets.
 */
export const AssetPackSchema = z.object({
  /** location-slug → scene background PNG URL */
  backgrounds: z.record(z.string(), AssetRefSchema),
  /** char-slug → transparent character PNG URL */
  characters: z.record(z.string(), AssetRefSchema),
  /** mood-slug → PCM audio file URL */
  music: z.record(z.string(), AssetRefSchema),
});

/** A character in the visual novel with display and generation metadata. */
export const CharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(['protagonist', 'ally', 'antagonist', 'npc']),
  description: z.string(),
  /** Prompt sent to the image generation API to create this character's portrait. */
  imagePrompt: z.string(),
  /** Optional character arc for sandbox encounters. */
  personalArc: z.object({
    want: z.string().describe('What the character consciously desires'),
    need: z.string().describe('What the character actually needs to grow'),
    arcEncounters: z.array(z.lazy(() => EncounterSchema)).describe('Character-specific encounters injected by the Director'),
  }).optional(),
});

/**
 * Dynamic world info injected via regex keyword matching.
 */
export const WorldInfoSchema = z.object({
  id: z.string(),
  keys: z.array(z.string()).describe('Keywords or regex patterns that trigger this info injection'),
  content: z.string().describe('The lore, entity description, or atmospheric detail to inject'),
  type: z.enum(['lore', 'entity', 'atmosphere']).default('lore'),
});

/**
 * A narrative beat within a location. Instructs the DM on pacing, hidden state,
 * and foreshadowing without revealing the full scene outline prematurely.
 */
export const BeatSchema = z.object({
  id: z.string().optional(),
  description: z.string().describe('The core narrative action or event of this beat'),
  pacing: z.object({
    expectedFrames: z.number().describe('How many frames this beat should take approximately'),
    focus: z.enum(['dialogue_and_worldbuilding', 'standard', 'tension_and_action']).describe('Dictates the frame density (10-20 clicks for dialogue, 5-8 for action)')
  }),
  findings: z.array(z.string()).optional().describe('Specific clues uncovered during this exact beat'),
  interactables: z.array(z.string()).optional().describe('Items relevant or discoverable in this exact beat'),
  potentialFlags: z.array(z.string()).optional().describe('Semantic state flags the player could earn here (e.g. "barricaded_door", "found_revolver")'),
  foreshadowing: z.string().optional().describe('Subtle hints to lay the groundwork for future beats, allowing the DM to build tension'),
});

/**
 * A self-contained narrative unit in the sandbox encounter pool.
 * Unlike ordered beats, encounters are unordered and selected by the Director
 * based on context, prerequisites, and priority.
 */
export const EncounterSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().describe('What happens in this encounter — DM instructions'),
  type: z.enum(['discovery', 'npc_interaction', 'combat', 'puzzle', 'atmospheric']),
  pacing: z.object({
    expectedFrames: z.number().describe('Approximate frame count for this encounter'),
    focus: z.enum(['dialogue_and_worldbuilding', 'standard', 'tension_and_action']),
  }),
  /** Flag names that must be true for this encounter to be available. */
  prerequisites: z.array(z.string()).optional(),
  /** Skip this encounter if any of these flags are set. */
  excludeIfFlags: z.array(z.string()).optional(),
  /** Characters that must be present at the location for this encounter. */
  requiredCharacters: z.array(z.string()).optional(),
  /** Increment globalProgression by this amount when encounter is completed. */
  givesProgression: z.number().optional(),
  potentialFlags: z.array(z.string()).optional().describe('Semantic flags the player could earn'),
  findings: z.array(z.string()).optional().describe('Clues uncovered during this encounter'),
  interactables: z.array(z.string()).optional().describe('Items discoverable in this encounter'),
  /** If set, this encounter belongs to a character's personal arc. */
  arcCharacterId: z.string().optional(),
  arcPhase: z.enum(['introduction', 'development', 'crisis', 'resolution']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  repeatable: z.boolean().default(false),
});

/**
 * Predetermined plot events that drive the narrative forward and trigger based on conditions.
 */
export const InevitableEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  triggerCondition: z.string().describe('When this event should trigger (e.g., "After 5 turns in the mansion" or "If player finds the amulet")'),
  description: z.string().describe('The narrative event that occurs'),
  forcesClimax: z.boolean().default(false).describe('If true, this event serves as the climax boundary for the current Act'),
  beatOverride: BeatSchema.optional().describe('If triggered, this beat overrides the location\'s standard beats'),
  conditionalBranches: z.array(z.object({
    condition: z.string().describe('A javascript-like condition checking flags, e.g., "has_flag(\'barricaded_door\')"'),
    effect: z.string().describe('How the event is altered if this condition is true')
  })).optional()
});

/**
 * A physical location in the sandbox that players can explore.
 * Replaces the old linear 'Node' concept.
 */
export const LocationSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** Key into AssetPack.backgrounds for this node's primary location. */
  location: z.string(),
  /** Character IDs that appear in this node. */
  requiredCharacters: z.array(z.string()),
  /** Sensory details describing the space (smell, temperature, lighting) */
  ambientDetail: z.string().optional(),
  /** Ordered narrative beats guiding the storyteller agent within this location (legacy mode). */
  beats: z.array(BeatSchema),
  /** Unordered encounter pool for sandbox mode. When present, Director selects encounters. */
  encounters: z.array(EncounterSchema).optional(),
  /** IDs of other Location objects the player can travel to from here. */
  connections: z.array(z.string()).describe('Valid Location IDs the player can move to'),
  /** Instructions for the DM to re-use globalMaterials or reference past emotional states. */
  callbacks: z.array(z.string()).optional(),
  /** Key into AssetPack.music for this node's ambient track. */
  mood: z.string(),
});

/**
 * An overarching phase of the story containing a sandbox of locations and inevitable events.
 */
export const ActSchema = z.object({
  id: z.string(),
  title: z.string(),
  objective: z.string().describe('The core objective the player is trying to achieve in this Act'),
  scenarioContext: z.string().describe('The hidden truth for this act. What is actually going on behind the scenes.'),
  narrativeGuidelines: z.string().describe('Stylistic rules for this specific act (e.g., "Keep it a mundane mystery for now, don\'t spoil the monsters yet")'),
  scenarioWorldInfo: z.array(WorldInfoSchema).optional().describe('World info specific to this Act'),
  sandboxLocations: z.array(LocationSchema).min(1).describe('Locations the player can explore in this Act'),
  inevitableEvents: z.array(InevitableEventSchema).optional().describe('Predetermined events that push the plot forward'),
  /** Player's progression tracker toward the act objective (sandbox mode). */
  globalProgression: z.object({
    requiredValue: z.number().describe('Progression value needed to complete this act'),
    trackerLabel: z.string().describe('Display label, e.g. "Clues Uncovered"'),
  }).optional(),
  /** Opposing force / doom clock that creates pacing pressure (sandbox mode). */
  opposingForce: z.object({
    trackerLabel: z.string().describe('Display label, e.g. "Corporate Security Alert Level"'),
    requiredValue: z.number().describe('Max value before forced climax'),
    escalationEvents: z.array(z.object({
      threshold: z.number(),
      description: z.string().describe('What happens when this threshold is reached'),
    })),
  }).optional(),
});

/**
 * The complete game manifest produced by the Planning Agent.
 * Stored in SQLite (metadata) + disk (assets). Loaded once per session.
 */
export const VNPackageSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  title: z.string(),
  genre: z.string(),
  artStyle: z.string(),
  language: z.string().default('en').describe('BCP-47 language tag for all story content, e.g. "en", "zh-CN"'),
  plot: z.object({
    premise: z.string(),
    themes: z.array(z.string()),
    globalContext: z.object({
      setting: z.string(),
      tone: z.string(),
      overarchingTruths: z.array(z.string()),
    }),
    /** Reusable narrative anchors (NPC encounters, traits, motifs, objects). */
    globalMaterials: z.array(z.string()).optional(),
    globalWorldInfo: z.array(WorldInfoSchema).optional().describe('World info that applies across all acts'),
    /** Acts containing the sandbox and inevitable events. Must have at least one Act. */
    acts: z.array(ActSchema).min(1),
    /** Possible endings the story can reach based on player choices. */
    possibleEndings: z.array(z.string()).min(1),
  }),
  /** All characters in the story. Must have at least one. */
  characters: z.array(CharacterSchema).min(1),
  assets: AssetPackSchema,
  meta: z.object({
    totalNodes: z.number().optional(), // Keeping for backward compatibility temporarily
    estimatedDuration: z.string(),
    generationMs: z.number(),
  }),
});

export type AssetRef = z.infer<typeof AssetRefSchema>;
export type AssetPack = z.infer<typeof AssetPackSchema>;
export type Character = z.infer<typeof CharacterSchema>;
export type WorldInfo = z.infer<typeof WorldInfoSchema>;
export type Beat = z.infer<typeof BeatSchema>;
export type Encounter = z.infer<typeof EncounterSchema>;
export type InevitableEvent = z.infer<typeof InevitableEventSchema>;
export type Location = z.infer<typeof LocationSchema>;
export type Act = z.infer<typeof ActSchema>;
export type VNPackage = z.infer<typeof VNPackageSchema>;

export const SUPPORTED_LANGUAGES: Record<string, string> = {
  en: 'English',
  'zh-CN': '中文（简体）',
};

/** Dynamic NPC state tracked per-session by the Director. */
export interface CharacterState {
  currentLocationId?: string;
  disposition: string;
}

/** Active complication injected by the Director. */
export interface ActiveComplication {
  description: string;
  injectedAtTurn: number;
  maxTurns: number;
}

/** Opposing force / doom clock runtime state. */
export interface OpposingForceState {
  currentTick: number;
  escalationHistory: string[];
}

/** PlotState tracks the player's narrative position within a session. */
export interface PlotState {
  sessionId: string;
  packageId: string;
  currentActId: string;
  currentLocationId: string;
  currentBeat: number;
  offPathTurns: number;
  completedLocations: string[];
  flags: Record<string, unknown>;
  updatedAt: string;
  // Sandbox / Director fields
  turnCount: number;
  globalProgression: number;
  opposingForce: OpposingForceState;
  characterStates: Record<string, CharacterState>;
  activeComplication: ActiveComplication | null;
  exhaustedEncounters: string[];
  injectedEncounters: Record<string, Encounter[]>;
  directorNotes: Record<string, unknown>;
}
