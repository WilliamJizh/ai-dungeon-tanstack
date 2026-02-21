import { tool } from 'ai';
import { z } from 'zod';
import { generateAmbientMusic } from '../../lib/musicGen.js';

/**
 * Generates an ambient music track using Lyria realtime.
 * The assetId parameter becomes the key in the VNPackage.assets.music record.
 * Planning agent calls this once per mood track in the asset manifest.
 */
export const musicGenTool = tool({
  description: 'Generate ambient music track. assetId becomes the lookup key in AssetPack.music. Returns raw PCM audio.',
  parameters: z.object({
    assetId: z.string().describe('Stable ID for this music asset, e.g. "ambient-rain", "tension-chase"'),
    prompts: z.array(z.object({
      text: z.string(),
      weight: z.number(),
    })).describe('Weighted prompts describing the desired music mood and style'),
    durationSeconds: z.number().min(5).max(30).default(15).describe('Duration of the generated track in seconds'),
    bpm: z.number().optional().describe('Beats per minute (60-200)'),
  }),
  execute: async ({ assetId, prompts, durationSeconds, bpm }) => {
    const result = await generateAmbientMusic(prompts, { durationSeconds, bpm });
    return {
      assetId,
      pcmBuffer: result.pcmBuffer.toString('base64'),
      sampleRate: result.sampleRate,
      channels: result.channels,
      durationMs: result.durationMs,
    };
  },
});
