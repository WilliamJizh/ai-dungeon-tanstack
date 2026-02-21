import { tool } from 'ai';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { combatStates } from '../../db/schema.js';
import { generateSceneImage } from '../../lib/imageGen.js';

const initCombatParams = z.object({
  sessionId: z.string(),
  setting: z.string().describe('Scene setting description for the map image, e.g. "abandoned warehouse interior, dark corridors" or "forest clearing at night"'),
  artStyle: z.string().optional().describe('Art style hint, e.g. "pixel art" or "watercolor"'),
  gridCols: z.number().default(12),
  gridRows: z.number().default(8),
  tokens: z.array(z.object({
    id: z.string(),
    type: z.enum(['player', 'enemy', 'ally', 'objective', 'npc']),
    label: z.string(),
    icon: z.string(),
    col: z.number(),
    row: z.number(),
    hp: z.number(),
    maxHp: z.number(),
    attack: z.number().optional(),
    defense: z.number().optional(),
    moveRange: z.number().optional(),
    attackRange: z.number().optional(),
    aiPattern: z.enum(['aggressive', 'defensive', 'patrol', 'guard-objective']).optional(),
  })).describe('Combat tokens. Player token should have type="player". Enemies have type="enemy". Objectives have type="objective".'),
  terrain: z.array(z.object({
    col: z.number(),
    row: z.number(),
    type: z.enum(['blocked', 'difficult', 'hazard', 'cover']),
  })).optional().default([]),
});

export const initCombatTool = tool({
  description: 'Initialize a tactical combat encounter. Generates a top-down grid map image, sets up tokens (player + enemies + objectives), and returns frame data to pass to frameBuilderTool. Call this when the story calls for a combat encounter.',
  parameters: initCombatParams,
  execute: async (args: z.infer<typeof initCombatParams>) => {
    const { sessionId, setting, artStyle, gridCols, gridRows, tokens, terrain } = args;
    // Generate top-down map image
    const imagePrompt = `Top-down tactical RPG battle map, bird's eye view, ${setting}${artStyle ? `, ${artStyle} style` : ''}. Grid-friendly flat perspective. Clear walkable areas and obstacles. No characters or tokens on the map.`;

    let mapImageUrl = '';
    try {
      const result = await generateSceneImage(imagePrompt, { aspectRatio: '16:9' });
      mapImageUrl = `data:${result.mimeType};base64,${result.base64}`;
    } catch (_err) {
      // Fallback: use empty string, client will show a dark placeholder
      mapImageUrl = '';
    }

    // Compute turn order (player first, then enemies by position)
    const turnOrder = [
      ...tokens.filter(t => t.type === 'player').map(t => t.id),
      ...tokens.filter(t => t.type !== 'player' && t.type !== 'objective').map(t => t.id),
    ];

    const normalizedTokens = tokens.map(t => ({
      ...t,
      attack: t.attack ?? 4,
      defense: t.defense ?? 10,
      moveRange: t.moveRange ?? (t.type === 'player' ? 4 : 3),
      attackRange: t.attackRange ?? 1,
      hasActed: false,
      hasMoved: false,
      statusEffects: [] as string[],
    }));

    const combatData = {
      mapImageUrl,
      gridCols,
      gridRows,
      tokens: normalizedTokens,
      terrain: terrain ?? [],
      combat: {
        round: 1,
        phase: 'player' as const,
        turnOrder,
        activeTokenId: turnOrder[0] ?? '',
        log: ['Combat begins!'],
        isComplete: false,
      },
      rules: {
        playerMoveRange: 4,
        playerAttackRange: 1,
        showGrid: true,
      },
    };

    // Save to DB (upsert)
    db.insert(combatStates).values({
      sessionId,
      combatJson: JSON.stringify(combatData),
      updatedAt: new Date().toISOString(),
    }).onConflictDoUpdate({
      target: combatStates.sessionId,
      set: {
        combatJson: JSON.stringify(combatData),
        updatedAt: new Date().toISOString(),
      },
    }).run();

    return {
      ok: true as const,
      frameData: {
        id: `combat-${sessionId}-r1`,
        type: 'tactical-map' as const,
        panels: [] as { id: 'left' | 'right' | 'center' }[],
        tacticalMapData: combatData,
      },
    };
  },
});
