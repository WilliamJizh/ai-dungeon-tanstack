import type { TacticalMapData, CombatAction } from './types';
import {
  resolveAttack,
  computeEnemyAction,
  checkCombatEnd,
} from './combatEngine';

export function combatReducer(
  state: TacticalMapData,
  action: CombatAction,
): TacticalMapData {
  switch (action.type) {
    case 'MOVE': {
      const tokens = state.tokens.map((t) =>
        t.id === action.tokenId
          ? { ...t, col: action.col, row: action.row, hasMoved: true }
          : t,
      );
      const movedToken = state.tokens.find((t) => t.id === action.tokenId);
      return {
        ...state,
        tokens,
        combat: {
          ...state.combat,
          log: [
            ...state.combat.log,
            `${movedToken?.label ?? action.tokenId} moves to (${action.col},${action.row})`,
          ],
        },
      };
    }

    case 'ATTACK': {
      const attacker = state.tokens.find((t) => t.id === action.attackerId);
      const target = state.tokens.find((t) => t.id === action.targetId);
      if (!attacker || !target) return state;

      const result = resolveAttack(attacker, target);
      const newHp = Math.max(0, target.hp - result.damage);
      const tokens = state.tokens.map((t) => {
        if (t.id === action.attackerId) return { ...t, hasActed: true };
        if (t.id === action.targetId) return { ...t, hp: newHp };
        return t;
      });
      const newLog = [...state.combat.log, result.log];
      if (newHp === 0) newLog.push(`${target.label} was defeated!`);

      const newState = {
        ...state,
        tokens,
        combat: { ...state.combat, log: newLog },
      };
      const endResult = checkCombatEnd(newState);
      if (endResult) {
        return {
          ...newState,
          combat: {
            ...newState.combat,
            isComplete: true,
            result: endResult,
            log: [
              ...newState.combat.log,
              endResult === 'victory' ? 'Victory!' : 'Defeat...',
            ],
          },
        };
      }
      return newState;
    }

    case 'END_TURN': {
      const order = state.combat.turnOrder;
      const idx = order.indexOf(state.combat.activeTokenId);
      const nextIdx = (idx + 1) % order.length;
      const nextId = order[nextIdx];
      const isNewRound = nextIdx === 0;
      const newRound = isNewRound
        ? state.combat.round + 1
        : state.combat.round;

      const nextToken = state.tokens.find((t) => t.id === nextId);
      const nextPhase =
        !nextToken ||
        nextToken.type === 'player' ||
        nextToken.type === 'ally'
          ? 'player'
          : 'enemy';

      // Reset hasActed/hasMoved for the token that just ended
      const tokens = state.tokens.map((t) =>
        t.id === state.combat.activeTokenId
          ? { ...t, hasActed: true, hasMoved: true }
          : t,
      );

      const newLog = [...state.combat.log];
      if (isNewRound) newLog.push(`--- Round ${newRound} ---`);

      return {
        ...state,
        tokens,
        combat: {
          ...state.combat,
          activeTokenId: nextId,
          phase: nextPhase,
          round: newRound,
          log: newLog,
        },
      };
    }

    case 'ENEMY_TURN': {
      const enemy = state.tokens.find(
        (t) => t.id === state.combat.activeTokenId,
      );
      if (!enemy || enemy.type === 'player' || enemy.type === 'ally')
        return state;

      const ai = computeEnemyAction(enemy, state);
      let newState = state;

      if (
        ai.action === 'move' &&
        ai.col !== undefined &&
        ai.row !== undefined
      ) {
        newState = combatReducer(state, {
          type: 'MOVE',
          tokenId: enemy.id,
          col: ai.col,
          row: ai.row,
        });
      } else if (ai.action === 'attack' && ai.targetId) {
        newState = combatReducer(state, {
          type: 'ATTACK',
          attackerId: enemy.id,
          targetId: ai.targetId,
        });
      }

      // Auto-advance to next turn
      return combatReducer(newState, { type: 'END_TURN' });
    }

    case 'APPLY_EXTERNAL': {
      return action.data;
    }

    default:
      return state;
  }
}
