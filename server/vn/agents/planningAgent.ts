import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { generateSceneImage, generateCharacterImage } from '../../agents/imageAgent.js';
import { generateAmbientMusic } from '../../agents/musicAgent.js';
import { VNPackageSchema, type VNPackage, type AssetPack } from '../types/vnTypes.js';
import { db } from '../../db/index.js';
import { vnPackages } from '../../db/schema.js';
import { renderStoryTree } from '../utils/storyVisualizer.js';
import { tracedGenerateObject } from '../../debug/traceAI.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface PlanInput {
  genre: string;
  setting: string;
  protagonistDescription: string;
  additionalContext?: string;
}

// --- Zod schemas for planning output ---

const AssetManifestItemSchema = z.object({
  id: z.string(),
  prompt: z.string(),
});

const MusicManifestItemSchema = z.object({
  id: z.string(),
  prompts: z.array(z.object({ text: z.string(), weight: z.number() })),
});

const StoryPlanSchema = z.object({
  title: z.string(),
  artStyle: z.string(),
  setting: z.object({ world: z.string(), era: z.string(), tone: z.string() }),
  characters: z.array(z.object({
    id: z.string(),
    name: z.string(),
    role: z.enum(['protagonist', 'ally', 'antagonist', 'npc']),
    description: z.string(),
    imagePrompt: z.string(),
  })).min(1),
  plot: z.object({
    premise: z.string(),
    themes: z.array(z.string()),
    acts: z.array(z.object({
      id: z.string(),
      title: z.string(),
      scenes: z.array(z.object({
        id: z.string(),
        title: z.string(),
        location: z.string(),
        requiredCharacters: z.array(z.string()),
        beats: z.array(z.string()),
        exitConditions: z.array(z.string()).min(1),
        mood: z.string(),
      })),
    })).min(1),
    possibleEndings: z.array(z.string()).min(1),
  }),
  assetManifest: z.object({
    backgrounds: z.array(AssetManifestItemSchema),
    characters: z.array(AssetManifestItemSchema),
    music: z.array(MusicManifestItemSchema),
  }),
});

type StoryPlan = z.infer<typeof StoryPlanSchema>;

// --- System prompts ---

const PLANNING_RESEARCH_PROMPT = `You are a visual novel planning agent. Your job is to create a complete story plan for an interactive visual novel game.

Produce a complete story plan with:
- A compelling title and art style description
- Setting details (world, era, tone)
- 2-5 interesting characters with visual descriptions
- A 2-4 act plot structure with multiple scenes per act
- Each scene needs narrative beats, exit conditions, a location, and a mood
- An asset manifest listing all backgrounds, character images, and music tracks needed

CRITICAL ASSET ID RULE: The character image IDs in assetManifest.characters MUST EXACTLY MATCH the character IDs in the characters array. For example, if a character has id "jax_reyes", then assetManifest.characters must contain an entry with id "jax_reyes" — do NOT use different names like "char_jax_neutral". One-to-one match required.

Make the story rich, with branching possibilities and meaningful choices. Each scene should have clear narrative beats that the storyteller agent can follow.`;

const PLAN_ASSEMBLY_PROMPT = `You are assembling the final structure for a visual novel package. Given a story plan, produce the final VNPackage structure with all acts, scenes, characters, and plot details properly organized. Ensure all character IDs referenced in scenes exist in the characters array, and all location/mood references match the asset manifest.`;

function getPlanningModelId(): string {
  return process.env.GEMINI_PLANNING_MODEL
    ?? process.env.GEMINI_TEXT_MODEL
    ?? 'gemini-3-flash-preview';
}

// --- Phase implementations ---

async function runPhase1(
  input: PlanInput,
  onProgress: (message: string) => void,
  requestId?: string,
): Promise<StoryPlan> {
  const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY! });
  onProgress('Researching story world and genre conventions...');
  onProgress(`Using planning model: ${getPlanningModelId()}`);

  const { object: storyPlan } = await tracedGenerateObject({
    model: google(getPlanningModelId()),
    system: PLANNING_RESEARCH_PROMPT,
    prompt: `Create a visual novel story plan:
Genre: ${input.genre}
Setting: ${input.setting}
Protagonist: ${input.protagonistDescription}
${input.additionalContext ? `Additional context: ${input.additionalContext}` : ''}

Research the setting, then produce a complete story plan with asset manifest.`,
    // Web search disabled — uses direct generation only
    schema: StoryPlanSchema,
  }, {
    requestId,
    pipeline: 'vn-plan',
    agentId: 'planning-agent',
    modelId: getPlanningModelId(),
  });

  onProgress(`Plan generated: ${storyPlan.plot.acts.length} acts, ${storyPlan.characters.length} characters`);
  return storyPlan;
}

