import { tool } from 'ai';
import { z } from 'zod';
import { generateSceneImage, generateCharacterImage } from '../../agents/imageAgent.js';

/**
 * Generates a background scene or character portrait using Gemini image generation.
 * The assetId parameter becomes the key in the VNPackage.assets record.
 * Planning agent calls this once per background and character in the asset manifest.
 */
export const imageGenTool = tool({
  description: 'Generate a scene background or character portrait. assetId becomes the lookup key in the VNPackage asset pack.',
  parameters: z.object({
    assetId: z.string().describe('Stable ID for this asset, used as the lookup key in AssetPack'),
    prompt: z.string().describe('Image generation prompt (art style will be prepended by the agent)'),
    type: z.enum(['scene', 'character']).describe('scene = 16:9 background, character = portrait with transparent background'),
    aspectRatio: z.enum(['16:9', '1:1', '4:3', '3:4']).default('16:9'),
  }),
  execute: async ({ assetId, prompt, type, aspectRatio }) => {
    const result = type === 'character'
      ? await generateCharacterImage(prompt, aspectRatio as '1:1' | '4:3' | '3:4')
      : await generateSceneImage(prompt, { aspectRatio });

    return {
      assetId,
      base64: result.base64,
      mimeType: result.mimeType,
      durationMs: result.durationMs,
    };
  },
});
