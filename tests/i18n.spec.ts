import { describe, it, expect } from 'vitest';
import { t } from '../src/lib/i18n';

describe('i18n translations', () => {
  it('returns English strings by default', () => {
    expect(t('success')).toBe('SUCCESS');
    expect(t('failure')).toBe('FAILURE');
    expect(t('continue_hint')).toBe('SPACE / CLICK TO CONTINUE');
  });

  it('returns English strings for locale en', () => {
    expect(t('success', 'en')).toBe('SUCCESS');
    expect(t('failure', 'en')).toBe('FAILURE');
    expect(t('inventory_title', 'en')).toBe('[ INVENTORY ]');
    expect(t('map_title', 'en')).toBe('[ WORLD MAP ]');
    expect(t('dc_label', 'en')).toBe('DC');
    expect(t('check_label', 'en')).toBe('CHECK');
    expect(t('retreat', 'en')).toBe('[ESC]  RETREAT');
  });

  it('returns Chinese strings for locale zh-CN', () => {
    expect(t('success', 'zh-CN')).toBe('成功');
    expect(t('failure', 'zh-CN')).toBe('失败');
    expect(t('inventory_title', 'zh-CN')).toBe('[ 物品栏 ]');
    expect(t('map_title', 'zh-CN')).toBe('[ 世界地图 ]');
    expect(t('dc_label', 'zh-CN')).toBe('难度');
    expect(t('check_label', 'zh-CN')).toBe('检定');
    expect(t('continue_hint', 'zh-CN')).toBe('按空格 / 点击继续');
    expect(t('select_destination', 'zh-CN')).toBe('选择目的地');
    expect(t('retreat', 'zh-CN')).toBe('[ESC]  撤退');
  });

  it('falls back to English for unknown locale', () => {
    expect(t('success', 'fr' as any)).toBe('SUCCESS');
    expect(t('failure', 'ja' as any)).toBe('FAILURE');
  });

  it('falls back to key string for unknown translation key', () => {
    expect(t('nonexistent_key_xyz', 'en')).toBe('nonexistent_key_xyz');
    expect(t('nonexistent_key_xyz', 'zh-CN')).toBe('nonexistent_key_xyz');
  });
});
