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
  globalContext: z.object({
    setting: z.string().describe('World/universe description'),
    tone: z.string().describe('Emotional tone (e.g. "gritty noir", "hopeful sci-fi")'),
    overarchingTruths: z.array(z.string()).describe('The hidden mechanics, secrets, or fundamental truths about this world that will be slowly revealed across the narrative')
  }),
  premise: z.string().describe('1-2 sentence story premise'),
  themes: z.array(z.string()).describe('Core themes (e.g. ["identity", "redemption"])'),
  globalMaterials: z.array(z.string()).describe('Reusable narrative anchors (items, NPC encounters, motifs)'),
  globalWorldInfo: z.array(z.object({
    id: z.string(),
    keys: z.array(z.string()),
    content: z.string(),
    type: z.enum(['lore', 'entity', 'atmosphere']),
  })).optional().describe('Keyword-triggered lore that applies across the entire story'),
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
  id: z.string().describe('Unique slug for the Act (e.g., "act_1_setup")'),
  title: z.string().describe('Title of the Act'),
  objective: z.string().describe('The core objective the player is trying to achieve in this Act'),
  scenarioContext: z.string().describe('The hidden truth for this Act. This is the secret the DM leverages to control tone and pacing.'),
  narrativeGuidelines: z.string().describe('Stylistic rules for this specific Act (e.g., "Keep it a mundane mystery for now, do not reveal the monsters yet")'),
  intendedLocations: z.array(z.string()).min(1).describe('Unique slugs for the sandbox Locations in this act. E.g., ["loc_loading_dock", "loc_server_room", "loc_basement"]'),
  inevitableEvents: z.array(z.object({
    id: z.string(),
    title: z.string(),
    triggerCondition: z.string().describe('When this event should trigger (e.g., "After 5 turns in the mansion")'),
    description: z.string().describe('The narrative event that occurs'),
    forcesClimax: z.boolean().describe('If true, this event serves as the climax boundary (Plot Point) for the current Act'),
    conditionalBranches: z.array(z.object({
      condition: z.string(),
      effect: z.string()
    })).optional()
  })).optional().describe('Predetermined events that push the plot forward, capping off the Act pacing.'),
  scenarioWorldInfo: z.array(z.object({
    id: z.string(),
    keys: z.array(z.string()),
    content: z.string(),
    type: z.enum(['lore', 'entity', 'atmosphere']),
  })).optional().describe('Keyword-triggered lore specific to this Act'),
});

// ─── draftNodeWeb ───────────────────────────────────────────────────────────

const draftNodeWebInput = z.object({
  actId: z.string().describe('The Act ID these locations belong to'),
  locations: z.array(z.object({
    id: z.string().describe('The Location ID (must match one of the intendedLocations from the Act outline)'),
    title: z.string().describe('The Title of the location'),
    location: z.string().describe('Asset key for background image — must equal this location id'),
    requiredCharacters: z.array(z.string()).describe('Character IDs that appear in this location'),
    ambientDetail: z.string().describe('Atmospheric detail for this location'),
    mood: z.string().describe('Asset key for music — slug like "tension-theme" or "hope-theme"'),
    callbacks: z.array(z.string()).optional().describe('Instructions for the DM to re-use globalMaterials or reference past emotional states'),
    connections: z.array(z.string()).describe('Valid Location IDs the player can move to from here, creating a spatial sandbox'),
  })).min(1).describe('The fully connected sandbox of locations for this act.'),
});

// ─── draftNodeBeats ─────────────────────────────────────────────────────────

const draftNodeBeatsInput = z.object({
  actId: z.string().describe('The ID of the Act containing the location'),
  nodeId: z.string().describe('The ID of the location to populate beats for (still called nodeId for legacy compat)'),
  beats: z.array(z.object({
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
      description: 'Step 1 of Act generation. Propose the overarching Act objective, contextual secrets, world info, inevitable events, and register empty placeholder sandbox locations.',
      inputSchema: draftActOutlineInput,
      execute: async (input) => {
        const actIndex = draft.acts.findIndex(a => a.id === input.id);
        const act = {
          id: input.id,
          title: input.title,
          objective: input.objective,
          scenarioContext: input.scenarioContext,
          narrativeGuidelines: input.narrativeGuidelines,
          inevitableEvents: input.inevitableEvents,
          scenarioWorldInfo: input.scenarioWorldInfo,
          nodes: input.intendedLocations.map(locationId => ({
            id: locationId,
            title: '',
            location: '',
            requiredCharacters: [],
            ambientDetail: '',
            beats: [],
            connections: [],
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
      description: 'Step 2 of Act generation. Flesh out the sandbox locations. MUST provide valid structural connections to other locations within the Act.',
      inputSchema: draftNodeWebInput,
      execute: async (input) => {
        const act = draft.acts.find(a => a.id === input.actId);
        if (!act) return { ok: false, error: `Act ${input.actId} not found.` };

        for (const outline of input.locations) {
          const nodeIndex = act.nodes.findIndex((n: any) => n.id === outline.id);
          if (nodeIndex >= 0) {
            act.nodes[nodeIndex] = { ...act.nodes[nodeIndex], ...outline, beats: act.nodes[nodeIndex].beats || [] } as any;
          } else {
            act.nodes.push({ ...outline, beats: [] } as any);
          }
        }
        return { ok: true, updatedLocations: input.locations.length };
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
          scenarioContext: a.scenarioContext ?? '',
          narrativeGuidelines: a.narrativeGuidelines ?? '',
          inevitableEvents: a.inevitableEvents?.map(e => ({
            ...e,
            forcesClimax: e.forcesClimax ?? false
          })),
          scenarioWorldInfo: a.scenarioWorldInfo,
          sandboxLocations: a.nodes.map(n => ({
            id: n.id,
            title: n.title,
            location: n.location,
            requiredCharacters: n.requiredCharacters,
            ambientDetail: n.ambientDetail,
            beats: n.beats.map(b => ({
              description: b.description,
              pacing: b.pacing,
              findings: b.findings,
              interactables: b.interactables,
              potentialFlags: b.potentialFlags,
              foreshadowing: b.foreshadowing
            })),
            callbacks: n.callbacks,
            connections: n.connections,
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
            globalContext: premise.globalContext,
            globalMaterials: premise.globalMaterials,
            globalWorldInfo: premise.globalWorldInfo,
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
