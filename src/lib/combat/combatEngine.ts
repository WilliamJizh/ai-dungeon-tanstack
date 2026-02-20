import type { CombatToken, TacticalMapData, TerrainCell } from './types';

/** Chebyshev distance (grid distance allowing diagonal movement) */
export function gridDistance(
  a: { col: number; row: number },
  b: { col: number; row: number },
): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

/** Manhattan distance (no diagonal) */
export function manhattanDistance(
  a: { col: number; row: number },
  b: { col: number; row: number },
): number {
  return Math.abs(a.col - b.col) + Math.abs(a.row - b.row);
}

export function isInMoveRange(
  from: { col: number; row: number },
  to: { col: number; row: number },
  range: number,
): boolean {
  return manhattanDistance(from, to) <= range;
}

export function isInAttackRange(
  attacker: { col: number; row: number },
  target: { col: number; row: number },
  range: number,
): boolean {
  return gridDistance(attacker, target) <= range;
}

/** Get reachable cells for a token given current terrain */
export function getReachableCells(
  token: CombatToken,
  tokens: CombatToken[],
  terrain: TerrainCell[],
  cols: number,
  rows: number,
): Array<{ col: number; row: number }> {
  const blocked = new Set<string>();
  for (const t of tokens) {
    if (t.id !== token.id) blocked.add(`${t.col},${t.row}`);
  }
  for (const cell of terrain) {
    if (cell.type === 'blocked') blocked.add(`${cell.col},${cell.row}`);
  }
  const result: Array<{ col: number; row: number }> = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (blocked.has(`${c},${r}`)) continue;
      if (c === token.col && r === token.row) continue;
      if (isInMoveRange(token, { col: c, row: r }, token.moveRange)) {
        result.push({ col: c, row: r });
      }
    }
  }
  return result;
}

/** Get attackable targets (enemy tokens in attack range) */
export function getAttackableTargets(
  attacker: CombatToken,
  tokens: CombatToken[],
): CombatToken[] {
  return tokens.filter(
    (t) =>
      t.id !== attacker.id &&
      t.type !== attacker.type &&
      t.hp > 0 &&
      t.type !== 'objective' &&
      isInAttackRange(attacker, t, attacker.attackRange),
  );
}

/** d20 roll + attack modifier vs target defense */
export function resolveAttack(
  attacker: CombatToken,
  target: CombatToken,
): {
  roll: number;
  modifier: number;
  total: number;
  hit: boolean;
  damage: number;
  log: string;
} {
  const roll = Math.floor(Math.random() * 20) + 1;
  const modifier = Math.floor((attacker.attack - 10) / 2);
  const total = roll + modifier;
  const hit = total >= target.defense;
  const damage = hit
    ? Math.max(
        1,
        Math.floor(attacker.attack / 2) + Math.floor(Math.random() * 4) + 1,
      )
    : 0;
  const log = hit
    ? `${attacker.label} attacks ${target.label}! Roll ${roll}+${modifier}=${total} vs DC${target.defense} -- HIT! ${damage} damage.`
    : `${attacker.label} attacks ${target.label}! Roll ${roll}+${modifier}=${total} vs DC${target.defense} -- MISS!`;
  return { roll, modifier, total, hit, damage, log };
}

/** Simple enemy AI: move toward nearest player/ally, attack if in range */
export function computeEnemyAction(
  enemy: CombatToken,
  state: TacticalMapData,
): {
  action: 'move' | 'attack' | 'wait';
  targetId?: string;
  col?: number;
  row?: number;
} {
  const players = state.tokens.filter(
    (t) => (t.type === 'player' || t.type === 'ally') && t.hp > 0,
  );
  if (players.length === 0) return { action: 'wait' };

  const pattern = enemy.aiPattern ?? 'aggressive';

  if (pattern === 'aggressive' || pattern === 'defensive') {
    const nearest = players.reduce((best, p) =>
      gridDistance(enemy, p) < gridDistance(enemy, best) ? p : best,
    );

    const attackable = getAttackableTargets(enemy, state.tokens);
    if (attackable.length > 0) {
      return { action: 'attack', targetId: attackable[0].id };
    }

    const reachable = getReachableCells(
      enemy,
      state.tokens,
      state.terrain,
      state.gridCols,
      state.gridRows,
    );
    if (reachable.length > 0) {
      const best = reachable.reduce((b, c) =>
        gridDistance(c, nearest) < gridDistance(b, nearest) ? c : b,
      );
      return { action: 'move', col: best.col, row: best.row };
    }
    return { action: 'wait' };
  }

  if (
    pattern === 'patrol' &&
    enemy.patrolPath &&
    enemy.patrolPath.length > 0
  ) {
    const idx = enemy.patrolPath.findIndex(
      (p) => p.col === enemy.col && p.row === enemy.row,
    );
    const nextIdx = (idx + 1) % enemy.patrolPath.length;
    const next = enemy.patrolPath[nextIdx];
    if (isInMoveRange(enemy, next, enemy.moveRange)) {
      return { action: 'move', col: next.col, row: next.row };
    }
    return { action: 'wait' };
  }

  if (pattern === 'guard-objective') {
    const objectives = state.tokens.filter((t) => t.type === 'objective');
    if (objectives.length === 0) return { action: 'wait' };
    const obj = objectives[0];
    const attackable = getAttackableTargets(enemy, state.tokens);
    if (attackable.length > 0)
      return { action: 'attack', targetId: attackable[0].id };
    if (gridDistance(enemy, obj) > 2) {
      const reachable = getReachableCells(
        enemy,
        state.tokens,
        state.terrain,
        state.gridCols,
        state.gridRows,
      );
      if (reachable.length > 0) {
        const best = reachable.reduce((b, c) =>
          gridDistance(c, obj) < gridDistance(b, obj) ? c : b,
        );
        return { action: 'move', col: best.col, row: best.row };
      }
    }
    return { action: 'wait' };
  }

  return { action: 'wait' };
}

/** Check if combat should end */
export function checkCombatEnd(
  state: TacticalMapData,
): 'victory' | 'defeat' | null {
  const playerTokens = state.tokens.filter(
    (t) => t.type === 'player' || t.type === 'ally',
  );
  const enemyTokens = state.tokens.filter((t) => t.type === 'enemy');

  if (playerTokens.every((t) => t.hp <= 0)) return 'defeat';
  if (enemyTokens.every((t) => t.hp <= 0)) return 'victory';
  return null;
}
