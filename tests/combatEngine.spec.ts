import { describe, it, expect } from 'vitest';
import {
  gridDistance,
  manhattanDistance,
  isInMoveRange,
  isInAttackRange,
  getReachableCells,
  getAttackableTargets,
  resolveAttack,
  computeEnemyAction,
  checkCombatEnd,
} from '../src/lib/combat/combatEngine';
import { combatReducer } from '../src/lib/combat/combatReducer';
import type { CombatToken, TacticalMapData } from '../src/lib/combat/types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeToken(overrides: Partial<CombatToken> & { id: string }): CombatToken {
  return {
    type: 'player',
    label: overrides.id,
    icon: 'X',
    col: 0,
    row: 0,
    hp: 10,
    maxHp: 10,
    attack: 12,
    defense: 10,
    moveRange: 3,
    attackRange: 1,
    hasActed: false,
    hasMoved: false,
    statusEffects: [],
    ...overrides,
  };
}

function makeState(overrides: Partial<TacticalMapData> = {}): TacticalMapData {
  return {
    mapImageUrl: '',
    gridCols: 5,
    gridRows: 5,
    tokens: [],
    terrain: [],
    combat: {
      round: 1,
      phase: 'player',
      turnOrder: [],
      activeTokenId: '',
      log: [],
      isComplete: false,
    },
    rules: { playerMoveRange: 3, playerAttackRange: 1, showGrid: true },
    ...overrides,
  };
}

// ── gridDistance (Chebyshev) ──────────────────────────────────────────────────

describe('gridDistance', () => {
  it('returns 0 for same position', () => {
    expect(gridDistance({ col: 2, row: 3 }, { col: 2, row: 3 })).toBe(0);
  });

  it('returns 1 for adjacent horizontal', () => {
    expect(gridDistance({ col: 0, row: 0 }, { col: 1, row: 0 })).toBe(1);
  });

  it('returns 1 for diagonal (Chebyshev)', () => {
    expect(gridDistance({ col: 0, row: 0 }, { col: 1, row: 1 })).toBe(1);
  });

  it('diagonal equals straight for equal offsets', () => {
    expect(gridDistance({ col: 0, row: 0 }, { col: 3, row: 3 })).toBe(3);
    expect(gridDistance({ col: 0, row: 0 }, { col: 3, row: 0 })).toBe(3);
  });

  it('returns max of col/row differences', () => {
    expect(gridDistance({ col: 1, row: 1 }, { col: 4, row: 3 })).toBe(3);
  });
});

// ── manhattanDistance ─────────────────────────────────────────────────────────

describe('manhattanDistance', () => {
  it('returns 0 for same position', () => {
    expect(manhattanDistance({ col: 2, row: 2 }, { col: 2, row: 2 })).toBe(0);
  });

  it('returns 1 for adjacent', () => {
    expect(manhattanDistance({ col: 0, row: 0 }, { col: 1, row: 0 })).toBe(1);
  });

  it('returns sum of col + row differences for diagonal', () => {
    expect(manhattanDistance({ col: 0, row: 0 }, { col: 2, row: 3 })).toBe(5);
  });
});

// ── isInMoveRange (uses manhattan) ───────────────────────────────────────────

describe('isInMoveRange', () => {
  it('returns true within range', () => {
    expect(isInMoveRange({ col: 0, row: 0 }, { col: 1, row: 1 }, 3)).toBe(true);
  });

  it('returns false outside range', () => {
    expect(isInMoveRange({ col: 0, row: 0 }, { col: 3, row: 3 }, 3)).toBe(false);
  });

  it('returns true at exact range boundary', () => {
    expect(isInMoveRange({ col: 0, row: 0 }, { col: 2, row: 1 }, 3)).toBe(true);
  });
});

// ── isInAttackRange (uses Chebyshev) ─────────────────────────────────────────

describe('isInAttackRange', () => {
  it('returns true for adjacent with range 1', () => {
    expect(isInAttackRange({ col: 2, row: 2 }, { col: 3, row: 3 }, 1)).toBe(true);
  });

  it('returns false for 2 away with range 1', () => {
    expect(isInAttackRange({ col: 0, row: 0 }, { col: 2, row: 0 }, 1)).toBe(false);
  });

  it('returns true for longer range', () => {
    expect(isInAttackRange({ col: 0, row: 0 }, { col: 3, row: 2 }, 3)).toBe(true);
  });
});

