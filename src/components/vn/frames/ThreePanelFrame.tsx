import { useCallback, useEffect } from 'react';
import type { VNFrame, VNPanel } from '../../../../server/vn/types/vnFrame';
import type { VNPackage } from '../../../../server/vn/types/vnTypes';
import { resolveAsset } from '../../../lib/resolveAsset';
import { useTypewriter } from '../hooks/useTypewriter';

interface ThreePanelFrameProps {
  frame: VNFrame;
  pack: VNPackage;
  onAdvance: () => void;
  isMuted?: boolean;
  onToggleMute?: () => void;
}

/**
 * 3-Panel frame: left 27%, center flex-1, right 27%.
 * Silent (dimmed) panels at opacity 0.3.
 *
 * CSS values from vn-system.html section 03:
 * - Left/right panels: flex: 0 0 27%
 * - Center panel: flex: 1
 * - Silent panel character: opacity .28, filter grayscale(1)
 * - Active speaker bubble: bottom 35%, border-radius 4px (box class)
 * - Narration in center: bottom 14px
 */
export function ThreePanelFrame({ frame, pack, onAdvance, isMuted, onToggleMute }: ThreePanelFrameProps) {
  const leftPanel = frame.panels.find(p => p.id === 'left');
  const centerPanel = frame.panels.find(p => p.id === 'center');
  const rightPanel = frame.panels.find(p => p.id === 'right');
  const activePanel = frame.dialogue?.targetPanel;

  const dialogueTypewriter = useTypewriter(
    frame.dialogue?.text ?? '',
    !!frame.dialogue,
  );
  const narrationTypewriter = useTypewriter(
    frame.narration?.text ?? '',
    !!frame.narration,
  );

  const allDone = dialogueTypewriter.isDone && narrationTypewriter.isDone;

  const handleClick = useCallback(() => {
    if (allDone) {
      onAdvance();
    } else {
      dialogueTypewriter.skip();
      narrationTypewriter.skip();
    }
  }, [allDone, onAdvance, dialogueTypewriter, narrationTypewriter]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (allDone) {
          onAdvance();
        } else {
          dialogueTypewriter.skip();
          narrationTypewriter.skip();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [allDone, onAdvance, dialogueTypewriter, narrationTypewriter]);

  const renderSidePanel = (panel: VNPanel | undefined, side: 'left' | 'right') => {
    if (!panel) return null;
    const isActive = side === activePanel;
    const isSilent = panel.dimmed !== false && !isActive;
    const bg = resolveAsset(panel.backgroundAsset, pack);
    const char = panel.characterAsset ? resolveAsset(panel.characterAsset, pack) : null;

    return (
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 6, flex: '0 0 27%' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${bg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: isActive ? 'grayscale(.6) brightness(.4)' : 'grayscale(1) brightness(.22)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: isActive
              ? 'linear-gradient(to bottom, rgba(0,0,0,.08), rgba(0,0,0,.55))'
              : 'rgba(0,0,0,.45)',
          }}
        />
        {char && (
          <img
            src={char}
            alt=""
            style={{
              position: 'absolute',
              bottom: 0,
              left: '50%',
              transform: `translateX(-50%)${panel.characterFlipped ? ' scaleX(-1)' : ''}`,
              height: isActive ? '90%' : '85%',
              objectFit: 'contain',
              objectPosition: 'bottom',
              opacity: isSilent ? 0.28 : 1,
              filter: isSilent
                ? 'grayscale(1) drop-shadow(0 0 16px rgba(0,0,0,1))'
                : 'drop-shadow(0 0 24px rgba(0,0,0,.9))',
            }}
          />
        )}
        {/* Speech bubble on active side panel */}
        {isActive && frame.dialogue && !frame.dialogue.isNarrator && (
          <div
            style={{
              position: 'absolute',
              bottom: 14,
              left: 8,
              right: 8,
              zIndex: 10,
            }}
          >
            <div
              style={{
                background: 'rgba(0,0,0,.68)',
                border: '1px solid rgba(255,255,255,.12)',
                borderRadius: 4,
                padding: '10px 16px',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: '.22em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,198,70,.9)',
                  marginBottom: 6,
                }}
              >
                {frame.dialogue.speaker}
              </div>
              <p style={{ fontSize: 16, lineHeight: 1.5, color: 'rgba(255,255,255,.9)', letterSpacing: '.02em' }}>
                {dialogueTypewriter.displayedText}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderCenterPanel = () => {
    if (!centerPanel) return null;
    const bg = resolveAsset(centerPanel.backgroundAsset, pack);

    return (
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 6, flex: 1 }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${bg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'grayscale(.9) brightness(.32) blur(1px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to bottom, rgba(0,0,0,.5), rgba(0,0,0,.82))',
          }}
        />
        {/* Center narration */}
        {frame.narration && (
          <div style={{ position: 'absolute', bottom: 14, left: 12, right: 12, zIndex: 10 }}>
            <div
              style={{
                background: 'rgba(0,0,0,.65)',
                border: '1px solid rgba(255,255,255,.08)',
                borderRadius: 4,
                padding: '10px 22px',
                textAlign: 'left',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: '.22em',
                  textTransform: 'uppercase',
                  color: 'rgba(140,210,255,.7)',
                  marginBottom: 6,
                }}
              >
                NARRATOR
              </div>
              <p style={{ fontSize: 17, lineHeight: 1.5, color: 'rgba(255,255,255,.72)', letterSpacing: '.04em', textAlign: 'left' }}>
                {narrationTypewriter.displayedText}
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      onClick={handleClick}
      style={{
        display: 'grid',
        gridTemplateRows: '48px 1fr 52px',
        width: '100%',
        height: '100%',
        background: '#000',
        fontFamily: "VT323, 'Courier New', monospace",
        overflow: 'hidden',
        cursor: 'default',
      }}
    >
      {/* HUD */}
      {frame.hud ? (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 48 }}>
          <div style={{ fontSize: 13, letterSpacing: '.1em', color: 'rgba(255,255,255,.38)', lineHeight: 1.4 }}>
            {frame.hud.chapter}
            <small style={{ fontSize: 11, display: 'block', color: 'rgba(255,255,255,.2)' }}>{frame.hud.scene}</small>
          </div>
          {/* Center title */}
          <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', fontSize: 13, letterSpacing: '.22em', color: 'rgba(255,255,255,.2)' }}>
            {frame.hud.scene}
          </div>
          {frame.hud.showNav && (
            <div style={{ display: 'flex', gap: 20 }}>
              {['[ESC]', 'SAVE', 'LOAD', 'LOG', 'AUTO'].map(l => (
                <button key={l} onClick={() => {}} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, letterSpacing: '.1em', color: 'rgba(255,255,255,.16)', fontFamily: "VT323,'Courier New',monospace", padding: 0 }}>{l}</button>
              ))}
              <button onClick={(e) => { e.stopPropagation(); onToggleMute?.(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, letterSpacing: '.1em', color: 'rgba(255,255,255,.45)', fontFamily: "VT323,'Courier New',monospace", padding: 0 }}>
                {isMuted ? '[MUTED]' : '[SND]'}
              </button>
            </div>
          )}
        </div>
      ) : <div />}

      {/* Three panels */}
      <div style={{ display: 'flex', gap: 8, padding: '0 8px 8px', position: 'relative' }}>
        {renderSidePanel(leftPanel, 'left')}
        {renderCenterPanel()}
        {renderSidePanel(rightPanel, 'right')}
      </div>

      {/* Controls bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 52, padding: '0 20px' }}>
        <button
          onClick={(e) => { e.stopPropagation(); handleClick(); }}
          style={{
            background: 'none',
            border: '1px solid rgba(255,255,255,.1)',
            borderRadius: 3,
            padding: '5px 14px',
            fontSize: 13,
            letterSpacing: '.12em',
            color: 'rgba(255,255,255,.28)',
            fontFamily: "VT323, 'Courier New', monospace",
            cursor: 'pointer',
          }}
        >
          [SPACE] &nbsp;NEXT
        </button>
      </div>
    </div>
  );
}
