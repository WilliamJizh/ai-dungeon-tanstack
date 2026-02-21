import { useCallback, useEffect } from 'react';
import type { VNFrame, VNPanel } from '../../../../server/vn/types/vnFrame';
import type { VNPackage } from '../../../../server/vn/types/vnTypes';
import { resolveAsset } from '../../../lib/resolveAsset';
import { useTypewriter } from '../hooks/useTypewriter';
import { FONT_MAIN } from '../../../lib/fonts';
import { t } from '../../../lib/i18n';
import { useLocale } from '../../../context/LocaleContext';

interface DialogueFrameProps {
  frame: VNFrame;
  pack: VNPackage;
  onAdvance: () => void;
  isMuted?: boolean;
  onToggleMute?: () => void;
}

/**
 * 2-Panel dialogue frame with accordion layout.
 *
 * CSS values from vn-system.html section 02 / 06:
 * - Active panel:  flex: 0 0 62%, filter: none, character opacity: 1
 * - Inactive panel: flex: 0 0 38%, filter: grayscale(1) brightness(.22), character opacity: 0.28
 * - Transition: all 0.35s ease
 * - Speech bubble: bg rgba(0,0,0,.68), border 1px solid rgba(255,255,255,.12), border-radius 8px
 * - Character name: color rgba(255,198,70,.9)
 * - Narrator label: color rgba(140,210,255,.7)
 * - characterFlipped=true -> transform: scaleX(-1) on img
 */
export function DialogueFrame({ frame, pack, onAdvance, isMuted, onToggleMute }: DialogueFrameProps) {
  const { locale } = useLocale();
  const leftPanel = frame.panels.find(p => p.id === 'left');
  const rightPanel = frame.panels.find(p => p.id === 'right');
  const activePanel = frame.dialogue?.targetPanel ?? 'right';

  const dialogueTypewriter = useTypewriter(
    frame.dialogue?.text ?? '',
    !!frame.dialogue,
  );
  const narrationTypewriter = useTypewriter(
    frame.narration?.text ?? '',
    !!frame.narration || !!frame.dialogue?.isNarrator,
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

  const renderPanel = (panel: VNPanel | undefined, side: 'left' | 'right') => {
    if (!panel) return null;
    const isActive = side === activePanel;
    const bg = resolveAsset(panel.backgroundAsset, pack);
    const char = panel.characterAsset ? resolveAsset(panel.characterAsset, pack) : null;

    return (
      <div
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 6,
          flex: isActive ? '0 0 62%' : '0 0 38%',
          transition: 'all 0.35s ease',
        }}
      >
        {/* Background */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url(${bg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: isActive ? 'grayscale(.6) brightness(.42)' : 'grayscale(1) brightness(.22)',
          }}
        />
        {/* Overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: isActive
              ? 'linear-gradient(to bottom, rgba(0,0,0,.08), rgba(0,0,0,.52))'
              : 'rgba(0,0,0,.32)',
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
              transform: `translateX(-50%)${panel.characterFlipped ? ' scaleX(-1)' : ''}`,
              height: isActive ? '92%' : '88%',
              objectFit: 'contain',
              objectPosition: 'bottom',
              opacity: isActive ? 1 : 0.28,
              filter: isActive
                ? 'drop-shadow(0 0 28px rgba(0,0,0,.9))'
                : 'grayscale(1) drop-shadow(0 0 16px rgba(0,0,0,1))',
              transition: 'all 0.35s ease',
            }}
          />
        )}

        {/* Panel label */}
        <div
          style={{
            position: 'absolute',
            bottom: 10,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: 11,
            letterSpacing: '.22em',
            textTransform: 'uppercase',
            color: isActive ? 'rgba(255,255,255,.45)' : 'rgba(255,255,255,.25)',
            pointerEvents: 'none',
            zIndex: 20,
          }}
        >
          {isActive ? t('active_status', locale) : t('inactive_status', locale)}
        </div>

        {/* Speech bubble — anchored at bottom of active panel so it never covers the face */}
        {isActive && frame.dialogue && !frame.dialogue.isNarrator && (
          <div
            style={{
              position: 'absolute',
              bottom: 28,
              left: 12,
              right: 12,
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
              <p style={{ fontSize: 18, lineHeight: 1.5, color: 'rgba(255,255,255,.9)', letterSpacing: '.02em' }}>
                {dialogueTypewriter.displayedText}
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
        fontFamily: FONT_MAIN,
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
                <button key={l} onClick={() => {}} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, letterSpacing: '.1em', color: 'rgba(255,255,255,.16)', fontFamily: FONT_MAIN, padding: 0 }}>{l}</button>
              ))}
              <button onClick={(e) => { e.stopPropagation(); onToggleMute?.(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, letterSpacing: '.1em', color: 'rgba(255,255,255,.45)', fontFamily: FONT_MAIN, padding: 0 }}>
                {isMuted ? t('muted', locale) : t('sound', locale)}
              </button>
            </div>
          )}
        </div>
      ) : <div />}

      {/* Panels */}
      <div style={{ position: 'relative', display: 'flex', gap: 8, padding: '0 8px 8px' }}>
        {renderPanel(leftPanel, 'left')}
        {renderPanel(rightPanel, 'right')}

        {/* Narration bar — bottom-center overlay, narrator dialogue or narration block */}
        {(frame.narration || (frame.dialogue?.isNarrator)) && (
          <div
            style={{
              position: 'absolute',
              bottom: 10,
              left: '50%',
              transform: 'translateX(-50%)',
              width: '56%',
              maxWidth: 620,
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
                {frame.dialogue?.isNarrator ? frame.dialogue.speaker : t('narrator', locale)}
              </div>
              <p style={{ fontSize: 18, lineHeight: 1.5, color: 'rgba(255,255,255,.9)', letterSpacing: '.02em' }}>
                {narrationTypewriter.displayedText}
              </p>
            </div>
          </div>
        )}
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
            fontFamily: FONT_MAIN,
            cursor: 'pointer',
          }}
        >
          {t('next_hint', locale)}
        </button>
      </div>
    </div>
  );
}
