import { tool } from 'ai';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { plotStates, vnPackages } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { PlayerStats, Item } from '../types/playerTypes.js';
import { defaultPlayerStats } from '../types/playerTypes.js';

function getStats(sessionId: string): PlayerStats {
  const row = db.select().from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();
  if (!row) return defaultPlayerStats('Player');
  try {
    const parsed = JSON.parse((row as any).playerStatsJson || '{}');
    if (parsed && parsed.name) return parsed as PlayerStats;
  } catch {}
  // Initialize from package if available
  try {
    if (row.packageId) {
      const pkg = db.select().from(vnPackages).where(eq(vnPackages.id, row.packageId)).get();
      if (pkg) {
        const meta = JSON.parse(pkg.metaJson) as any;
        const protagonist = meta?.characters?.find((c: any) => c.role === 'protagonist');
        return defaultPlayerStats(protagonist?.name ?? 'Player');
      }
    }
  } catch {}
  return defaultPlayerStats('Player');
}

function saveStats(sessionId: string, stats: PlayerStats) {
  db.update(plotStates)
    .set({ playerStatsJson: JSON.stringify(stats) } as any)
    .where(eq(plotStates.sessionId, sessionId))
    .run();
}

export const playerStatsTool = tool({
  description: 'Read or update the player character stats (HP, attributes, skills, items, status effects). Call with action="read" at the start of any turn involving player stats. Call with action="update" to modify HP, add skills, apply status effects.',
  parameters: z.object({
    action: z.enum(['read', 'update', 'addItem', 'removeItem']),
    sessionId: z.string(),
    updates: z.object({
      hp: z.number().optional(),
      maxHp: z.number().optional(),
      level: z.number().optional(),
      skills: z.array(z.string()).optional(),
      statusEffects: z.array(z.object({
        id: z.string(), name: z.string(),
        type: z.enum(['buff', 'debuff', 'neutral']),
        description: z.string(),
        icon: z.string().optional(),
        turnsRemaining: z.number().optional(),
      })).optional(),
    }).optional(),
    item: z.object({
      id: z.string(), name: z.string(), description: z.string(),
      icon: z.string(), quantity: z.number(), equipped: z.boolean().optional(), effect: z.string().optional(),
    }).optional(),
    itemId: z.string().optional(),
  }),
  execute: async ({ action, sessionId, updates, item, itemId }) => {
    const stats = getStats(sessionId);

    if (action === 'read') {
      return { ok: true, stats };
    }

    if (action === 'update' && updates) {
      if (updates.hp !== undefined) stats.hp = Math.max(0, Math.min(updates.hp, stats.maxHp));
      if (updates.maxHp !== undefined) stats.maxHp = updates.maxHp;
      if (updates.level !== undefined) stats.level = updates.level;
      if (updates.skills) stats.skills = [...new Set([...stats.skills, ...updates.skills])];
      if (updates.statusEffects) stats.statusEffects = updates.statusEffects;
      saveStats(sessionId, stats);
      return { ok: true, stats };
    }

    if (action === 'addItem' && item) {
      const existing = stats.items.findIndex(i => i.id === item.id);
      if (existing >= 0) {
        stats.items[existing].quantity += item.quantity;
      } else {
        stats.items.push(item);
      }
      saveStats(sessionId, stats);
      return { ok: true, stats };
    }

    if (action === 'removeItem' && itemId) {
      stats.items = stats.items.filter(i => i.id !== itemId);
      saveStats(sessionId, stats);
      return { ok: true, stats };
    }

    return { ok: false, error: 'Invalid action or missing parameters' };
  },
});
