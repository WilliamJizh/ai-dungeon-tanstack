import { tool } from 'ai';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { combatStates } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

const combatEventParams = z.object({
  sessionId: z.string(),
  events: z.array(z.discriminatedUnion('type', [
    z.object({ type: z.literal('modify_hp'), tokenId: z.string(), delta: z.number() }),
    z.object({
      type: z.literal('add_token'),
      token: z.object({
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
      }),
    }),
    z.object({ type: z.literal('remove_token'), tokenId: z.string() }),
    z.object({ type: z.literal('add_terrain'), col: z.number(), row: z.number(), terrainType: z.enum(['blocked', 'difficult', 'hazard', 'cover']) }),
    z.object({ type: z.literal('log_message'), message: z.string() }),
    z.object({ type: z.literal('end_combat'), result: z.enum(['victory', 'defeat', 'escape']), message: z.string() }),
  ])).describe('List of events to apply to the combat state'),
});

export const combatEventTool = tool({
  description: 'Inject an event into an active tactical combat. Use when player sends free text during combat and you want to react: modify HP, add/remove tokens, change terrain, or add a narrative log entry. Only call during active combat (when the latest player message starts with [combat-freetext]).',
  parameters: combatEventParams,
  execute: async (args: z.infer<typeof combatEventParams>) => {
    const { sessionId, events } = args;
    const row = db.select().from(combatStates).where(eq(combatStates.sessionId, sessionId)).get();
    if (!row) return { ok: false as const, error: 'No active combat found' };

    const state = JSON.parse(row.combatJson) as {
      tokens: { id: string; label: string; hp: number; maxHp: number; attack?: number; defense?: number; moveRange?: number; attackRange?: number; hasActed: boolean; hasMoved: boolean; statusEffects: string[] }[];
      terrain: { col: number; row: number; type: string }[];
      combat: { log: string[]; isComplete: boolean; result?: string };
    };

    for (const event of events) {
      if (event.type === 'modify_hp') {
        const token = state.tokens.find(t => t.id === event.tokenId);
        if (token) {
          token.hp = Math.max(0, Math.min(token.maxHp, token.hp + event.delta));
          if (token.hp === 0) state.combat.log.push(`${token.label} was defeated!`);
        }
      } else if (event.type === 'add_token') {
        const t = event.token;
        state.tokens.push({
          ...t,
          attack: t.attack ?? 4,
          defense: t.defense ?? 10,
          moveRange: t.moveRange ?? 3,
          attackRange: t.attackRange ?? 1,
          hasActed: false,
          hasMoved: false,
          statusEffects: [],
        });
        state.combat.log.push(`${event.token.label} has entered the battle!`);
      } else if (event.type === 'remove_token') {
        state.tokens = state.tokens.filter(t => t.id !== event.tokenId);
      } else if (event.type === 'add_terrain') {
        state.terrain.push({ col: event.col, row: event.row, type: event.terrainType });
      } else if (event.type === 'log_message') {
        state.combat.log.push(event.message);
      } else if (event.type === 'end_combat') {
        state.combat.isComplete = true;
        state.combat.result = event.result;
        state.combat.log.push(event.message);
      }
    }

    db.update(combatStates)
      .set({ combatJson: JSON.stringify(state), updatedAt: new Date().toISOString() })
      .where(eq(combatStates.sessionId, sessionId))
      .run();

    return {
      ok: true as const,
      updatedFrameData: {
        id: `combat-${sessionId}-event`,
        type: 'tactical-map' as const,
        panels: [] as { id: 'left' | 'right' | 'center' }[],
        tacticalMapData: state,
      },
    };
  },
});
