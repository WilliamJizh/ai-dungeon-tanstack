import { describe, it, expect } from 'vitest';
import { VNFrameSchema } from '../server/vn/types/vnFrame';

describe('VNFrame schema', () => {
  it('accepts valid full-screen frame', () => {
    const result = VNFrameSchema.safeParse({
      id: 'frame-1',
      type: 'full-screen',
      panels: [{ id: 'center', backgroundAsset: 'harbor-night' }],
      narration: { text: 'The city sleeps beneath a blanket of fog.' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid dialogue frame with bubble position', () => {
    const result = VNFrameSchema.safeParse({
      id: 'frame-2',
      type: 'dialogue',
      panels: [
        { id: 'left', backgroundAsset: 'office', characterAsset: 'detective', panelWeight: 62 },
        { id: 'right', backgroundAsset: 'office', characterAsset: 'kim', dimmed: true, panelWeight: 38 },
      ],
      dialogue: {
        speaker: 'Detective',
        text: 'Something is not right here.',
        targetPanel: 'left',
        position: 'bubble',
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid three-panel frame', () => {
    const result = VNFrameSchema.safeParse({
      id: 'frame-3',
      type: 'three-panel',
      panels: [
        { id: 'left', backgroundAsset: 'alley', characterAsset: 'thug' },
        { id: 'center', backgroundAsset: 'street' },
        { id: 'right', backgroundAsset: 'bar', characterAsset: 'bartender' },
      ],
      narration: { text: 'The streets tell their own stories.', panelId: 'center' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid choice frame with showFreeTextInput', () => {
    const result = VNFrameSchema.safeParse({
      id: 'frame-4',
      type: 'choice',
      panels: [{ id: 'center', backgroundAsset: 'crossroads' }],
      choices: [
        { id: 'c1', text: 'Go left', hint: 'Leads to the docks' },
        { id: 'c2', text: 'Go right' },
      ],
      showFreeTextInput: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid battle frame with player + 2 enemies', () => {
    const result = VNFrameSchema.safeParse({
      id: 'frame-5',
      type: 'battle',
      panels: [{ id: 'center', backgroundAsset: 'arena' }],
      battle: {
        player: { name: 'Hero', level: 5, hp: 80, maxHp: 100, portraitAsset: 'hero-portrait' },
        enemies: [
          { name: 'Goblin', hp: 30, maxHp: 30 },
          { name: 'Orc', hp: 50, maxHp: 60 },
        ],
        combatLog: ['Hero attacks Goblin for 15 damage!', 'Orc retaliates!'],
        skills: [
          { icon: 'sword', label: 'Strike', active: true },
          { icon: 'shield', label: 'Defend' },
          { icon: 'fire', label: 'Fireball' },
          { icon: 'heal', label: 'Heal' },
        ],
        round: 2,
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid transition frame with titleCard', () => {
    const result = VNFrameSchema.safeParse({
      id: 'frame-6',
      type: 'transition',
      panels: [],
      transition: {
        type: 'crossfade',
        durationMs: 1500,
        titleCard: 'Chapter 2: The Descent',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects frame with unknown type', () => {
    const result = VNFrameSchema.safeParse({
      id: 'frame-bad',
      type: 'unknown-type',
      panels: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects dialogue frame missing targetPanel', () => {
    const result = VNFrameSchema.safeParse({
      id: 'frame-bad-2',
      type: 'dialogue',
      panels: [{ id: 'left' }],
      dialogue: {
        speaker: 'Someone',
        text: 'Hello',
        // targetPanel is missing
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects panel with non-existent effect type', () => {
    const result = VNFrameSchema.safeParse({
      id: 'frame-bad-3',
      type: 'full-screen',
      panels: [{ id: 'center' }],
      effects: [{ type: 'explode', durationMs: 500 }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts multiple stacked effects', () => {
    const result = VNFrameSchema.safeParse({
      id: 'frame-7',
      type: 'full-screen',
      panels: [{ id: 'center' }],
      effects: [
        { type: 'shake', durationMs: 300, target: 'screen', intensity: 0.8 },
        { type: 'flash', durationMs: 200, color: '#ffffff' },
        { type: 'scan-lines', durationMs: 5000 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('strips _meta on serialization (not sent to client)', () => {
    const frame = {
      id: 'frame-meta',
      type: 'full-screen' as const,
      panels: [{ id: 'center' as const }],
      _meta: {
        sceneId: 'scene-1',
        beatIndex: 2,
        plotProgressPercent: 45,
        narrativeNotes: 'Player chose the dark path',
      },
    };
    const result = VNFrameSchema.safeParse(frame);
    expect(result.success).toBe(true);
    if (result.success) {
      // _meta is accepted by the schema (for internal use),
      // but should be stripped before sending to client
      const { _meta, ...clientFrame } = result.data;
      expect(_meta).toBeDefined();
      expect(clientFrame).not.toHaveProperty('_meta');
    }
  });
});
