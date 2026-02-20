import { describe, it, expect } from 'vitest';
import { VNPackageSchema } from '../server/vn/types/vnTypes';

/** Minimal valid VNPackage fixture for reuse across tests. */
function makeValidPackage(overrides?: Record<string, unknown>) {
  return {
    id: 'pkg-1',
    createdAt: '2025-01-01T00:00:00Z',
    title: 'Noir Detective',
    genre: 'noir',
    artStyle: 'pixel-art',
    setting: { world: 'San Francisco', era: '1940s', tone: 'dark' },
    characters: [
      {
        id: 'detective',
        name: 'Sam Marlowe',
        role: 'protagonist',
        description: 'A hardboiled detective',
        imagePrompt: 'pixel art detective in trenchcoat',
      },
    ],
    plot: {
      premise: 'A detective investigates a mysterious disappearance.',
      themes: ['betrayal', 'redemption'],
      acts: [
        {
          id: 'act-1',
          title: 'The Old City',
          scenes: [
            {
              id: 'scene-1',
              title: 'Harbor Night',
              location: 'harbor-night',
              requiredCharacters: ['detective'],
              beats: ['Arrive at docks', 'Find clue'],
              exitConditions: ['find body on the pier'],
              mood: 'ambient-rain',
            },
          ],
        },
      ],
      possibleEndings: ['The detective solves the case'],
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
    meta: { totalScenes: 1, estimatedDuration: '15min', generationMs: 45000 },
    ...overrides,
  };
}

describe('VNPackage schema', () => {
  it('validates complete VNPackage with all fields', () => {
    const result = VNPackageSchema.safeParse(makeValidPackage());
    expect(result.success).toBe(true);
  });

  it('requires at least one act with one scene', () => {
    const result = VNPackageSchema.safeParse(
      makeValidPackage({
        plot: {
          premise: 'Test',
          themes: [],
          acts: [],
          possibleEndings: ['end'],
        },
      }),
    );
    expect(result.success).toBe(false);
  });

  it('requires at least one character', () => {
    const result = VNPackageSchema.safeParse(
      makeValidPackage({ characters: [] }),
    );
    expect(result.success).toBe(false);
  });

  it('validates AssetPack with empty records (valid empty state)', () => {
    const result = VNPackageSchema.safeParse(
      makeValidPackage({
        assets: { backgrounds: {}, characters: {}, music: {} },
      }),
    );
    expect(result.success).toBe(true);
  });

  it('validates Character roles as enum', () => {
    // Valid roles
    for (const role of ['protagonist', 'ally', 'antagonist', 'npc']) {
      const result = VNPackageSchema.safeParse(
        makeValidPackage({
          characters: [
            { id: 'c1', name: 'Test', role, description: 'test', imagePrompt: 'test' },
          ],
        }),
      );
      expect(result.success).toBe(true);
    }
    // Invalid role
    const result = VNPackageSchema.safeParse(
      makeValidPackage({
        characters: [
          { id: 'c1', name: 'Test', role: 'villain', description: 'test', imagePrompt: 'test' },
        ],
      }),
    );
    expect(result.success).toBe(false);
  });

  it('validates SceneDefinition.exitConditions is non-empty array', () => {
    const result = VNPackageSchema.safeParse(
      makeValidPackage({
        plot: {
          premise: 'Test',
          themes: [],
          acts: [
            {
              id: 'act-1',
              title: 'Act 1',
              scenes: [
                {
                  id: 'scene-1',
                  title: 'Scene 1',
                  location: 'loc',
                  requiredCharacters: [],
                  beats: ['beat1'],
                  exitConditions: [], // empty — should fail
                  mood: 'calm',
                },
              ],
            },
          ],
          possibleEndings: ['end'],
        },
      }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects package with missing plot.possibleEndings', () => {
    const result = VNPackageSchema.safeParse(
      makeValidPackage({
        plot: {
          premise: 'Test',
          themes: [],
          acts: [
            {
              id: 'act-1',
              title: 'Act 1',
              scenes: [
                {
                  id: 'scene-1',
                  title: 'Scene 1',
                  location: 'loc',
                  requiredCharacters: [],
                  beats: ['beat1'],
                  exitConditions: ['done'],
                  mood: 'calm',
                },
              ],
            },
          ],
          possibleEndings: [], // empty — should fail (min 1)
        },
      }),
    );
    expect(result.success).toBe(false);
  });
});