async function runPhase2(
  storyPlan: StoryPlan,
  packageId: string,
  onProgress: (message: string) => void,
): Promise<AssetPack> {
  const assetDir = path.join(__dirname, '..', '..', '..', 'public', 'generated', packageId);
  await fs.mkdir(assetDir, { recursive: true });

  const [backgrounds, characters, music] = await Promise.all([
    // Generate backgrounds
    Promise.all(storyPlan.assetManifest.backgrounds.map(async (b) => {
      const img = await generateSceneImage(`${storyPlan.artStyle}. ${b.prompt}`);
      const filePath = path.join(assetDir, `${b.id}.png`);
      await fs.writeFile(filePath, Buffer.from(img.base64, 'base64'));
      onProgress(`Generated background: ${b.id}`);
      return [b.id, { url: `/generated/${packageId}/${b.id}.png`, mimeType: img.mimeType }] as const;
    })),
    // Generate characters
    Promise.all(storyPlan.assetManifest.characters.map(async (c) => {
      const img = await generateCharacterImage(`${storyPlan.artStyle}. ${c.prompt}`);
      const filePath = path.join(assetDir, `${c.id}.png`);
      await fs.writeFile(filePath, Buffer.from(img.base64, 'base64'));
      onProgress(`Generated character: ${c.id}`);
      return [c.id, { url: `/generated/${packageId}/${c.id}.png`, mimeType: img.mimeType }] as const;
    })),
    // Generate music
    Promise.all(storyPlan.assetManifest.music.map(async (m) => {
      const mus = await generateAmbientMusic(m.prompts);
      const filePath = path.join(assetDir, `${m.id}.pcm`);
      await fs.writeFile(filePath, mus.pcmBuffer);
      onProgress(`Generated music: ${m.id}`);
      return [m.id, { url: `/generated/${packageId}/${m.id}.pcm`, mimeType: 'audio/pcm' as const }] as const;
    })),
  ]);

  onProgress(`Assets complete: ${backgrounds.length} bg, ${characters.length} chars, ${music.length} music`);

  return {
    backgrounds: Object.fromEntries(backgrounds),
    characters: Object.fromEntries(characters),
    music: Object.fromEntries(music),
  };
}

async function runPhase3(
  storyPlan: StoryPlan,
  assets: AssetPack,
  packageId: string,
  generationMs: number,
): Promise<VNPackage> {
  const totalScenes = storyPlan.plot.acts.reduce((sum, act) => sum + act.scenes.length, 0);

  const pkg: VNPackage = {
    id: packageId,
    createdAt: new Date().toISOString(),
    title: storyPlan.title,
    genre: storyPlan.plot.themes[0] ?? 'adventure',
    artStyle: storyPlan.artStyle,
    setting: storyPlan.setting,
    characters: storyPlan.characters,
    plot: storyPlan.plot,
    assets,
    meta: {
      totalScenes,
      estimatedDuration: `${totalScenes * 5}-${totalScenes * 10} minutes`,
      generationMs,
    },
  };

  // Validate the final package
  VNPackageSchema.parse(pkg);

  return pkg;
}

// --- Main entry point ---

export async function runPlanningAgent(
  input: PlanInput,
  onProgress: (message: string) => void,
  onDebug?: (message: string, meta?: Record<string, unknown>) => void,
  options?: { requestId?: string },
): Promise<VNPackage> {
  const debug = (message: string, meta: Record<string, unknown> = {}) => {
    onDebug?.(message, meta);
  };

  const packageId = uuidv4();
  const startTime = Date.now();
  debug('planning agent start', { packageId, genre: input.genre });

  try {
    // Phase 1: Research + story plan
    onProgress('Phase 1: Researching and planning story...');
    const phase1Start = Date.now();
    const storyPlan = await runPhase1(input, onProgress, options?.requestId);
    debug('phase 1 complete', {
      durationMs: Date.now() - phase1Start,
      acts: storyPlan.plot.acts.length,
      characters: storyPlan.characters.length,
      backgroundsRequested: storyPlan.assetManifest.backgrounds.length,
      characterAssetsRequested: storyPlan.assetManifest.characters.length,
      musicRequested: storyPlan.assetManifest.music.length,
    });

    // Phase 2: Parallel asset generation
    onProgress('Phase 2: Generating assets...');
    const phase2Start = Date.now();
    const assets = await runPhase2(storyPlan, packageId, onProgress);
    debug('phase 2 complete', {
      durationMs: Date.now() - phase2Start,
      backgroundsGenerated: Object.keys(assets.backgrounds).length,
      charactersGenerated: Object.keys(assets.characters).length,
      musicGenerated: Object.keys(assets.music).length,
    });

    // Phase 3: Assemble final VNPackage
    onProgress('Phase 3: Assembling VN package...');
    const phase3Start = Date.now();
    const generationMs = Date.now() - startTime;
    const pkg = await runPhase3(storyPlan, assets, packageId, generationMs);
    debug('phase 3 complete', {
      durationMs: Date.now() - phase3Start,
      packageId: pkg.id,
      totalScenes: pkg.meta.totalScenes,
    });

    // Save to DB
    db.insert(vnPackages).values({
      id: pkg.id,
      createdAt: pkg.createdAt,
      title: pkg.title,
      genre: pkg.genre,
      artStyle: pkg.artStyle,
      metaJson: JSON.stringify(pkg),
      assetDir: path.join('public', 'generated', packageId),
    }).run();
    debug('db insert complete', {
      packageId: pkg.id,
      generationMs: pkg.meta.generationMs,
      totalElapsedMs: Date.now() - startTime,
    });

    // Log story tree to console
    console.log('\n' + renderStoryTree(pkg) + '\n');
    debug('planning agent success', { packageId: pkg.id, totalElapsedMs: Date.now() - startTime });

    return pkg;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    debug('planning agent failed', { packageId, message, stack, totalElapsedMs: Date.now() - startTime });
    throw err;
  }
}
