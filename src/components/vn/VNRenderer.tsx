import { useCallback, useEffect, useRef, useState } from 'react';
import type { VNFrame } from '../../../server/vn/types/vnFrame';
import type { VNPackage } from '../../../server/vn/types/vnTypes';

function buildDefaultHud(pack: VNPackage, currentSceneId: string) {
  for (const [actIdx, act] of pack.plot.acts.entries()) {
    const scene = act.scenes.find((s) => s.id === currentSceneId);
    if (scene) {
      return {
        chapter: `CH.${actIdx + 1}  ${act.title.toUpperCase()}`,
        scene: scene.title.toUpperCase(),
        showNav: true as const,
      };
    }
  }
  return { chapter: '', scene: '', showNav: true as const };
}

import { FrameEffects } from './FrameEffects';
import { FullScreenFrame } from './frames/FullScreenFrame';
import { DialogueFrame } from './frames/DialogueFrame';
import { ThreePanelFrame } from './frames/ThreePanelFrame';
import { ChoiceFrame } from './frames/ChoiceFrame';
import { BattleFrame } from './frames/BattleFrame';

interface VNRendererProps {
  /** Full accumulated frame list from the agent — grows as new turns complete. */
  frames: VNFrame[];
  /** undefined = scene not complete yet; string = nextSceneId; null = game over */
  pendingSceneComplete?: string | null;
  /** True while agent is streaming a turn */
  isLoading: boolean;
  /** Called with choice ID or free-text string when player acts */
  onPlayerAction: (text: string) => void;
  pack: VNPackage;
  currentSceneId: string;
  onSceneComplete: (nextSceneId: string) => void;
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
  pendingSceneComplete,
  isLoading,
  onPlayerAction,
  pack,
  currentSceneId,
  onSceneComplete,
  isMuted,
  onToggleMute,
}: VNRendererProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null!);

  const currentFrame = frames[currentIndex];

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
    } else if (pendingSceneComplete !== undefined) {
      // End of queue and scene is marked complete
      if (pendingSceneComplete !== null) {
        onSceneComplete(pendingSceneComplete);
      }
      // null = game over — do nothing
    }
    // else: end of queue, isLoading = true = more frames coming
  }, [currentFrame, currentIndex, frames.length, pendingSceneComplete, onSceneComplete]);

  const handleChoiceSelect = useCallback(
    (choiceId: string) => {
      onPlayerAction(choiceId);
    },
    [onPlayerAction],
  );

  const handleFreeTextSubmit = useCallback(
    (text: string) => {
      onPlayerAction(text);
    },
    [onPlayerAction],
  );

  if (!currentFrame) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: '#000',
          color: 'rgba(255,255,255,.3)',
          fontFamily: "VT323, 'Courier New', monospace",
          fontSize: 18,
          letterSpacing: '.2em',
        }}
      >
        LOADING...
      </div>
    );
  }

  const defaultHud = buildDefaultHud(pack, currentSceneId);

  const frameProps = {
    frame: { ...currentFrame, hud: currentFrame.hud ?? defaultHud },
    pack,
    onAdvance: handleAdvance,
    onChoiceSelect: handleChoiceSelect,
    onFreeTextSubmit: handleFreeTextSubmit,
    isMuted,
    onToggleMute,
  };

  const renderFrame = () => {
    switch (currentFrame.type) {
      case 'full-screen':
        return <FullScreenFrame {...frameProps} />;
      case 'dialogue':
        // Storyteller can emit center-target dialogue; fallback to full-screen
        // when the layout lacks left/right panels.
        if (
          currentFrame.dialogue?.targetPanel === 'center' ||
          !currentFrame.panels.some((p) => p.id === 'left' || p.id === 'right')
        ) {
          return <FullScreenFrame {...frameProps} />;
        }
        return <DialogueFrame {...frameProps} />;
      case 'three-panel':
        return <ThreePanelFrame {...frameProps} />;
      case 'choice':
        return <ChoiceFrame {...frameProps} />;
      case 'battle':
        return <BattleFrame {...frameProps} />;
      case 'transition':
        return <FullScreenFrame {...frameProps} />;
      default:
        return <FullScreenFrame {...frameProps} />;
    }
  };

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      {renderFrame()}
      <FrameEffects effects={currentFrame.effects ?? []} containerRef={containerRef} />
      {isLoading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,.5)',
            color: 'rgba(255,255,255,.5)',
            fontFamily: "VT323, 'Courier New', monospace",
            fontSize: 20,
            letterSpacing: '.3em',
          }}
        >
          LOADING...
        </div>
      )}
    </div>
  );
}
