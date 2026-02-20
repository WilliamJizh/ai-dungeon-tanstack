import { describe, expect, it } from 'vitest';
import { frameBuilderTool } from '../server/vn/tools/frameBuilderTool.js';

async function executeFrameBuilder(input: unknown) {
  const execute = (frameBuilderTool as { execute?: (payload: unknown) => Promise<unknown> }).execute;
  expect(execute).toBeTypeOf('function');
  return await execute!(input);
}

describe('frameBuilderTool', () => {
  it('accepts canonical frame payloads', async () => {
    const result = await executeFrameBuilder({
      id: 'frame-canonical-1',
      type: 'full-screen',
      panels: [{ id: 'center', backgroundAsset: 'bg_cockpit' }],
      narration: { text: 'Life support is failing.' },
    }) as { ok: boolean; frame?: { id: string } };

    expect(result.ok).toBe(true);
    expect(result.frame?.id).toBe('frame-canonical-1');
  });

  it('normalizes wrapped legacy payloads under frame', async () => {
    const result = await executeFrameBuilder({
      frame: {
        id: 'frame-legacy-1',
        type: 'dialogue',
        background: 'bg_cockpit',
        panels: [
          { position: 'left', assetKey: 'char_jax_neutral', weight: 62, dim: false },
          { position: 'right', assetKey: 'char_echo_flicker', weight: 38, dim: true },
        ],
        dialogue: {
          speaker: 'Jax',
          text: 'Patch it through.',
        },
      },
    }) as {
      ok: boolean;
      frame?: {
        panels: Array<{ id: string; characterAsset?: string; panelWeight?: number; dimmed?: boolean }>;
        dialogue?: { targetPanel?: string; text: string };
      };
    };

    expect(result.ok).toBe(true);
    expect(result.frame?.panels[0]?.id).toBe('left');
    expect(result.frame?.panels[0]?.characterAsset).toBe('char_jax_neutral');
    expect(result.frame?.panels[0]?.panelWeight).toBe(62);
    expect(result.frame?.panels[1]?.dimmed).toBe(true);
    expect(result.frame?.dialogue?.text).toBe('Patch it through.');
    expect(['left', 'right', 'center']).toContain(result.frame?.dialogue?.targetPanel);
  });

  it('maps legacy effects object and music key', async () => {
    const result = await executeFrameBuilder({
      id: 'frame-legacy-2',
      type: 'full-screen',
      background: 'bg_station_hangar',
      panels: [{ position: 'center' }],
      narration: { text: 'The station groans under stress.' },
      effects: { shake: true, flash: true },
      music: 'track_oversight_march',
    }) as {
      ok: boolean;
      frame?: {
        effects?: Array<{ type: string }>;
        audio?: { musicAsset?: string };
      };
    };

    expect(result.ok).toBe(true);
    expect(result.frame?.effects?.map((effect) => effect.type)).toEqual(['shake', 'flash']);
    expect(result.frame?.audio?.musicAsset).toBe('track_oversight_march');
  });

  it('fills narration for silent story frames and avoids bg key as character asset', async () => {
    const result = await executeFrameBuilder({
      id: 'frame-legacy-3',
      type: 'full-screen',
      panels: [{ position: 'center', assetKey: 'bg_cockpit' }],
      background: 'bg_cockpit',
    }) as {
      ok: boolean;
      frame?: {
        panels: Array<{ backgroundAsset?: string; characterAsset?: string }>;
        narration?: { text: string };
      };
    };

    expect(result.ok).toBe(true);
    expect(result.frame?.panels[0]?.backgroundAsset).toBe('bg_cockpit');
    expect(result.frame?.panels[0]?.characterAsset).toBeUndefined();
    expect(result.frame?.narration?.text).toBe('...');
  });
});
