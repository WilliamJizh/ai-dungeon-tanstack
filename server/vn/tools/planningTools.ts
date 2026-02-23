import { tool } from 'ai';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';
import { generateSceneImage, generateCharacterImage } from '../../lib/imageGen.js';
import { generateAmbientMusic, pcmToWav } from '../../lib/musicGen.js';
import { VNPackageSchema } from '../types/vnTypes.js';
import { db } from '../../db/index.js';
import { vnPackages } from '../../db/schema.js';
import { vnPackageStore } from '../state/vnPackageStore.js';
import { renderStoryTree } from '../utils/storyVisualizer.js';
import type { PlanSession, PlanDraftCharacter } from '../state/planSessionStore.js';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function assetDir(packageId: string) {
  return path.join(__dirname, '..', '..', '..', 'public', 'generated', packageId);
}

function dataUrlToBase64(dataUrl: string): { base64: string; mimeType: string } {
  const [prefix, base64] = dataUrl.split(',');
  const mimeType = prefix.split(':')[1].split(';')[0];
  return { base64, mimeType };
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
  globalMaterials: z.array(z.string()).describe('List of reusable narrative anchors (motifs, character traits, NPC encounters, physical items) to be seeded by the DM'),
  possibleEndings: z.array(z.string()).min(1).describe('2-3 broad ending categories (e.g. "Bittersweet Victory", "Total Failure")'),
});

// ─── proposeCharacter ────────────────────────────────────────────────────────

const proposeCharacterInput = z.object({
  id: z.string().describe('Unique slug for this character, e.g. "kira_voss". Must also be used as asset key.'),
  name: z.string(),
  role: z.enum(['protagonist', 'ally', 'antagonist', 'npc']),
  description: z.string().describe('Personality, backstory, motivations'),
  imagePrompt: z.string().describe('Detailed visual prompt for character portrait generation'),
});

// ─── draftActOutline ────────────────────────────────────────────────────────

const draftActOutlineInput = z.object({
  id: z.string().describe('Unique slug for the Act (e.g., "act_1_sern")'),
  title: z.string().describe('Title of the Act'),
  objective: z.string().describe('The core objective the player is trying to achieve in this Act'),
  intendedNodes: z.array(z.string()).min(1).describe('An array of unique slugs for the Nodes that will make up this Act. E.g., ["node_loading_dock", "node_server_room"]'),
});

// ─── draftNodeWeb ───────────────────────────────────────────────────────────

const draftNodeWebInput = z.object({
  actId: z.string().describe('The Act ID these nodes belong to'),
  nodes: z.array(z.object({
    id: z.string().describe('The Node ID (must match one of the intendedNodes from the Act outline)'),
    title: z.string().describe('The Title of the node'),
    location: z.string().describe('Asset key for background image — must equal this node id'),
    requiredCharacters: z.array(z.string()).describe('Character IDs that appear in this node'),
    mood: z.string().describe('Asset key for music — slug like "tension-theme" or "hope-theme"'),
    callbacks: z.array(z.string()).optional().describe('Instructions for the DM to re-use globalMaterials or reference past emotional states'),
    exitConditions: z.array(z.object({
      condition: z.string().describe('Player action or state required to take this exit. E.g. "Player gives the artifact to the cult"'),
      nextNodeId: z.string().optional().describe('The ID of the next Node to transition to. Use an empty string or omit to end the game only if it is the absolute final act. MUST include fail-forward consequence nodes instead of game overs.'),
    })).min(1).describe('Networked connections to other nodes.'),
  })).min(1).describe('The fully connected web of nodes for this act.'),
});

// ─── draftNodeBeats ─────────────────────────────────────────────────────────

