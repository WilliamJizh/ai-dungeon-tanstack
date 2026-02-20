import { describe, it, expect } from 'vitest';
import { resolveAsset } from '../src/lib/resolveAsset';
import type { VNPackage } from '../server/vn/types/vnTypes';

/** Minimal VNPackage fixture with a few asset entries. */
function makePack(): VNPackage {
  return {
    id: 'pkg-1',
    createdAt: '2025-01-01T00:00:00Z',
    title: 'Test',
    genre: 'noir',
    artStyle: 'pixel',
    setting: { world: 'City', era: '1940', tone: 'dark' },
    characters: [
      { id: 'det', name: 'Det', role: 'protagonist', description: 'd', imagePrompt: 'p' },
    ],
    plot: {
      premise: 'test',
      themes: [],
      acts: [
        {
          id: 'a1',
          title: 'Act 1',
          scenes: [
            {
              id: 's1',
              title: 'Scene 1',
              location: 'harbor',
              requiredCharacters: ['det'],
              beats: ['b1'],
              exitConditions: ['done'],
              mood: 'rain',
            },
          ],
        },
      ],
      possibleEndings: ['end'],
    },
    assets: {
      backgrounds: {
        'harbor-night': { url: '/generated/pkg-1/harbor-night.png', mimeType: 'image/png' },
      },
      characters: {
        detective: { url: '/generated/pkg-1/detective.png', mimeType: 'image/png' },
      },
      music: {
        'ambient-rain': { url: '/generated/pkg-1/ambient-rain.pcm', mimeType: 'audio/pcm' },
      },
    },
    meta: { totalScenes: 1, estimatedDuration: '10min', generationMs: 5000 },
  };
}

describe('resolveAsset()', () => {
  it('resolves known background key to file URL', () => {
    const pack = makePack();
    expect(resolveAsset('harbor-night', pack)).toBe('/generated/pkg-1/harbor-night.png');
  });

  it('resolves known character key to file URL', () => {
    const pack = makePack();
    expect(resolveAsset('detective', pack)).toBe('/generated/pkg-1/detective.png');
  });

  it('returns /assets/placeholder.png for unknown key', () => {
    const pack = makePack();
    expect(resolveAsset('nonexistent-key', pack)).toBe('/assets/placeholder.png');
  });

  it('returns /assets/placeholder.png for undefined key', () => {
    const pack = makePack();
    expect(resolveAsset(undefined, pack)).toBe('/assets/placeholder.png');
  });

  it('returns correct file URL format with /generated/ prefix', () => {
    const pack = makePack();
    const url = resolveAsset('harbor-night', pack);
    expect(url).toMatch(/^\/generated\//);
    expect(url).toMatch(/\.png$/);
  });

  it('handles empty AssetPack without throwing', () => {
    const pack = makePack();
    pack.assets = { backgrounds: {}, characters: {}, music: {} };
    expect(resolveAsset('anything', pack)).toBe('/assets/placeholder.png');
    expect(resolveAsset(undefined, pack)).toBe('/assets/placeholder.png');
  });
});