// ── getReachableCells ────────────────────────────────────────────────────────

describe('getReachableCells', () => {
  it('returns cells within manhattan distance of moveRange', () => {
    const token = makeToken({ id: 'p1', col: 2, row: 2, moveRange: 2 });
    const cells = getReachableCells(token, [token], [], 5, 5);
    // All cells within manhattan distance 2, excluding the token's own cell
    expect(cells.length).toBeGreaterThan(0);
    for (const c of cells) {
      expect(manhattanDistance(token, c)).toBeLessThanOrEqual(2);
    }
    // Own cell excluded
    expect(cells.find((c) => c.col === 2 && c.row === 2)).toBeUndefined();
  });

  it('excludes cells occupied by other tokens', () => {
    const p1 = makeToken({ id: 'p1', col: 2, row: 2, moveRange: 3 });
    const p2 = makeToken({ id: 'p2', col: 3, row: 2 });
    const cells = getReachableCells(p1, [p1, p2], [], 5, 5);
    expect(cells.find((c) => c.col === 3 && c.row === 2)).toBeUndefined();
  });

  it('excludes blocked terrain', () => {
    const token = makeToken({ id: 'p1', col: 2, row: 2, moveRange: 3 });
    const terrain = [{ col: 3, row: 2, type: 'blocked' as const }];
    const cells = getReachableCells(token, [token], terrain, 5, 5);
    expect(cells.find((c) => c.col === 3 && c.row === 2)).toBeUndefined();
  });

  it('stays within grid bounds', () => {
    const token = makeToken({ id: 'p1', col: 0, row: 0, moveRange: 3 });
    const cells = getReachableCells(token, [token], [], 5, 5);
    for (const c of cells) {
      expect(c.col).toBeGreaterThanOrEqual(0);
      expect(c.row).toBeGreaterThanOrEqual(0);
      expect(c.col).toBeLessThan(5);
      expect(c.row).toBeLessThan(5);
    }
  });
});

// ── getAttackableTargets ─────────────────────────────────────────────────────

describe('getAttackableTargets', () => {
  it('finds enemies in range', () => {
    const player = makeToken({ id: 'p1', type: 'player', col: 2, row: 2, attackRange: 1 });
    const enemy = makeToken({ id: 'e1', type: 'enemy', col: 3, row: 2, hp: 5 });
    const targets = getAttackableTargets(player, [player, enemy]);
    expect(targets).toHaveLength(1);
    expect(targets[0].id).toBe('e1');
  });

  it('ignores enemies out of range', () => {
    const player = makeToken({ id: 'p1', type: 'player', col: 0, row: 0, attackRange: 1 });
    const enemy = makeToken({ id: 'e1', type: 'enemy', col: 4, row: 4, hp: 5 });
    const targets = getAttackableTargets(player, [player, enemy]);
    expect(targets).toHaveLength(0);
  });

  it('ignores dead enemies', () => {
    const player = makeToken({ id: 'p1', type: 'player', col: 2, row: 2, attackRange: 1 });
    const enemy = makeToken({ id: 'e1', type: 'enemy', col: 3, row: 2, hp: 0 });
    const targets = getAttackableTargets(player, [player, enemy]);
    expect(targets).toHaveLength(0);
  });

  it('ignores same-type tokens', () => {
    const p1 = makeToken({ id: 'p1', type: 'player', col: 2, row: 2, attackRange: 1 });
    const p2 = makeToken({ id: 'p2', type: 'player', col: 3, row: 2, hp: 5 });
    const targets = getAttackableTargets(p1, [p1, p2]);
    expect(targets).toHaveLength(0);
  });

  it('ignores objectives', () => {
    const player = makeToken({ id: 'p1', type: 'player', col: 2, row: 2, attackRange: 1 });
    const obj = makeToken({ id: 'obj', type: 'objective', col: 3, row: 2, hp: 1 });
    const targets = getAttackableTargets(player, [player, obj]);
    expect(targets).toHaveLength(0);
  });
});

// ── resolveAttack ────────────────────────────────────────────────────────────

