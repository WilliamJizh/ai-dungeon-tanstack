import {
  useReducer,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import type { VNFrame } from '../../../../server/vn/types/vnFrame';
import type { VNPackage } from '../../../../server/vn/types/vnTypes';
import type { CombatToken, TacticalMapData } from '../../../lib/combat/types';
import { combatReducer } from '../../../lib/combat/combatReducer';
import {
  getReachableCells,
  getAttackableTargets,
} from '../../../lib/combat/combatEngine';
import { t } from '../../../lib/i18n';
import { useLocale } from '../../../context/LocaleContext';

interface TacticalMapFrameProps {
  frame: VNFrame;
  pack: VNPackage;
  onCombatComplete: (result: string, summary: string) => void;
  onFreeText?: (text: string, stateJson: string) => void;
}

type InteractionMode = 'idle' | 'move' | 'attack';

const FONT = "VT323, 'Courier New', monospace";

function getHpColor(hp: number, maxHp: number): string {
  const pct = (hp / maxHp) * 100;
  if (pct > 50) return '#4ade80';
  if (pct > 25) return '#facc15';
  return '#ef4444';
}

function getTokenBorderColor(token: CombatToken): string {
  switch (token.type) {
    case 'player':
      return '#60a5fa';
    case 'ally':
      return '#34d399';
    case 'enemy':
      return '#f87171';
    case 'objective':
      return '#c084fc';
    case 'npc':
      return '#a3a3a3';
    default:
      return '#fff';
  }
}

export function TacticalMapFrame({
  frame,
  pack,
  onCombatComplete,
}: TacticalMapFrameProps) {
  const { locale } = useLocale();
  void pack;

  const tacticalData = (frame as Record<string, unknown>)
    .tacticalMapData as TacticalMapData | undefined;
  if (!tacticalData) return null;

  return (
    <TacticalMapInner
      data={tacticalData}
      locale={locale}
      onCombatComplete={onCombatComplete}
    />
  );
}

function TacticalMapInner({
  data,
  locale,
  onCombatComplete,
}: {
  data: TacticalMapData;
  locale: 'en' | 'zh-CN';
  onCombatComplete: (result: string, summary: string) => void;
}) {
  const [state, dispatch] = useReducer(combatReducer, data);
  const [mode, setMode] = useState<InteractionMode>('idle');
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [reachableCells, setReachableCells] = useState<
    Array<{ col: number; row: number }>
  >([]);
  const [attackableTargets, setAttackableTargets] = useState<CombatToken[]>([]);
  const [hoveredCell, setHoveredCell] = useState<{
    col: number;
    row: number;
  } | null>(null);
  const [enemyAnimatingId, setEnemyAnimatingId] = useState<string | null>(null);
  const [showResultOverlay, setShowResultOverlay] = useState(false);

  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panDragging = useRef(false);
  const panDragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const enemyTurnInProgress = useRef(false);

  const { gridCols, gridRows, combat } = state;

  const PAN_LIMIT = 200;

  const handlePanPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only start pan if clicking on the grid area background, not on tokens or controls
      const target = e.target as HTMLElement;
      if (target.closest('[data-token]') || target.closest('[data-cell]'))
        return;
      panDragging.current = true;
      panDragStart.current = { x: e.clientX, y: e.clientY };
      panStart.current = { ...pan };
      target.setPointerCapture(e.pointerId);
    },
    [pan],
  );

  const handlePanPointerMove = useCallback((e: React.PointerEvent) => {
    if (!panDragging.current) return;
    const dx = e.clientX - panDragStart.current.x;
    const dy = e.clientY - panDragStart.current.y;
    setPan({
      x: Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, panStart.current.x + dx)),
      y: Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, panStart.current.y + dy)),
    });
  }, []);

  const handlePanPointerUp = useCallback(() => {
    panDragging.current = false;
  }, []);

  // Scroll combat log to bottom
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [state.combat.log.length]);

  // Show result overlay when combat ends
  useEffect(() => {
    if (combat.isComplete && !showResultOverlay) {
      const timer = setTimeout(() => setShowResultOverlay(true), 800);
      return () => clearTimeout(timer);
    }
  }, [combat.isComplete, showResultOverlay]);

  // Auto-run enemy turns
  useEffect(() => {
    if (combat.isComplete) return;
    if (combat.phase !== 'enemy') return;
    if (enemyTurnInProgress.current) return;

    const activeToken = state.tokens.find(
      (tk) => tk.id === combat.activeTokenId,
    );
    if (
      !activeToken ||
      activeToken.type === 'player' ||
      activeToken.type === 'ally'
    )
      return;

    enemyTurnInProgress.current = true;
    setEnemyAnimatingId(activeToken.id);

    const timer = setTimeout(() => {
      dispatch({ type: 'ENEMY_TURN' });
      setEnemyAnimatingId(null);
      enemyTurnInProgress.current = false;
    }, 600);

    return () => {
      clearTimeout(timer);
      enemyTurnInProgress.current = false;
    };
  }, [combat.phase, combat.activeTokenId, combat.isComplete, state.tokens]);

  // Reset interaction mode when active token changes back to player
  useEffect(() => {
    if (combat.phase === 'player') {
      setMode('idle');
      setSelectedTokenId(null);
      setReachableCells([]);
      setAttackableTargets([]);
    }
  }, [combat.activeTokenId, combat.phase]);

  const handleTokenClick = useCallback(
    (token: CombatToken) => {
      if (combat.isComplete) return;
      if (combat.phase !== 'player') return;

      const activeToken = state.tokens.find(
        (tk) => tk.id === combat.activeTokenId,
      );
      if (!activeToken) return;

      // Clicking on the active player token enters move mode
      if (
        token.id === combat.activeTokenId &&
        (token.type === 'player' || token.type === 'ally')
      ) {
        if (mode === 'move') {
          // Toggle off
          setMode('idle');
          setSelectedTokenId(null);
          setReachableCells([]);
          return;
        }
        if (!token.hasMoved) {
          setMode('move');
          setSelectedTokenId(token.id);
          const cells = getReachableCells(
            token,
            state.tokens,
            state.terrain,
            gridCols,
            gridRows,
          );
          setReachableCells(cells);
          setAttackableTargets([]);
        }
        return;
      }

      // Clicking on an enemy in attack mode
      if (mode === 'attack' && token.type === 'enemy' && token.hp > 0) {
        const isTarget = attackableTargets.some((at) => at.id === token.id);
        if (isTarget) {
          dispatch({
            type: 'ATTACK',
            attackerId: combat.activeTokenId,
            targetId: token.id,
          });
          setMode('idle');
          setSelectedTokenId(null);
          setAttackableTargets([]);
          setReachableCells([]);
        }
      }
    },
    [
      combat,
      mode,
      state.tokens,
      state.terrain,
      gridCols,
      gridRows,
      attackableTargets,
    ],
  );

  const handleCellClick = useCallback(
    (col: number, row: number) => {
      if (combat.isComplete) return;
      if (combat.phase !== 'player') return;

      if (mode === 'move' && selectedTokenId) {
        const isReachable = reachableCells.some(
          (c) => c.col === col && c.row === row,
        );
        if (isReachable) {
          dispatch({ type: 'MOVE', tokenId: selectedTokenId, col, row });
          setMode('idle');
          setReachableCells([]);

          // After moving, check for attackable targets
          const movedToken = state.tokens.find(
            (tk) => tk.id === selectedTokenId,
          );
          if (movedToken) {
            const updatedToken = { ...movedToken, col, row, hasMoved: true };
            const targets = getAttackableTargets(updatedToken, state.tokens);
            if (targets.length > 0 && !movedToken.hasActed) {
              setMode('attack');
              setAttackableTargets(targets);
            } else {
              setSelectedTokenId(null);
            }
          }
        }
      }
    },
    [
      combat,
      mode,
      selectedTokenId,
      reachableCells,
      state.tokens,
    ],
  );

  const handleEndTurn = useCallback(() => {
    if (combat.isComplete) return;
    if (combat.phase !== 'player') return;
    setMode('idle');
    setSelectedTokenId(null);
    setReachableCells([]);
    setAttackableTargets([]);
    dispatch({ type: 'END_TURN' });
  }, [combat.isComplete, combat.phase]);

  const handleContinue = useCallback(() => {
    const result = combat.result ?? 'escape';
    const summary = state.combat.log.slice(-5).join('\n');
    onCombatComplete(result, summary);
  }, [combat.result, state.combat.log, onCombatComplete]);

  // Compute cell size based on container
  const [cellSize, setCellSize] = useState(40);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height - 180; // reserve space for log + buttons
        const cw = Math.floor(w / gridCols);
        const ch = Math.floor(h / gridRows);
        setCellSize(Math.max(20, Math.min(cw, ch)));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [gridCols, gridRows]);

  const gridWidth = cellSize * gridCols;
  const gridHeight = cellSize * gridRows;

  const activeToken = state.tokens.find(
    (tk) => tk.id === combat.activeTokenId,
  );
  const isPlayerTurn =
    combat.phase === 'player' &&
    activeToken &&
    (activeToken.type === 'player' || activeToken.type === 'ally');

  // Build set lookups for reachable / attackable
  const reachableSet = new Set(reachableCells.map((c) => `${c.col},${c.row}`));
  const attackableSet = new Set(attackableTargets.map((at) => at.id));

  // Terrain lookup
  const terrainMap = new Map<string, typeof state.terrain[number]>();
  for (const cell of state.terrain) {
    terrainMap.set(`${cell.col},${cell.row}`, cell);
  }

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#000',
        fontFamily: FONT,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        color: '#fff',
      }}
    >
      {/* Top bar: round + phase info */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          padding: '8px 16px',
          background: 'rgba(0,0,0,.8)',
          borderBottom: '1px solid rgba(255,255,255,.1)',
          flexShrink: 0,
          zIndex: 20,
        }}
      >
        <div style={{ fontSize: 14, letterSpacing: '.12em', color: 'rgba(255,255,255,.5)' }}>
          {t('round_label', locale)} {combat.round}
        </div>
        <div style={{ fontSize: 14, letterSpacing: '.1em' }}>
          {activeToken && (
            <span
              style={{
                color:
                  activeToken.type === 'player' || activeToken.type === 'ally'
                    ? '#60a5fa'
                    : '#f87171',
              }}
            >
              {activeToken.icon} {activeToken.label}
              {isPlayerTurn ? ' -- YOUR TURN' : ' -- ENEMY TURN'}
            </span>
          )}
        </div>
        <div style={{ fontSize: 13, letterSpacing: '.1em', color: 'rgba(255,255,255,.3)' }}>
          {mode === 'move'
            ? 'MOVE MODE'
            : mode === 'attack'
              ? 'ATTACK MODE'
              : ''}
        </div>
      </div>

      {/* Grid area */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          width: '100%',
          touchAction: 'none',
          cursor: panDragging.current ? 'grabbing' : 'grab',
        }}
        onPointerDown={handlePanPointerDown}
        onPointerMove={handlePanPointerMove}
        onPointerUp={handlePanPointerUp}
        onPointerCancel={handlePanPointerUp}
      >
        {/* Background map image */}
        {state.mapImageUrl && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url(${state.mapImageUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: 'brightness(.4) grayscale(.5)',
              transform: `translate(${pan.x}px, ${pan.y}px)`,
            }}
          />
        )}

        <div
          style={{
            position: 'relative',
            width: gridWidth,
            height: gridHeight,
            transform: `translate(${pan.x}px, ${pan.y}px)`,
            transition: panDragging.current ? 'none' : 'transform 0.1s ease-out',
          }}
        >
          {/* SVG Grid overlay */}
          <svg
            width={gridWidth}
            height={gridHeight}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              pointerEvents: 'none',
              zIndex: 1,
            }}
          >
            {/* Vertical lines */}
            {Array.from({ length: gridCols + 1 }, (_, i) => (
              <line
                key={`v${i}`}
                x1={i * cellSize}
                y1={0}
                x2={i * cellSize}
                y2={gridHeight}
                stroke="rgba(255,255,255,.15)"
                strokeWidth={1}
              />
            ))}
            {/* Horizontal lines */}
            {Array.from({ length: gridRows + 1 }, (_, i) => (
              <line
                key={`h${i}`}
                x1={0}
                y1={i * cellSize}
                x2={gridWidth}
                y2={i * cellSize}
                stroke="rgba(255,255,255,.15)"
                strokeWidth={1}
              />
            ))}
          </svg>

          {/* Cell overlays (terrain, reachable, hovered) */}
          {Array.from({ length: gridCols * gridRows }, (_, idx) => {
            const col = idx % gridCols;
            const row = Math.floor(idx / gridCols);
            const key = `${col},${row}`;
            const terrain = terrainMap.get(key);
            const isReachable = reachableSet.has(key);
            const isHovered =
              hoveredCell?.col === col && hoveredCell?.row === row;

            let bg = 'transparent';
            if (terrain?.type === 'blocked')
              bg = 'rgba(100,100,100,.4)';
            else if (terrain?.type === 'hazard')
              bg = 'rgba(255,60,60,.15)';
            else if (terrain?.type === 'difficult')
              bg = 'rgba(180,130,50,.15)';
            else if (terrain?.type === 'cover')
              bg = 'rgba(50,150,50,.12)';

            if (isReachable) bg = 'rgba(96,165,250,.25)';
            if (isReachable && isHovered) bg = 'rgba(96,165,250,.45)';

            return (
              <div
                key={key}
                data-cell
                style={{
                  position: 'absolute',
                  left: col * cellSize,
                  top: row * cellSize,
                  width: cellSize,
                  height: cellSize,
                  background: bg,
                  cursor:
                    isReachable && mode === 'move' ? 'pointer' : 'default',
                  zIndex: 2,
                }}
                onMouseEnter={() => setHoveredCell({ col, row })}
                onMouseLeave={() => setHoveredCell(null)}
                onClick={() => handleCellClick(col, row)}
              >
                {terrain?.icon && (
                  <span
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: cellSize * 0.5,
                      opacity: 0.4,
                      pointerEvents: 'none',
                    }}
                  >
                    {terrain.icon}
                  </span>
                )}
              </div>
            );
          })}

          {/* Tokens */}
          {state.tokens.map((token) => {
            const isDead = token.hp <= 0;
            const isActive = token.id === combat.activeTokenId;
            const isEnemyAnimating = token.id === enemyAnimatingId;
            const isAttackTarget = attackableSet.has(token.id);

            let borderColor = getTokenBorderColor(token);
            let boxShadow = 'none';

            if (isActive && !isDead) {
              borderColor = '#facc15';
              boxShadow = '0 0 8px rgba(250,204,21,.6)';
            }
            if (isAttackTarget && mode === 'attack') {
              borderColor = '#ef4444';
              boxShadow = '0 0 10px rgba(239,68,68,.7)';
            }
            if (isEnemyAnimating) {
              borderColor = '#fb923c';
              boxShadow = '0 0 12px rgba(251,146,60,.8)';
            }

            const hpPct = token.maxHp > 0 ? (token.hp / token.maxHp) * 100 : 0;

            return (
              <div
                key={token.id}
                data-token
                style={{
                  position: 'absolute',
                  left: token.col * cellSize + 2,
                  top: token.row * cellSize + 2,
                  width: cellSize - 4,
                  height: cellSize - 4,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: `2px solid ${borderColor}`,
                  borderRadius: 4,
                  background: 'rgba(0,0,0,.6)',
                  opacity: isDead ? 0.35 : 1,
                  filter: isDead ? 'grayscale(1)' : 'none',
                  cursor:
                    (isActive && isPlayerTurn && !isDead) ||
                    (isAttackTarget && mode === 'attack')
                      ? 'pointer'
                      : 'default',
                  zIndex: isActive ? 10 : 5,
                  transition: 'left 0.25s ease, top 0.25s ease',
                  boxShadow,
                  animation: isActive && !isDead ? 'tokenPulse 1.5s ease-in-out infinite' : 'none',
                }}
                onClick={() => handleTokenClick(token)}
              >
                <span
                  style={{
                    fontSize: Math.max(14, cellSize * 0.45),
                    lineHeight: 1,
                  }}
                >
                  {token.icon}
                </span>
                {/* HP bar */}
                {token.type !== 'objective' && !isDead && (
                  <div
                    style={{
                      width: '80%',
                      height: 3,
                      background: 'rgba(255,255,255,.15)',
                      borderRadius: 1,
                      overflow: 'hidden',
                      marginTop: 2,
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${hpPct}%`,
                        background: getHpColor(token.hp, token.maxHp),
                        borderRadius: 1,
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Action buttons */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '6px 16px',
          flexShrink: 0,
          zIndex: 20,
        }}
      >
        {isPlayerTurn && !combat.isComplete && (
          <>
            {!activeToken?.hasMoved && mode !== 'move' && (
              <button
                onClick={() => {
                  if (activeToken) {
                    setMode('move');
                    setSelectedTokenId(activeToken.id);
                    const cells = getReachableCells(
                      activeToken,
                      state.tokens,
                      state.terrain,
                      gridCols,
                      gridRows,
                    );
                    setReachableCells(cells);
                    setAttackableTargets([]);
                  }
                }}
                style={{
                  background: 'rgba(96,165,250,.15)',
                  border: '1px solid rgba(96,165,250,.4)',
                  borderRadius: 3,
                  padding: '5px 14px',
                  fontSize: 14,
                  letterSpacing: '.1em',
                  color: '#60a5fa',
                  fontFamily: FONT,
                  cursor: 'pointer',
                }}
              >
                MOVE
              </button>
            )}
            {!activeToken?.hasActed && mode !== 'attack' && (
              <button
                onClick={() => {
                  if (activeToken) {
                    const targets = getAttackableTargets(
                      activeToken,
                      state.tokens,
                    );
                    if (targets.length > 0) {
                      setMode('attack');
                      setAttackableTargets(targets);
                      setReachableCells([]);
                    }
                  }
                }}
                style={{
                  background: 'rgba(239,68,68,.15)',
                  border: '1px solid rgba(239,68,68,.4)',
                  borderRadius: 3,
                  padding: '5px 14px',
                  fontSize: 14,
                  letterSpacing: '.1em',
                  color: '#f87171',
                  fontFamily: FONT,
                  cursor: 'pointer',
                }}
              >
                ATTACK
              </button>
            )}
            {mode !== 'idle' && (
              <button
                onClick={() => {
                  setMode('idle');
                  setSelectedTokenId(null);
                  setReachableCells([]);
                  setAttackableTargets([]);
                }}
                style={{
                  background: 'rgba(255,255,255,.06)',
                  border: '1px solid rgba(255,255,255,.15)',
                  borderRadius: 3,
                  padding: '5px 14px',
                  fontSize: 14,
                  letterSpacing: '.1em',
                  color: 'rgba(255,255,255,.5)',
                  fontFamily: FONT,
                  cursor: 'pointer',
                }}
              >
                CANCEL
              </button>
            )}
            <button
              onClick={handleEndTurn}
              style={{
                background: 'rgba(250,204,21,.12)',
                border: '1px solid rgba(250,204,21,.35)',
                borderRadius: 3,
                padding: '5px 14px',
                fontSize: 14,
                letterSpacing: '.1em',
                color: '#facc15',
                fontFamily: FONT,
                cursor: 'pointer',
              }}
            >
              END TURN
            </button>
          </>
        )}
        {!combat.isComplete && (
          <button
            onClick={() =>
              onCombatComplete('escape', state.combat.log.slice(-3).join('\n'))
            }
            style={{
              background: 'rgba(255,255,255,.04)',
              border: '1px solid rgba(255,255,255,.1)',
              borderRadius: 3,
              padding: '5px 14px',
              fontSize: 14,
              letterSpacing: '.1em',
              color: 'rgba(255,255,255,.35)',
              fontFamily: FONT,
              cursor: 'pointer',
            }}
          >
            {t('retreat', locale)}
          </button>
        )}
      </div>

      {/* Combat log */}
      <div
        ref={logRef}
        style={{
          width: '100%',
          height: 120,
          flexShrink: 0,
          overflowY: 'auto',
          background: 'rgba(0,0,0,.85)',
          borderTop: '1px solid rgba(255,255,255,.1)',
          padding: '8px 16px',
          zIndex: 20,
        }}
      >
        {state.combat.log.slice(-20).map((line, i) => {
          const isLatest = i === state.combat.log.slice(-20).length - 1;
          return (
            <p
              key={i}
              style={{
                fontSize: 13,
                letterSpacing: '.04em',
                lineHeight: 1.4,
                margin: 0,
                color: isLatest
                  ? 'rgba(255,255,255,.9)'
                  : `rgba(255,255,255,${Math.min(0.6, 0.2 + i * 0.03)})`,
              }}
            >
              {isLatest ? '\u25B8 ' : ''}
              {line}
            </p>
          );
        })}
      </div>

      {/* Victory/Defeat overlay */}
      {showResultOverlay && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,.8)',
          }}
        >
          <div
            style={{
              fontSize: 64,
              letterSpacing: '.3em',
              color: combat.result === 'victory' ? '#facc15' : '#ef4444',
              textShadow:
                combat.result === 'victory'
                  ? '0 0 40px rgba(250,204,21,.5)'
                  : '0 0 40px rgba(239,68,68,.5)',
              marginBottom: 32,
            }}
          >
            {combat.result === 'victory' ? 'VICTORY' : 'DEFEAT'}
          </div>
          <button
            onClick={handleContinue}
            style={{
              background: 'rgba(255,255,255,.08)',
              border: '1px solid rgba(255,255,255,.2)',
              borderRadius: 4,
              padding: '10px 32px',
              fontSize: 18,
              letterSpacing: '.15em',
              color: 'rgba(255,255,255,.7)',
              fontFamily: FONT,
              cursor: 'pointer',
            }}
          >
            CONTINUE
          </button>
        </div>
      )}

      {/* Keyframe animations */}
      <style>{`
        @keyframes tokenPulse {
          0%, 100% { box-shadow: 0 0 6px rgba(250,204,21,.4); }
          50% { box-shadow: 0 0 14px rgba(250,204,21,.8); }
        }
      `}</style>
    </div>
  );
}