const draftNodeBeatsInput = z.object({
  actId: z.string().describe('The ID of the Act containing the node'),
  nodeId: z.string().describe('The ID of the node to populate beats for'),
  beats: z.array(z.object({
    description: z.string().describe('The core narrative action or event of this beat'),
    pacing: z.string().describe('Instructions for the DM on how long the beat should last (e.g., "5-8 frames of rapid back-and-forth dialogue")'),
    findings: z.array(z.string()).optional().describe('Specific clues uncovered during this exact beat'),
    interactables: z.array(z.string()).optional().describe('Items relevant or discoverable in this exact beat'),
    foreshadowing: z.string().optional().describe('Subtle hints to lay the groundwork for future beats, allowing the DM to build tension'),
    objective: z.string().optional().describe('The specific goal the player must accomplish to successfully complete this beat'),
    nextBeatIfFailed: z.string().optional().describe('Allows dynamic early exits or branching within a node if the player fails the objective or rolls a Miss'),
  })).min(1).describe('Ordered narrative beats guiding the storyteller agent'),
});

// ─── finalizeNode ────────────────────────────────────────────────────────────

const finalizeNodeInput = z.object({
  actId: z.string().describe('The Act ID'),
  nodeId: z.string().describe('The ID of the node to finalize and generate assets for'),
  backgroundPrompt: z.string().describe('Visual prompt for background image generation'),
  musicPrompts: z.array(z.object({
    text: z.string(),
    weight: z.number(),
  })).describe('Weighted prompts for ambient music generation'),
});

// ─── updateElement ───────────────────────────────────────────────────────────

