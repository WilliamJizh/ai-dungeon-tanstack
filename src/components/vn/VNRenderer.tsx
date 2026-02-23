import { useCallback, useEffect, useRef, useState } from 'react';
import type { VNFrame } from '../../../server/vn/types/vnFrame';
import type { VNPackage } from '../../../server/vn/types/vnTypes';
import { t } from '../../lib/i18n';
import { useLocale } from '../../context/LocaleContext';

function buildDefaultHud(pack: VNPackage, currentLocationId: string) {
  // Find which location we're in by scanning all acts
  let location;
  let act;
  for (const a of pack.plot.acts || []) {
    location = a.sandboxLocations?.find((l) => l.id === currentLocationId);
    if (location) {
      act = a;
      break;
    }
  }

  if (location && act) {
    return {
      chapter: act.title.toUpperCase(),
      scene: location.title.toUpperCase(),
      showNav: true as const,
    };
  }
  return { chapter: '', scene: '', showNav: true as const };
}

import { FrameEffects } from './FrameEffects';
import { TacticalMapFrame } from './frames/TacticalMapFrame';
import { resolveFrameEntry, type BaseFrameProps } from '../../lib/frameRegistry';
import { FONT_MAIN } from '../../lib/fonts';

/* ── Pulsing dots CSS (injected once) ────────────────────────────────────── */
const PULSE_STYLE_ID = 'vn-pulse-dots';
if (typeof document !== 'undefined' && !document.getElementById(PULSE_STYLE_ID)) {
  const style = document.createElement('style');
  style.id = PULSE_STYLE_ID;
  style.textContent = `
@keyframes vnPulseDot {
  0%, 80%, 100% { opacity: 0.15; }
  40% { opacity: 0.6; }
}
`;
  document.head.appendChild(style);
}

interface VNRendererProps {
  /** Full accumulated frame list from the agent — grows as new turns complete. */
  frames: VNFrame[];
  /** undefined = node not complete yet; string = nextNodeId; null = game over */
  pendingNodeComplete?: string | null;
  /** True while agent is streaming a turn */
  isLoading: boolean;
  /** Called with choice ID or free-text string when player acts */
  onPlayerAction: (text: string) => void;
  pack: VNPackage;
  currentLocationId: string;
  onNodeComplete: (nextNodeId: string) => void;
  isMuted?: boolean;
  onToggleMute?: () => void;
}

/**
 * Core VN engine renderer. Displays frames from the agent stream one at a time.
 * Parent (StorytellerSession) owns the frame list and player-action dispatch;
 * this component only tracks which frame the player is currently viewing.
 */
