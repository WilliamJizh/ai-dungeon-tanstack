import type { PlotState, Act } from '../types/vnTypes.js';

/**
 * Deterministic rules engine that runs BEFORE the Director LLM.
 * Handles simple, predictable state changes without an LLM call.
 * Returns `needsDirector: true` when the situation requires nuanced evaluation.
 */

export interface RulesResult {
  /** State updates to apply automatically (no LLM needed). */
  stateUpdates: {
    complicationCleared?: boolean;
  };
  /** Whether the Director LLM should be invoked for this turn. */
  needsDirector: boolean;
  /** Reason for invoking/skipping Director (for logging). */
  reason: string;
}

export function evaluateRules(
  state: PlotState,
  playerQuery: string,
  previousFlags: Record<string, unknown>,
  act: Act,
): RulesResult {
  const reasons: string[] = [];
  let needsDirector = false;
  let complicationCleared = false;

  // 1. Auto-expire active complication if past maxTurns
  if (state.activeComplication) {
    const turnsElapsed = state.turnCount - state.activeComplication.injectedAtTurn;
    if (turnsElapsed >= state.activeComplication.maxTurns) {
      complicationCleared = true;
      reasons.push(`complication expired (${turnsElapsed} >= ${state.activeComplication.maxTurns} turns)`);
    }
  }

  // 2. Check if new flags were set since last turn
  const currentFlagKeys = Object.keys(state.flags);
  const previousFlagKeys = Object.keys(previousFlags);
  const newFlags = currentFlagKeys.filter(k => !previousFlagKeys.includes(k));
  if (newFlags.length > 0) {
    needsDirector = true;
    reasons.push(`new flags set: ${newFlags.join(', ')}`);
  }

  // 3. Check if progression threshold was crossed
  if (act.globalProgression) {
    const { requiredValue } = act.globalProgression;
    if (state.globalProgression >= requiredValue) {
      needsDirector = true;
      reasons.push(`progression threshold reached: ${state.globalProgression}/${requiredValue}`);
    }
  }

  // 4. Check doom clock thresholds
  if (act.opposingForce) {
    const { requiredValue, escalationEvents } = act.opposingForce;
    const tick = state.opposingForce.currentTick;

    if (tick >= requiredValue) {
      needsDirector = true;
      reasons.push(`doom clock maxed: ${tick}/${requiredValue}`);
    }

    // Check if we just crossed an escalation threshold
    const history = state.opposingForce.escalationHistory ?? [];
    for (const event of escalationEvents) {
      const justCrossed = tick >= event.threshold &&
        !history.includes(`threshold_${event.threshold}`);
      if (justCrossed) {
        needsDirector = true;
        reasons.push(`escalation threshold crossed: ${event.threshold}`);
      }
    }
  }

  // 5. Stale progression detection — if many turns have passed without reaching
  //    the act's progression threshold, invoke Director more urgently
  if (act.globalProgression) {
    const { requiredValue } = act.globalProgression;
    const remaining = requiredValue - state.globalProgression;
    if (remaining > 0 && state.turnCount >= 8) {
      needsDirector = true;
      reasons.push(`stale progression (${state.globalProgression}/${requiredValue} after ${state.turnCount} turns) — Director should award milestone progression`);
    }
  }

  // 6. Periodic Director refresh (every 3 turns)
  if (state.turnCount > 0 && state.turnCount % 3 === 0) {
    needsDirector = true;
    reasons.push(`periodic refresh (turn ${state.turnCount})`);
  }

  // 7. First turn at a location always needs Director
  if (state.turnCount === 0) {
    needsDirector = true;
    reasons.push('first turn of session');
  }

  // 8. Player query heuristics — detect interesting actions
  const queryLower = playerQuery.toLowerCase();
  const travelKeywords = ['go to', 'walk to', 'head to', 'travel', 'leave', 'exit', 'move to'];
  const actionKeywords = ['attack', 'fight', 'search', 'examine', 'pick', 'steal', 'break', 'open', 'hide', 'run'];

  if (travelKeywords.some(kw => queryLower.includes(kw))) {
    needsDirector = true;
    reasons.push('travel intent detected');
  }
  if (actionKeywords.some(kw => queryLower.includes(kw))) {
    needsDirector = true;
    reasons.push('significant action detected');
  }

  // Default reason if skipping
  if (!needsDirector && reasons.length === 0) {
    reasons.push('no significant changes detected — using cached direction');
  }

  return {
    stateUpdates: {
      complicationCleared: complicationCleared || undefined,
    },
    needsDirector,
    reason: reasons.join('; '),
  };
}