const updateElementInput = z.object({
  type: z.enum(['premise', 'character', 'act', 'node']),
  actId: z.string().optional().describe('Required if updating a node'),
  id: z.string().optional().describe('Required for character, node — not needed for premise'),
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
        let imageUrl = `/generated/${packageId}/${input.id}.png`;
        let imageMimeType = 'image/png';

        if (!session.bypassAssets) {
          const artStyle = draft.premise?.artStyle ?? '';
          const latestRef = draft.referenceImages.at(-1);
          const refOpts = latestRef ? dataUrlToBase64(latestRef.url) : undefined;
          const img = await generateCharacterImage(`${artStyle}. ${input.imagePrompt}`, {
            ...(refOpts ? { referenceImageB64: refOpts.base64, referenceImageMimeType: refOpts.mimeType } : {}),
          });
          const dir = assetDir(packageId);
          await fs.mkdir(dir, { recursive: true });
          await fs.writeFile(path.join(dir, `${input.id}.png`), Buffer.from(img.base64, 'base64'));
          imageMimeType = img.mimeType;
        }

        const character: PlanDraftCharacter = {
          ...input,
          imageUrl,
          imageMimeType,
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

    draftActOutline: tool({
      description: 'Step 1 of Act generation. Propose the overarching Act objective and register empty placeholder Nodes.',
      inputSchema: draftActOutlineInput,
      execute: async (input) => {
        const actIndex = draft.acts.findIndex(a => a.id === input.id);
        const act = {
          id: input.id,
          title: input.title,
          objective: input.objective,
          nodes: input.intendedNodes.map(nodeId => ({
            id: nodeId,
            title: '',
            location: '',
            requiredCharacters: [],
            beats: [],
            exitConditions: [],
            mood: '',
          }))
        };

        if (actIndex >= 0) {
          draft.acts[actIndex] = act;
        } else {
          draft.acts.push(act);
        }
        return { ok: true, id: input.id, title: input.title };
      },
    }),

    draftNodeWeb: tool({
      description: 'Step 2 of Act generation. Wire the placeholder Nodes together into a graph using exitConditions. MUST include fail-forward consequence nodes.',
      inputSchema: draftNodeWebInput,
      execute: async (input) => {
        const act = draft.acts.find(a => a.id === input.actId);
        if (!act) return { ok: false, error: `Act ${input.actId} not found.` };

        for (const outline of input.nodes) {
          const nodeIndex = act.nodes.findIndex(n => n.id === outline.id);
          if (nodeIndex >= 0) {
            act.nodes[nodeIndex] = { ...act.nodes[nodeIndex], ...outline, beats: act.nodes[nodeIndex].beats || [] };
          } else {
            act.nodes.push({ ...outline, beats: [] });
          }
        }
        return { ok: true, updatedNodes: input.nodes.length };
      },
    }),

    draftNodeBeats: tool({
      description: 'Step 2 of Node generation. Given a drafted node outline, flesh out the detailed Beat objects, including pacing rules, hidden findings, and objectives.',
      inputSchema: draftNodeBeatsInput,
      execute: async (input) => {
        const act = draft.acts.find(a => a.id === input.actId);
        if (!act) return { ok: false, error: `Act ${input.actId} not found.` };

        const node = act.nodes.find(n => n.id === input.nodeId);
        if (!node) return { ok: false, error: `Node outline ${input.nodeId} not found. Call draftNodeOutline first.` };

        node.beats = input.beats;
        return { ok: true, updated: input.nodeId, beatCount: input.beats.length };
      },
    }),

    finalizeNode: tool({
      description: 'Step 3 of Node generation. Finalize the node and generate its background image and ambient music. location must match node id.',
      inputSchema: finalizeNodeInput,
      execute: async (input) => {
        const act = draft.acts.find(a => a.id === input.actId);
        if (!act) return { ok: false, error: `Act ${input.actId} not found.` };

        const node = act.nodes.find(n => n.id === input.nodeId);
        if (!node) return { ok: false, error: `Node ${input.nodeId} not found.` };
        if (node.beats.length === 0) return { ok: false, error: `Node ${input.nodeId} has no beats. Call draftNodeBeats first.` };

        let backgroundMimeType = 'image/png';
        const backgroundUrl = `/generated/${packageId}/${node.location}.png`;
        const musicUrl = `/generated/${packageId}/${node.mood}.wav`;

        if (!session.bypassAssets) {
          const artStyle = draft.premise?.artStyle ?? '';
          const dir = assetDir(packageId);
          await fs.mkdir(dir, { recursive: true });

          const latestRef = draft.referenceImages.at(-1);
          const refOpts = latestRef ? dataUrlToBase64(latestRef.url) : undefined;
          const [img, mus] = await Promise.all([
            generateSceneImage(`${artStyle}. ${input.backgroundPrompt}`, {
              ...(refOpts ? { referenceImageB64: refOpts.base64, referenceImageMimeType: refOpts.mimeType } : {}),
            }),
            generateAmbientMusic(input.musicPrompts),
          ]);

          await Promise.all([
            fs.writeFile(path.join(dir, `${node.location}.png`), Buffer.from(img.base64, 'base64')),
            fs.writeFile(path.join(dir, `${node.mood}.wav`), pcmToWav(mus.pcmBuffer)),
          ]);
          backgroundMimeType = img.mimeType;
        }

        node.backgroundUrl = backgroundUrl;
        node.backgroundMimeType = backgroundMimeType;
        node.musicUrl = musicUrl;

        return {
          ok: true,
          id: node.id,
          title: node.title,
          backgroundUrl: node.backgroundUrl,
          musicUrl: node.musicUrl,
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
            char.imageUrl = `/generated/${packageId}/${input.id}.png`;
            char.imageMimeType = 'image/png';
            if (!session.bypassAssets) {
              const artStyle = draft.premise?.artStyle ?? '';
              const img = await generateCharacterImage(`${artStyle}. ${char.imagePrompt}`);
              const dir = assetDir(packageId);
              await fs.mkdir(dir, { recursive: true });
              await fs.writeFile(path.join(dir, `${input.id}.png`), Buffer.from(img.base64, 'base64'));
              char.imageMimeType = img.mimeType;
            }
          }

          return { ok: true, updated: 'character', id: input.id };
        }

        if (input.type === 'act' && input.id) {
          const act = draft.acts.find(a => a.id === input.id);
          if (!act) return { ok: false, error: `Act ${input.id} not found` };
          Object.assign(act, input.changes);
          return { ok: true, updated: 'act', id: input.id };
        }

        if (input.type === 'node' && input.id && input.actId) {
          const act = draft.acts.find(a => a.id === input.actId);
          if (!act) return { ok: false, error: `Act ${input.actId} not found` };
          const node = act.nodes.find(n => n.id === input.id);
          if (!node) return { ok: false, error: `Node ${input.id} not found` };
          Object.assign(node, input.changes);
          return { ok: true, updated: 'node', id: input.id };
        }

        return { ok: false, error: 'Element not found' };
      },
    }),

    finalizePackage: tool({
      description: 'Finalize and assemble the complete VN package. Call only when the user has confirmed the story is ready. This validates, saves, and returns the playable package ID.',
      inputSchema: finalizePackageInput,
      execute: async () => {
        const { premise } = draft;
        if (!premise) {
          return { ok: false, error: 'No story premise defined. Call proposeStoryPremise first.' };
        }
        if (draft.acts.length === 0) {
          return { ok: false, error: 'No acts defined. Add at least one act with nodes.' };
        }

        const backgrounds: Record<string, { url: string; mimeType: string }> = {};
        const characters: Record<string, { url: string; mimeType: string }> = {};
        const music: Record<string, { url: string; mimeType: string }> = {};

        let totalNodes = 0;

        for (const act of draft.acts) {
          for (const node of act.nodes) {
            totalNodes++;
            if (node.backgroundUrl && node.backgroundMimeType) {
              backgrounds[node.location] = { url: node.backgroundUrl, mimeType: node.backgroundMimeType };
            }
            if (node.musicUrl) {
              music[node.mood] = { url: node.musicUrl, mimeType: 'audio/wav' };
            }
          }
        }

        for (const char of draft.characters) {
          if (char.imageUrl && char.imageMimeType) {
            characters[char.id] = { url: char.imageUrl, mimeType: char.imageMimeType };
          }
        }

        const acts = draft.acts.map(a => ({
          id: a.id,
          title: a.title,
          objective: a.objective,
          nodes: a.nodes.map(n => ({
            id: n.id,
            title: n.title,
            location: n.location,
            requiredCharacters: n.requiredCharacters,
            beats: n.beats,
            callbacks: n.callbacks,
            exitConditions: n.exitConditions,
            mood: n.mood,
          })),
        }));

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
            globalMaterials: premise.globalMaterials,
            acts,
            possibleEndings: premise.possibleEndings,
          },
          assets: { backgrounds, characters, music },
          meta: {
            totalNodes,
            estimatedDuration: `${totalNodes * 5}-${totalNodes * 10} minutes`,
            generationMs,
          },
        };

        VNPackageSchema.parse(pkg);

        // Store the full package as JSON alongside the assets
        const dir = assetDir(packageId);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, 'story.json'), JSON.stringify(pkg, null, 2));

        const existing = db.select().from(vnPackages).where(eq(vnPackages.id, pkg.id)).get();
        if (existing) {
          db.update(vnPackages).set({
            title: pkg.title,
            genre: pkg.genre,
            artStyle: pkg.artStyle,
            metaJson: JSON.stringify(pkg),
          }).where(eq(vnPackages.id, pkg.id)).run();
        } else {
          db.insert(vnPackages).values({
            id: pkg.id,
            createdAt: pkg.createdAt,
            title: pkg.title,
            genre: pkg.genre,
            artStyle: pkg.artStyle,
            metaJson: JSON.stringify(pkg),
            assetDir: path.join('public', 'generated', packageId),
          }).run();
        }

        vnPackageStore.set(pkg.id, pkg);
        console.log('\n' + renderStoryTree(pkg) + '\n');

        return {
          ok: true,
          packageId: pkg.id,
          title: pkg.title,
          totalNodes,
        };
      },
    }),
  };
}

// Static tool schemas for type inference (used by createPlanningAgent)
export const planningToolSchemas = {
  proposeStoryPremise: proposeStoryPremiseInput,
  proposeCharacter: proposeCharacterInput,
  draftActOutline: draftActOutlineInput,
  draftNodeWeb: draftNodeWebInput,
  draftNodeBeats: draftNodeBeatsInput,
  finalizeNode: finalizeNodeInput,
  updateElement: updateElementInput,
  finalizePackage: finalizePackageInput,
};
