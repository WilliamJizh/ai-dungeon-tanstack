import { useCallback, useEffect } from 'react';
import type { VNFrame } from '../../../../server/vn/types/vnFrame';
import type { VNPackage } from '../../../../server/vn/types/vnTypes';
import { resolveAsset } from '../../../lib/resolveAsset';
import { useTypewriter } from '../hooks/useTypewriter';

interface FullScreenFrameProps {
  frame: VNFrame;
  pack: VNPackage;
  onAdvance: () => void;
  isMuted?: boolean;
  onToggleMute?: () => void;
}

/**
 * Full-screen frame: single background panel with optional character,
 * narration box bottom-center, HUD top bar.
 *
 * CSS values from vn-system.html section 01:
 * - HUD: height 48px, chapter left, scene right
 * - Narration box: .box-narr — bg rgba(0,0,0,.65), border 1px solid rgba(255,255,255,.08), border-radius 4px
 * - Narrator label: color rgba(140,210,255,.7)
 * - Text: font-size 20px, color rgba(255,255,255,.78)
 * - Controls bar: height 52px
 * - Font: VT323
 */
export function FullScreenFrame({ frame, pack, onAdvance, isMuted, onToggleMute }: FullScreenFrameProps) {
  const panel = frame.panels[0];
  const isDimmed = panel?.dimmed !== false; // atmospheric by default; false = prominent character
  const bg = resolveAsset(panel?.backgroundAsset, pack);
  const char = panel?.characterAsset ? resolveAsset(panel.characterAsset, pack) : null;

  const narrationTypewriter = useTypewriter(
    frame.narration?.text ?? '',
    !!frame.narration,
  );
  const dialogueTypewriter = useTypewriter(
    frame.dialogue?.text ?? '',
    !!frame.dialogue,
  );

  const allDone = narrationTypewriter.isDone && dialogueTypewriter.isDone;

  const handleClick = useCallback(() => {
    if (allDone) {
      onAdvance();
    } else {
      narrationTypewriter.skip();
      dialogueTypewriter.skip();
    }
  }, [allDone, onAdvance, narrationTypewriter, dialogueTypewriter]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (allDone) {
          onAdvance();
        } else {
          narrationTypewriter.skip();
          dialogueTypewriter.skip();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [allDone, onAdvance, narrationTypewriter, dialogueTypewriter]);

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
      {/* HUD — 48px top bar */}
      {frame.hud ? (
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 20px',
            height: 48,
          }}
        >
          <div style={{ fontSize: 13, letterSpacing: '.1em', color: 'rgba(255,255,255,.38)', lineHeight: 1.4 }}>
            {frame.hud.chapter}
            <small style={{ fontSize: 11, display: 'block', color: 'rgba(255,255,255,.2)' }}>
              {frame.hud.scene}
            </small>
          </div>
          {/* Center title */}
          <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', fontSize: 13, letterSpacing: '.22em', color: 'rgba(255,255,255,.2)' }}>
            {frame.hud.scene}
          </div>
          {frame.hud.showNav && (
            <div style={{ display: 'flex', gap: 20 }}>
              {['[ESC]', 'SAVE', 'LOAD', 'LOG', 'AUTO'].map(label => (
                <button key={label} onClick={() => {}} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, letterSpacing: '.1em', color: 'rgba(255,255,255,.16)', fontFamily: "VT323,'Courier New',monospace", padding: 0 }}>
                  {label}
                </button>
              ))}
              <button onClick={(e) => { e.stopPropagation(); onToggleMute?.(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, letterSpacing: '.1em', color: 'rgba(255,255,255,.45)', fontFamily: "VT323,'Courier New',monospace", padding: 0 }}>
                {isMuted ? '[MUTED]' : '[SND]'}
              </button>
            </div>
          )}
        </div>
      ) : <div />}

      {/* Main panel */}
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        {/* Background */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${bg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: isDimmed ? 'grayscale(1) brightness(.28)' : 'grayscale(.4) brightness(.52)',
          }}
        />
        {/* Gradient overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to bottom, rgba(0,0,0,.2), rgba(0,0,0,.55))',
          }}
        />

        {/* Character */}
        {char && (
          <img
            src={char}
            alt=""
            style={{
              position: 'absolute',
              bottom: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              height: '80%',
              objectFit: 'contain',
              objectPosition: 'bottom',
              opacity: isDimmed ? 0.22 : 0.88,
              filter: isDimmed
                ? 'grayscale(1) drop-shadow(0 0 20px rgba(0,0,0,1))'
                : 'drop-shadow(0 0 32px rgba(0,0,0,.85))',
            }}
          />
        )}

        {/* Narration box — bottom-center */}
        {frame.narration && (
          <div
            style={{
              position: 'absolute',
              bottom: 14,
              left: '50%',
              transform: 'translateX(-50%)',
              width: '70%',
              maxWidth: 780,
              zIndex: 20,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                background: 'rgba(0,0,0,.65)',
                border: '1px solid rgba(255,255,255,.08)',
                borderRadius: 4,
                padding: '10px 22px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: '.22em',
                  textTransform: 'uppercase',
                  color: 'rgba(140,210,255,.7)',
                  marginBottom: 6,
                  textAlign: 'left',
                }}
              >
                NARRATOR
              </div>
              <p
                style={{
                  fontSize: 20,
                  lineHeight: 1.68,
                  color: 'rgba(255,255,255,.78)',
                  letterSpacing: '.04em',
                  textAlign: 'left',
                }}
              >
                {narrationTypewriter.displayedText}
              </p>
            </div>
          </div>
        )}

        {/* Dialogue — if present instead of narration */}
        {frame.dialogue && (
          <div
            style={{
              position: 'absolute',
              bottom: 14,
              left: '50%',
              transform: 'translateX(-50%)',
              width: '70%',
              maxWidth: 780,
              zIndex: 20,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                background: 'rgba(0,0,0,.65)',
                border: '1px solid rgba(255,255,255,.08)',
                borderRadius: 4,
                padding: '10px 22px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: '.22em',
                  textTransform: 'uppercase',
                  color: frame.dialogue.isNarrator ? 'rgba(140,210,255,.7)' : 'rgba(255,198,70,.9)',
                  marginBottom: 6,
                  textAlign: 'left',
                }}
              >
                {frame.dialogue.speaker}
              </div>
              <p
                style={{
                  fontSize: 20,
                  lineHeight: 1.68,
                  color: 'rgba(255,255,255,.78)',
                  letterSpacing: '.04em',
                  textAlign: 'left',
                }}
              >
                {dialogueTypewriter.displayedText}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Controls bar — 52px */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 52,
          padding: '0 20px',
        }}
      >
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