describe('resolveAttack', () => {
  it('returns a valid result structure', () => {
    const attacker = makeToken({ id: 'a', attack: 14 });
    const target = makeToken({ id: 't', defense: 10 });
    const result = resolveAttack(attacker, target);
    expect(result.roll).toBeGreaterThanOrEqual(1);
    expect(result.roll).toBeLessThanOrEqual(20);
    expect(result.damage).toBeGreaterThanOrEqual(0);
    expect(typeof result.log).toBe('string');
    expect(result.log.length).toBeGreaterThan(0);
    expect(typeof result.hit).toBe('boolean');
  });

  it('damage is 0 on miss', () => {
    // Run multiple times to increase chance of seeing at least one miss
    let sawMiss = false;
    for (let i = 0; i < 100; i++) {
      const attacker = makeToken({ id: 'a', attack: 10 });
      const target = makeToken({ id: 't', defense: 20 }); // very hard to hit
      const result = resolveAttack(attacker, target);
      if (!result.hit) {
        sawMiss = true;
        expect(result.damage).toBe(0);
      }
    }
    expect(sawMiss).toBe(true);
  });

  it('damage >= 1 on hit', () => {
    let sawHit = false;
    for (let i = 0; i < 100; i++) {
      const attacker = makeToken({ id: 'a', attack: 20 });
      const target = makeToken({ id: 't', defense: 1 }); // very easy to hit
      const result = resolveAttack(attacker, target);
      if (result.hit) {
        sawHit = true;
        expect(result.damage).toBeGreaterThanOrEqual(1);
      }
    }
    expect(sawHit).toBe(true);
  });
});

// ── checkCombatEnd ───────────────────────────────────────────────────────────

describe('checkCombatEnd', () => {
  it('returns defeat when all players are dead', () => {
    const state = makeState({
      tokens: [
        makeToken({ id: 'p1', type: 'player', hp: 0 }),
        makeToken({ id: 'e1', type: 'enemy', hp: 5 }),
      ],
    });
    expect(checkCombatEnd(state)).toBe('defeat');
  });

  it('returns victory when all enemies are dead', () => {
    const state = makeState({
      tokens: [
        makeToken({ id: 'p1', type: 'player', hp: 5 }),
        makeToken({ id: 'e1', type: 'enemy', hp: 0 }),
      ],
    });
    expect(checkCombatEnd(state)).toBe('victory');
  });

  it('returns null when both sides still alive', () => {
    const state = makeState({
      tokens: [
        makeToken({ id: 'p1', type: 'player', hp: 5 }),
        makeToken({ id: 'e1', type: 'enemy', hp: 5 }),
      ],
    });
    expect(checkCombatEnd(state)).toBeNull();
  });

  it('treats ally tokens same as player for defeat check', () => {
    const state = makeState({
      tokens: [
        makeToken({ id: 'a1', type: 'ally', hp: 0 }),
        makeToken({ id: 'e1', type: 'enemy', hp: 5 }),
      ],
    });
    expect(checkCombatEnd(state)).toBe('defeat');
  });
});

// ── computeEnemyAction ───────────────────────────────────────────────────────