export function VNRenderer({
  frames,
  pendingNodeComplete,
  isLoading,
  onPlayerAction,
  pack,
  currentLocationId,
  onNodeComplete,
  isMuted,
  onToggleMute,
}: VNRendererProps) {
  const { locale } = useLocale();
  const [currentIndex, setCurrentIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null!);

  // Track the last successfully displayed frame so we can hold it on-screen
  // during loading gaps (player advanced past all frames, waiting for more).
  const lastFrameRef = useRef<VNFrame | null>(null);

  const currentFrame = frames[currentIndex] ?? null;

  // Keep lastFrameRef up-to-date whenever we have a real frame
  if (currentFrame) {
    lastFrameRef.current = currentFrame;
  }

  // The frame we actually render: prefer current, fall back to last-seen
  const displayFrame = currentFrame ?? lastFrameRef.current;

  // Are we in an "awaiting" state? (player past all frames, agent still generating)
  const awaitingNewFrames = !currentFrame && isLoading;

  useEffect(() => {
    if (currentFrame) {
      console.log('[VNRenderer] currentFrame', {
        id: currentFrame.id,
        type: currentFrame.type,
        panels: currentFrame.panels,
        firstPanelBgAsset: currentFrame.panels[0]?.backgroundAsset,
      });
    } else {
      console.log('[VNRenderer] no frame yet, frames.length=', frames.length);
    }
  }, [currentFrame, frames.length]);

  const handleAdvance = useCallback(() => {
    if (!currentFrame) return;
    // Choice frames require selection — don't auto-advance
    if (currentFrame.type === 'choice') return;

    if (currentIndex < frames.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else if (pendingNodeComplete !== undefined) {
      // End of queue and node is marked complete
      if (pendingNodeComplete !== null) {
        onNodeComplete(pendingNodeComplete);
      }
      // null = game over — do nothing
    }
    // else: end of queue, isLoading = true = more frames coming
  }, [currentFrame, currentIndex, frames.length, pendingNodeComplete, onNodeComplete]);

  const handleChoiceSelect = useCallback(
    (choiceId: string) => {
      setCurrentIndex(frames.length); // advance past current frames → wait until next turn arrives
      onPlayerAction(choiceId);
    },
    [onPlayerAction, frames.length],
  );

  const handleFreeTextSubmit = useCallback(
    (text: string) => {
      setCurrentIndex(frames.length); // advance past current frames → wait until next turn arrives
      onPlayerAction(text);
    },
    [onPlayerAction, frames.length],
  );

  const handleDiceResult = useCallback(
    (value: number) => {
      setCurrentIndex(frames.length);
      onPlayerAction(`[dice-result] ${value}`);
    },
    [onPlayerAction, frames.length],
  );

  // ── No frame has EVER been displayed — first load, nothing to hold on-screen ──
  if (!displayFrame) {
    return (
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: '#000',
        }}
      >
        {/* Subtle pulsing dots instead of a hard "LOADING..." */}
        <div style={{
          position: 'absolute',
          bottom: '48%',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 8,
        }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                display: 'inline-block',
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'rgba(255,255,255,.5)',
                animation: `vnPulseDot 1.4s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  const defaultHud = buildDefaultHud(pack, currentLocationId);

  const renderFrame = () => {
    // tactical-map needs closures over setCurrentIndex/frames.length — explicit branch
    if (displayFrame.type === 'tactical-map') {
      return (
        <TacticalMapFrame
          frame={displayFrame}
          pack={pack}
          onCombatComplete={(result, summary) => {
            setCurrentIndex(frames.length);
            onPlayerAction(`[combat-result] ${result} ${JSON.stringify({ summary, round: (displayFrame as any).tacticalMapData?.combat?.round })}`);
          }}
          onFreeText={(text, stateJson) => {
            onPlayerAction(`[combat-freetext][state:${stateJson}] ${text}`);
          }}
        />
      );
    }

    const entry = resolveFrameEntry(displayFrame);
    const baseProps: BaseFrameProps = {
      frame: { ...displayFrame, hud: displayFrame.hud ?? defaultHud },
      pack,
      onAdvance: handleAdvance,
      onChoiceSelect: handleChoiceSelect,
      onFreeTextSubmit: handleFreeTextSubmit,
      onDiceResult: handleDiceResult,
      isMuted,
      onToggleMute,
    };
    const props = entry.makeProps ? entry.makeProps(baseProps) : baseProps;
    return <entry.component {...props} />;
  };

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      {renderFrame()}
      <FrameEffects effects={displayFrame.effects ?? []} containerRef={containerRef} />

      {/* FIX 2: Ambient pulsing dots — waiting for first frame of a new turn */}
      {awaitingNewFrames && (
        <div style={{
          position: 'absolute',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 200,
          display: 'flex',
          gap: 6,
        }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                display: 'inline-block',
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: 'rgba(255,255,255,.35)',
                animation: `vnPulseDot 1.4s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      )}

      {/* FIX 3: "DM ..." badge — agent is generating and at least one frame has arrived */}
      {isLoading && currentFrame && (
        <div style={{
          position: 'absolute',
          bottom: 10,
          right: 12,
          zIndex: 200,
          fontFamily: FONT_MAIN,
          fontSize: 13,
          color: 'rgba(255,255,255,.35)',
          letterSpacing: '.12em',
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}>
          <span>{t('dm_thinking', locale)}</span>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                display: 'inline-block',
                width: 3,
                height: 3,
                borderRadius: '50%',
                background: 'rgba(255,255,255,.35)',
                animation: `vnPulseDot 1.4s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
