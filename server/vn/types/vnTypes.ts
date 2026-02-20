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
});

/**
 * A single scene within an act.
 * Scenes consist of narrative beats; the storyteller works through these
 * and must meet exitConditions to advance.
 */
export const SceneDefinitionSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** Key into AssetPack.backgrounds for this scene's primary location. */
  location: z.string(),
  /** Character IDs that appear in this scene. */
  requiredCharacters: z.array(z.string()),
  /** Ordered narrative beats guiding the storyteller agent. */
  beats: z.array(z.string()),
  /** Conditions that must be met before the scene can end (at least one). */
  exitConditions: z.array(z.string()).min(1),
  /** Key into AssetPack.music for this scene's ambient track. */
  mood: z.string(),
});

/** A story act containing one or more scenes. */
export const ActSchema = z.object({
  id: z.string(),
  title: z.string(),
  scenes: z.array(SceneDefinitionSchema),
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
  setting: z.object({
    world: z.string(),
    era: z.string(),
    tone: z.string(),
  }),
  /** All characters in the story. Must have at least one. */
  characters: z.array(CharacterSchema).min(1),
  plot: z.object({
    premise: z.string(),
    themes: z.array(z.string()),
    /** Story acts in order. Must have at least one. */
    acts: z.array(ActSchema).min(1),
    /** Possible endings the story can reach based on player choices. */
    possibleEndings: z.array(z.string()).min(1),
  }),
  assets: AssetPackSchema,
  meta: z.object({
    totalScenes: z.number(),
    estimatedDuration: z.string(),
    generationMs: z.number(),
  }),
});

export type AssetRef = z.infer<typeof AssetRefSchema>;
export type AssetPack = z.infer<typeof AssetPackSchema>;
export type Character = z.infer<typeof CharacterSchema>;
export type SceneDefinition = z.infer<typeof SceneDefinitionSchema>;
export type Act = z.infer<typeof ActSchema>;
export type VNPackage = z.infer<typeof VNPackageSchema>;

/** PlotState tracks the player's narrative position within a session. */
export interface PlotState {
  sessionId: string;
  packageId: string;
  currentActId: string;
  currentSceneId: string;
  currentBeat: number;
  offPathTurns: number;
  completedScenes: string[];
  flags: Record<string, unknown>;
  updatedAt: string;
}