describe('computeEnemyAction', () => {
  it('aggressive enemy attacks player in range', () => {
    const player = makeToken({ id: 'p1', type: 'player', col: 2, row: 2, hp: 10 });
    const enemy = makeToken({
      id: 'e1', type: 'enemy', col: 3, row: 2, hp: 10,
      attackRange: 1, moveRange: 3, aiPattern: 'aggressive',
    });
    const state = makeState({
      tokens: [player, enemy],
      combat: { round: 1, phase: 'enemy', turnOrder: ['p1', 'e1'], activeTokenId: 'e1', log: [], isComplete: false },
    });
    const action = computeEnemyAction(enemy, state);
    expect(action.action).toBe('attack');
    expect(action.targetId).toBe('p1');
  });

  it('aggressive enemy moves toward player when out of attack range', () => {
    const player = makeToken({ id: 'p1', type: 'player', col: 0, row: 0, hp: 10 });
    const enemy = makeToken({
      id: 'e1', type: 'enemy', col: 4, row: 4, hp: 10,
      attackRange: 1, moveRange: 3, aiPattern: 'aggressive',
    });
    const state = makeState({
      tokens: [player, enemy],
      combat: { round: 1, phase: 'enemy', turnOrder: ['p1', 'e1'], activeTokenId: 'e1', log: [], isComplete: false },
    });
    const action = computeEnemyAction(enemy, state);
    expect(action.action).toBe('move');
    expect(action.col).toBeDefined();
    expect(action.row).toBeDefined();
    // Should move closer to player
    const distBefore = gridDistance(enemy, player);
    const distAfter = gridDistance({ col: action.col!, row: action.row! }, player);
    expect(distAfter).toBeLessThan(distBefore);
  });

  it('returns wait if no players alive', () => {
    const enemy = makeToken({
      id: 'e1', type: 'enemy', col: 2, row: 2, hp: 10,
      aiPattern: 'aggressive', moveRange: 3, attackRange: 1,
    });
    const state = makeState({
      tokens: [makeToken({ id: 'p1', type: 'player', hp: 0 }), enemy],
      combat: { round: 1, phase: 'enemy', turnOrder: ['p1', 'e1'], activeTokenId: 'e1', log: [], isComplete: false },
    });
    const action = computeEnemyAction(enemy, state);
    expect(action.action).toBe('wait');
  });
});

// ── combatReducer MOVE ───────────────────────────────────────────────────────

describe('combatReducer MOVE', () => {
  it('updates token position and sets hasMoved', () => {
    const token = makeToken({ id: 'p1', col: 0, row: 0 });
    const state = makeState({
      tokens: [token],
      combat: { round: 1, phase: 'player', turnOrder: ['p1'], activeTokenId: 'p1', log: [], isComplete: false },
    });

    const next = combatReducer(state, { type: 'MOVE', tokenId: 'p1', col: 2, row: 3 });
    const movedToken = next.tokens.find((t) => t.id === 'p1')!;
    expect(movedToken.col).toBe(2);
    expect(movedToken.row).toBe(3);
    expect(movedToken.hasMoved).toBe(true);
  });

  it('adds a log entry', () => {
    const token = makeToken({ id: 'p1', col: 0, row: 0 });
    const state = makeState({
      tokens: [token],
      combat: { round: 1, phase: 'player', turnOrder: ['p1'], activeTokenId: 'p1', log: [], isComplete: false },
    });

    const next = combatReducer(state, { type: 'MOVE', tokenId: 'p1', col: 2, row: 3 });
    expect(next.combat.log.length).toBeGreaterThan(0);
    expect(next.combat.log[next.combat.log.length - 1]).toContain('moves to');
  });
});

// ── combatReducer ATTACK ─────────────────────────────────────────────────────

describe('combatReducer ATTACK', () => {
  it('target HP can decrease', () => {
    const attacker = makeToken({ id: 'p1', type: 'player', col: 2, row: 2, attack: 20 });
    const target = makeToken({ id: 'e1', type: 'enemy', col: 3, row: 2, hp: 15, maxHp: 15, defense: 1 });
    const state = makeState({
      tokens: [attacker, target],
      combat: { round: 1, phase: 'player', turnOrder: ['p1', 'e1'], activeTokenId: 'p1', log: [], isComplete: false },
    });

    // Run multiple times since combat has random elements
    let hpDecreased = false;
    for (let i = 0; i < 50; i++) {
      const next = combatReducer(state, { type: 'ATTACK', attackerId: 'p1', targetId: 'e1' });
      const e = next.tokens.find((t) => t.id === 'e1')!;
      if (e.hp < 15) {
        hpDecreased = true;
        break;
      }
    }
    expect(hpDecreased).toBe(true);
  });

  it('marks attacker as hasActed', () => {
    const attacker = makeToken({ id: 'p1', type: 'player', col: 2, row: 2, attack: 14 });
    const target = makeToken({ id: 'e1', type: 'enemy', col: 3, row: 2, hp: 15, defense: 10 });
    const state = makeState({
      tokens: [attacker, target],
      combat: { round: 1, phase: 'player', turnOrder: ['p1', 'e1'], activeTokenId: 'p1', log: [], isComplete: false },
    });

    const next = combatReducer(state, { type: 'ATTACK', attackerId: 'p1', targetId: 'e1' });
    const a = next.tokens.find((t) => t.id === 'p1')!;
    expect(a.hasActed).toBe(true);
  });

  it('triggers victory when last enemy dies', () => {
    const attacker = makeToken({ id: 'p1', type: 'player', col: 2, row: 2, attack: 30 });
    const target = makeToken({ id: 'e1', type: 'enemy', col: 3, row: 2, hp: 1, maxHp: 10, defense: 1 });
    const state = makeState({
      tokens: [attacker, target],
      combat: { round: 1, phase: 'player', turnOrder: ['p1', 'e1'], activeTokenId: 'p1', log: [], isComplete: false },
    });

    // With attack=30 and defense=1, hits are very likely. Run until hit.
    let victory = false;
    for (let i = 0; i < 100; i++) {
      const next = combatReducer(state, { type: 'ATTACK', attackerId: 'p1', targetId: 'e1' });
      if (next.combat.isComplete && next.combat.result === 'victory') {
        victory = true;
        break;
      }
    }
    expect(victory).toBe(true);
  });
});

