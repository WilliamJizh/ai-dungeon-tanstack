import { tool } from 'ai';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { generateSceneImage, generateCharacterImage } from '../../agents/imageAgent.js';
import { generateAmbientMusic } from '../../agents/musicAgent.js';
import { VNPackageSchema } from '../types/vnTypes.js';
import { db } from '../../db/index.js';
import { vnPackages } from '../../db/schema.js';
import { vnPackageStore } from '../state/vnPackageStore.js';
import { renderStoryTree } from '../utils/storyVisualizer.js';
import type {
  PlanSession,
  PlanDraftCharacter,
  PlanDraftScene,
} from '../state/planSessionStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function assetDir(packageId: string) {
  return path.join(__dirname, '..', '..', '..', 'public', 'generated', packageId);
}

// ─── proposeStoryPremise ─────────────────────────────────────────────────────

const proposeStoryPremiseInput = z.object({
  title: z.string().describe('The title of the visual novel'),
  artStyle: z.string().describe('Art style description, e.g. "cel-shaded anime, dark and moody"'),
  language: z.string().default('en').describe('BCP-47 language code for all story content: "en" for English, "zh-CN" for Simplified Chinese'),
  setting: z.object({
    world: z.string().describe('World/universe description'),
    era: z.string().describe('Time period or era'),
    tone: z.string().describe('Emotional tone (e.g. "gritty noir", "hopeful sci-fi")'),
  }),
  premise: z.string().describe('1-2 sentence story premise'),
  themes: z.array(z.string()).describe('Core themes (e.g. ["identity", "redemption"])'),
  possibleEndings: z.array(z.string()).min(1).describe('2-3 possible endings'),
});

// ─── proposeCharacter ────────────────────────────────────────────────────────

const proposeCharacterInput = z.object({
  id: z.string().describe('Unique slug for this character, e.g. "kira_voss". Must also be used as asset key.'),
  name: z.string(),
  role: z.enum(['protagonist', 'ally', 'antagonist', 'npc']),
  description: z.string().describe('Personality, backstory, motivations'),
  imagePrompt: z.string().describe('Detailed visual prompt for character portrait generation'),
});

// ─── proposeAct ──────────────────────────────────────────────────────────────

const proposeActInput = z.object({
  id: z.string().describe('Unique slug for this act, e.g. "act1"'),
  title: z.string().describe('Act title'),
});

// ─── proposeScene ────────────────────────────────────────────────────────────

const proposeSceneInput = z.object({
  actId: z.string().describe('ID of the act this scene belongs to'),
  id: z.string().describe('Unique slug, e.g. "harbor-night". Used as background asset key.'),
  title: z.string(),
  location: z.string().describe('Asset key for background image — must equal this scene id'),
  requiredCharacters: z.array(z.string()).describe('Character IDs that appear in this scene'),
  beats: z.array(z.string()).min(1).describe('Narrative beats in order'),
  exitConditions: z.array(z.string()).min(1).describe('Conditions that end this scene'),
  mood: z.string().describe('Asset key for music — slug like "tension-theme" or "hope-theme"'),
  backgroundPrompt: z.string().describe('Visual prompt for background image generation'),
  musicPrompts: z.array(z.object({
    text: z.string(),
    weight: z.number(),
  })).describe('Weighted prompts for ambient music generation'),
});

// ─── updateElement ───────────────────────────────────────────────────────────

const updateElementInput = z.object({
  type: z.enum(['premise', 'character', 'act', 'scene']),
  id: z.string().optional().describe('Required for character, act, scene — not needed for premise'),
  changes: z.record(z.string(), z.unknown()).describe('Fields to merge/update'),
  regenerateImage: z.boolean().optional().describe('Set true if imagePrompt changed and portrait should be regenerated'),
});

// ─── finalizePackage ─────────────────────────────────────────────────────────

