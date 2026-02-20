import { describe, it, expect } from 'vitest';
import { VNPackageSchema, SUPPORTED_LANGUAGES } from '../server/vn/types/vnTypes';

const BASE_PKG = {
  id: 'test-lang-1',
  createdAt: new Date().toISOString(),
  title: 'Language Test',
  genre: 'noir',
  artStyle: 'dark atmospheric',
  setting: { world: 'Neo-Tokyo', era: '2077', tone: 'noir' },
  characters: [{
    id: 'hero', name: 'Hero', role: 'protagonist' as const,
    description: 'The protagonist', imagePrompt: '',
  }],
  plot: {
    premise: 'A story',
    themes: ['mystery'],
    acts: [{ id: 'act1', title: 'Act I', scenes: [{
      id: 'scene1', title: 'Opening', location: 'scene1',
      requiredCharacters: ['hero'], beats: ['intro'],
      exitConditions: ['resolve'], mood: 'ambient',
    }]}],
    possibleEndings: ['good ending'],
  },
  assets: { backgrounds: {}, characters: {}, music: {} },
  meta: { totalScenes: 1, estimatedDuration: '5 min', generationMs: 0 },
};

describe('VNPackage language field', () => {
  it('accepts language: "en"', () => {
    const result = VNPackageSchema.safeParse({ ...BASE_PKG, language: 'en' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.language).toBe('en');
  });

  it('accepts language: "zh-CN"', () => {
    const result = VNPackageSchema.safeParse({ ...BASE_PKG, language: 'zh-CN' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.language).toBe('zh-CN');
  });

  it('defaults language to "en" when omitted', () => {
    const { language: _, ...pkgWithoutLang } = BASE_PKG as any;
    const result = VNPackageSchema.safeParse(pkgWithoutLang);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.language).toBe('en');
  });

  it('accepts any string for language (open-ended)', () => {
    const result = VNPackageSchema.safeParse({ ...BASE_PKG, language: 'ja' });
    expect(result.success).toBe(true);
  });

  it('SUPPORTED_LANGUAGES contains en and zh-CN', () => {
    expect(SUPPORTED_LANGUAGES).toHaveProperty('en');
    expect(SUPPORTED_LANGUAGES).toHaveProperty('zh-CN');
    expect(SUPPORTED_LANGUAGES['en']).toBe('English');
    expect(SUPPORTED_LANGUAGES['zh-CN']).toBe('中文（简体）');
  });
});