// ── combatReducer END_TURN ───────────────────────────────────────────────────

describe('combatReducer END_TURN', () => {
  it('advances activeTokenId to next in turnOrder', () => {
    const state = makeState({
      tokens: [
        makeToken({ id: 'p1', type: 'player' }),
        makeToken({ id: 'e1', type: 'enemy' }),
      ],
      combat: {
        round: 1,
        phase: 'player',
        turnOrder: ['p1', 'e1'],
        activeTokenId: 'p1',
        log: [],
        isComplete: false,
      },
    });

    const next = combatReducer(state, { type: 'END_TURN' });
    expect(next.combat.activeTokenId).toBe('e1');
  });

  it('wraps around to first token and increments round', () => {
    const state = makeState({
      tokens: [
        makeToken({ id: 'p1', type: 'player' }),
        makeToken({ id: 'e1', type: 'enemy' }),
      ],
      combat: {
        round: 1,
        phase: 'enemy',
        turnOrder: ['p1', 'e1'],
        activeTokenId: 'e1',
        log: [],
        isComplete: false,
      },
    });

    const next = combatReducer(state, { type: 'END_TURN' });
    expect(next.combat.activeTokenId).toBe('p1');
    expect(next.combat.round).toBe(2);
  });

  it('sets phase to enemy when next token is an enemy', () => {
    const state = makeState({
      tokens: [
        makeToken({ id: 'p1', type: 'player' }),
        makeToken({ id: 'e1', type: 'enemy' }),
      ],
      combat: {
        round: 1,
        phase: 'player',
        turnOrder: ['p1', 'e1'],
        activeTokenId: 'p1',
        log: [],
        isComplete: false,
      },
    });

    const next = combatReducer(state, { type: 'END_TURN' });
    expect(next.combat.phase).toBe('enemy');
  });
});

// ── combatReducer ENEMY_TURN ─────────────────────────────────────────────────

describe('combatReducer ENEMY_TURN', () => {
  it('enemy moves or attacks then advances turn', () => {
    const player = makeToken({ id: 'p1', type: 'player', col: 0, row: 0, hp: 20 });
    const enemy = makeToken({
      id: 'e1', type: 'enemy', col: 4, row: 4, hp: 10,
      moveRange: 3, attackRange: 1, aiPattern: 'aggressive',
    });
    const state = makeState({
      tokens: [player, enemy],
      combat: {
        round: 1,
        phase: 'enemy',
        turnOrder: ['p1', 'e1'],
        activeTokenId: 'e1',
        log: [],
        isComplete: false,
      },
    });

    const next = combatReducer(state, { type: 'ENEMY_TURN' });
    // After ENEMY_TURN, turn should advance back to p1
    expect(next.combat.activeTokenId).toBe('p1');
  });

  it('does nothing if active token is a player', () => {
    const player = makeToken({ id: 'p1', type: 'player', col: 0, row: 0 });
    const state = makeState({
      tokens: [player],
      combat: {
        round: 1,
        phase: 'player',
        turnOrder: ['p1'],
        activeTokenId: 'p1',
        log: [],
        isComplete: false,
      },
    });

    const next = combatReducer(state, { type: 'ENEMY_TURN' });
    expect(next).toBe(state); // reference equality — unchanged
  });
});
