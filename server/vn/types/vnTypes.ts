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
 * A narrative beat within a node. Instructs the DM on pacing, hidden state,
 * and foreshadowing without revealing the full scene outline prematurely.
 */
export const BeatSchema = z.object({
  description: z.string().describe('The core narrative action or event of this beat'),
  pacing: z.string().describe('Instructions for the DM on how long the beat should last (e.g., "5-8 frames of rapid back-and-forth dialogue")'),
  findings: z.array(z.string()).optional().describe('Specific clues uncovered during this exact beat'),
  interactables: z.array(z.string()).optional().describe('Items relevant or discoverable in this exact beat'),
  foreshadowing: z.string().optional().describe('Subtle hints to lay the groundwork for future beats, allowing the DM to build tension'),
  objective: z.string().optional().describe('The specific goal the player must accomplish to successfully complete this beat'),
  nextBeatIfFailed: z.string().optional().describe('Allows dynamic early exits or branching within a node if the player fails the objective or rolls a Miss'),
});

/**
 * A branching Node in the Directed Acyclic Graph (DAG) story structure.
 */
export const NodeDefinitionSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** Key into AssetPack.backgrounds for this node's primary location. */
  location: z.string(),
  /** Character IDs that appear in this node. */
  requiredCharacters: z.array(z.string()),
  /** Ordered narrative beats guiding the storyteller agent. */
  beats: z.array(BeatSchema),
  /** Instructions for the DM to re-use globalMaterials or reference past emotional states. */
  callbacks: z.array(z.string()).optional(),
  /** Conditions that dictate which node to transition to next. */
  exitConditions: z.array(z.object({
    condition: z.string().describe('Player action or state required to take this exit'),
    nextNodeId: z.string().optional().describe('The ID of the next Node to transition to. If omitted, the game ends.'),
  })).min(1),
  /** Key into AssetPack.music for this node's ambient track. */
  mood: z.string(),
});

/**
 * An overarching phase of the story containing a web of nodes.
 */
export const ActSchema = z.object({
  id: z.string(),
  title: z.string(),
  objective: z.string().describe('The core objective the player is trying to achieve in this Act'),
  nodes: z.array(NodeDefinitionSchema).min(1),
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
    /** Reusable narrative anchors (NPC encounters, traits, motifs, objects). */
    globalMaterials: z.array(z.string()).optional(),
    /** Acts containing a Directed Acyclic Graph of narrative nodes. Must have at least one Act. */
    acts: z.array(ActSchema).min(1),
    /** Possible endings the story can reach based on player choices. */
    possibleEndings: z.array(z.string()).min(1),
  }),
  assets: AssetPackSchema,
  meta: z.object({
    totalNodes: z.number(),
    estimatedDuration: z.string(),
    generationMs: z.number(),
  }),
});

export type AssetRef = z.infer<typeof AssetRefSchema>;
export type AssetPack = z.infer<typeof AssetPackSchema>;
export type Character = z.infer<typeof CharacterSchema>;
export type Beat = z.infer<typeof BeatSchema>;
export type NodeDefinition = z.infer<typeof NodeDefinitionSchema>;
export type Act = z.infer<typeof ActSchema>;
export type VNPackage = z.infer<typeof VNPackageSchema>;

export const SUPPORTED_LANGUAGES: Record<string, string> = {
  en: 'English',
  'zh-CN': '中文（简体）',
};

/** PlotState tracks the player's narrative position within a session. */
export interface PlotState {
  sessionId: string;
  packageId: string;
  currentActId: string;
  currentNodeId: string;
  currentBeat: number;
  offPathTurns: number;
  completedNodes: string[];
  flags: Record<string, unknown>;
  updatedAt: string;
}