const finalizePackageInput = z.object({
  title: z.string().describe('Confirmed story title for the completion message'),
});

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createPlanningTools(session: PlanSession) {
  const { packageId, draft } = session;

  return {
    proposeStoryPremise: tool({
      description: 'Propose the story premise: title, art style, setting, themes, and possible endings. Call this first before proposing characters or scenes.',
      inputSchema: proposeStoryPremiseInput,
      execute: async (input) => {
        draft.premise = input;
        return { ok: true, title: input.title };
      },
    }),

    proposeCharacter: tool({
      description: 'Propose a character for the story. Generates their portrait image. The character id MUST exactly match the asset key used in scenes.',
      inputSchema: proposeCharacterInput,
      execute: async (input) => {
        const artStyle = draft.premise?.artStyle ?? '';
        const img = await generateCharacterImage(`${artStyle}. ${input.imagePrompt}`);
        const dir = assetDir(packageId);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, `${input.id}.png`), Buffer.from(img.base64, 'base64'));

        const character: PlanDraftCharacter = {
          ...input,
          imageUrl: `/generated/${packageId}/${input.id}.png`,
          imageMimeType: img.mimeType,
        };

        const idx = draft.characters.findIndex(c => c.id === input.id);
        if (idx >= 0) {
          draft.characters[idx] = character;
        } else {
          draft.characters.push(character);
        }

        return { ok: true, id: input.id, name: input.name, imageUrl: character.imageUrl };
      },
    }),

    proposeAct: tool({
      description: 'Propose a story act. Acts contain scenes and define major narrative chapters.',
      inputSchema: proposeActInput,
      execute: async (input) => {
        const idx = draft.acts.findIndex(a => a.id === input.id);
        if (idx >= 0) {
          draft.acts[idx] = input;
        } else {
          draft.acts.push(input);
        }
        return { ok: true, id: input.id, title: input.title };
      },
    }),

    proposeScene: tool({
      description: 'Propose a scene within an act. Generates background image and ambient music. location must match scene id.',
      inputSchema: proposeSceneInput,
      execute: async (input) => {
        const artStyle = draft.premise?.artStyle ?? '';
        const dir = assetDir(packageId);
        await fs.mkdir(dir, { recursive: true });

        const [img, mus] = await Promise.all([
          generateSceneImage(`${artStyle}. ${input.backgroundPrompt}`),
          generateAmbientMusic(input.musicPrompts),
        ]);

        await Promise.all([
          fs.writeFile(path.join(dir, `${input.location}.png`), Buffer.from(img.base64, 'base64')),
          fs.writeFile(path.join(dir, `${input.mood}.pcm`), mus.pcmBuffer),
        ]);

        const scene: PlanDraftScene = {
          id: input.id,
          actId: input.actId,
          title: input.title,
          location: input.location,
          requiredCharacters: input.requiredCharacters,
          beats: input.beats,
          exitConditions: input.exitConditions,
          mood: input.mood,
          backgroundUrl: `/generated/${packageId}/${input.location}.png`,
          backgroundMimeType: img.mimeType,
          musicUrl: `/generated/${packageId}/${input.mood}.pcm`,
        };

        const idx = draft.scenes.findIndex(s => s.id === input.id);
        if (idx >= 0) {
          draft.scenes[idx] = scene;
        } else {
          draft.scenes.push(scene);
        }

        return {
          ok: true,
          id: input.id,
          title: input.title,
          backgroundUrl: scene.backgroundUrl,
          musicUrl: scene.musicUrl,
        };
      },
    }),

    updateElement: tool({
      description: 'Update or tweak any story element. If imagePrompt changed for a character, set regenerateImage: true to get a new portrait.',
      inputSchema: updateElementInput,
      execute: async (input) => {
        if (input.type === 'premise' && draft.premise) {
          draft.premise = { ...draft.premise, ...(input.changes as object) };
          return { ok: true, updated: 'premise' };
        }

        if (input.type === 'character' && input.id) {
          const char = draft.characters.find(c => c.id === input.id);
          if (!char) return { ok: false, error: `Character ${input.id} not found` };
          Object.assign(char, input.changes);

          if (input.regenerateImage && char.imagePrompt) {
            const artStyle = draft.premise?.artStyle ?? '';
            const img = await generateCharacterImage(`${artStyle}. ${char.imagePrompt}`);
            const dir = assetDir(packageId);
            await fs.writeFile(path.join(dir, `${input.id}.png`), Buffer.from(img.base64, 'base64'));
            char.imageUrl = `/generated/${packageId}/${input.id}.png`;
            char.imageMimeType = img.mimeType;
          }

          return { ok: true, updated: 'character', id: input.id };
        }

        if (input.type === 'act' && input.id) {
          const act = draft.acts.find(a => a.id === input.id);
          if (!act) return { ok: false, error: `Act ${input.id} not found` };
          Object.assign(act, input.changes);
          return { ok: true, updated: 'act', id: input.id };
        }

        if (input.type === 'scene' && input.id) {
          const scene = draft.scenes.find(s => s.id === input.id);
          if (!scene) return { ok: false, error: `Scene ${input.id} not found` };
          Object.assign(scene, input.changes);
          return { ok: true, updated: 'scene', id: input.id };
        }

        return { ok: false, error: 'Element not found' };
      },
    }),

    finalizePackage: tool({
      description: 'Finalize and assemble the complete VN package. Call only when the user has confirmed the story is ready. This validates, saves, and returns the playable package ID.',
      inputSchema: finalizePackageInput,
      execute: async (input) => {
        const { premise } = draft;
        if (!premise) {
          return { ok: false, error: 'No story premise defined. Call proposeStoryPremise first.' };
        }
        if (draft.acts.length === 0) {
          return { ok: false, error: 'No acts defined. Add at least one act with scenes.' };
        }

        const backgrounds: Record<string, { url: string; mimeType: string }> = {};
        const characters: Record<string, { url: string; mimeType: string }> = {};
        const music: Record<string, { url: string; mimeType: string }> = {};

        for (const scene of draft.scenes) {
          if (scene.backgroundUrl && scene.backgroundMimeType) {
            backgrounds[scene.location] = { url: scene.backgroundUrl, mimeType: scene.backgroundMimeType };
          }
          if (scene.musicUrl) {
            music[scene.mood] = { url: scene.musicUrl, mimeType: 'audio/pcm' };
          }
        }

        for (const char of draft.characters) {
          if (char.imageUrl && char.imageMimeType) {
            characters[char.id] = { url: char.imageUrl, mimeType: char.imageMimeType };
          }
        }

        const acts = draft.acts.map(act => ({
          id: act.id,
          title: act.title,
          scenes: draft.scenes
            .filter(s => s.actId === act.id)
            .map(s => ({
              id: s.id,
              title: s.title,
              location: s.location,
              requiredCharacters: s.requiredCharacters,
              beats: s.beats,
              exitConditions: s.exitConditions,
              mood: s.mood,
            })),
        }));

        const totalScenes = acts.reduce((sum, a) => sum + a.scenes.length, 0);
        const generationMs = Date.now() - session.createdAt.getTime();

        const pkg = {
          id: packageId,
          createdAt: new Date().toISOString(),
          title: premise.title,
          genre: premise.themes[0] ?? 'adventure',
          artStyle: premise.artStyle,
          language: draft.premise?.language ?? 'en',
          setting: premise.setting,
          characters: draft.characters.map(c => ({
            id: c.id,
            name: c.name,
            role: c.role,
            description: c.description,
            imagePrompt: c.imagePrompt,
          })),
          plot: {
            premise: premise.premise,
            themes: premise.themes,
            acts,
            possibleEndings: premise.possibleEndings,
          },
          assets: { backgrounds, characters, music },
          meta: {
            totalScenes,
            estimatedDuration: `${totalScenes * 5}-${totalScenes * 10} minutes`,
            generationMs,
          },
        };

        VNPackageSchema.parse(pkg);

        db.insert(vnPackages).values({
          id: pkg.id,
          createdAt: pkg.createdAt,
          title: pkg.title,
          genre: pkg.genre,
          artStyle: pkg.artStyle,
          metaJson: JSON.stringify(pkg),
          assetDir: path.join('public', 'generated', packageId),
        }).run();

        vnPackageStore.set(pkg.id, pkg);
        console.log('\n' + renderStoryTree(pkg) + '\n');

        return {
          ok: true,
          packageId: pkg.id,
          title: pkg.title,
          totalScenes,
        };
      },
    }),
  };
}

// Static tool schemas for type inference (used by createPlanningAgent)
export const planningToolSchemas = {
  proposeStoryPremise: proposeStoryPremiseInput,
  proposeCharacter: proposeCharacterInput,
  proposeAct: proposeActInput,
  proposeScene: proposeSceneInput,
  updateElement: updateElementInput,
  finalizePackage: finalizePackageInput,
};
