import { useEffect, useRef, useState } from 'react';
import type { VNFrame } from '../../../../server/vn/types/vnFrame';
import type { VNPackage } from '../../../../server/vn/types/vnTypes';
import { resolveAsset } from '../../../lib/resolveAsset';
import { FONT_MAIN } from '../../../lib/fonts';
import { t } from '../../../lib/i18n';
import { useLocale } from '../../../context/LocaleContext';

interface ChoiceFrameProps {
  frame: VNFrame;
  pack: VNPackage;
  onAdvance: () => void;
  onChoiceSelect?: (choiceId: string) => void;
  onFreeTextSubmit?: (text: string) => void;
  isMuted?: boolean;
  onToggleMute?: () => void;
}

/**
 * Choice frame: 2-panel layout with choice list and keyboard navigation.
 *
 * CSS values from vn-system.html section 04:
 * - Choice buttons: bg rgba(0,0,0,.68), border 1px solid rgba(255,255,255,.1),
 *   border-radius 4px, padding 9px 16px, font-size 16px
 * - Selected: bg rgba(255,255,255,.1), border-color rgba(255,255,255,.28), color #fff
 * - Input row: width 44%, max-width 500px, bg rgba(0,0,0,.8), border 1px solid rgba(255,255,255,.12)
 * - Keyboard: up/down arrows navigate, Enter selects
 */
export function ChoiceFrame({ frame, pack, onAdvance, onChoiceSelect, onFreeTextSubmit, isMuted, onToggleMute }: ChoiceFrameProps) {
  const { locale } = useLocale();
  const choices = frame.choices ?? [];
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [freeText, setFreeText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const leftPanel = frame.panels.find(p => p.id === 'left');
  const rightPanel = frame.panels.find(p => p.id === 'right') ?? frame.panels.find(p => p.id === 'center');
  const leftBg = resolveAsset(leftPanel?.backgroundAsset, pack);
  const rightBg = resolveAsset(rightPanel?.backgroundAsset, pack);
  const leftChar = leftPanel?.characterAsset ? resolveAsset(leftPanel.characterAsset, pack) : null;
  const rightChar = rightPanel?.characterAsset ? resolveAsset(rightPanel.characterAsset, pack) : null;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't handle arrows/enter if input is focused
      if (document.activeElement === inputRef.current) {
        if (e.key === 'Enter' && freeText.trim()) {
          e.preventDefault();
          onFreeTextSubmit?.(freeText.trim());
        }
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(0, i - 1));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(choices.length - 1, i + 1));
      } else if (e.key === 'Enter' && choices.length > 0) {
        e.preventDefault();
        onChoiceSelect?.(choices[selectedIndex].id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [choices, selectedIndex, freeText, onChoiceSelect, onFreeTextSubmit]);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateRows: '48px 1fr 52px',
        width: '100%',
        height: '100%',
        background: '#000',
        fontFamily: FONT_MAIN,
        overflow: 'hidden',
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
              <button onClick={() => onToggleMute?.()} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, letterSpacing: '.1em', color: 'rgba(255,255,255,.45)', fontFamily: FONT_MAIN, padding: 0 }}>
                {isMuted ? t('muted', locale) : t('sound', locale)}
              </button>
            </div>
          )}
        </div>
      ) : <div />}

      {/* Panels */}
      <div style={{ display: 'flex', gap: 8, padding: '0 8px 8px', position: 'relative' }}>
        {/* Left panel — dim */}
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 6, flex: '0 0 42%' }}>
          <div
            style={{
              position: 'absolute', inset: 0,
              backgroundImage: `url(${leftBg})`,
              backgroundSize: 'cover', backgroundPosition: 'center',
              filter: 'grayscale(1) brightness(.22)',
            }}
          />
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)' }} />
          {leftChar && (
            <img
              src={leftChar}
              alt=""
              style={{
                position: 'absolute', bottom: 0, left: '50%',
                transform: `translateX(-50%)${leftPanel?.characterFlipped ? ' scaleX(-1)' : ''}`,
                height: '88%', objectFit: 'contain', objectPosition: 'bottom',
                opacity: 0.28,
                filter: 'grayscale(1) drop-shadow(0 0 16px rgba(0,0,0,1))',
              }}
            />
          )}
        </div>

        {/* Right panel — choices overlay */}
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 6, flex: 1 }}>
          <div
            style={{
              position: 'absolute', inset: 0,
              backgroundImage: `url(${rightBg})`,
              backgroundSize: 'cover', backgroundPosition: 'center',
              filter: 'grayscale(.8) brightness(.35)',
            }}
          />
          <div
            style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(to bottom, rgba(0,0,0,.1), rgba(0,0,0,.65))',
            }}
          />
          {rightChar && (
            <img
              src={rightChar}
              alt=""
              style={{
                position: 'absolute', bottom: 0, left: '50%',
                transform: `translateX(-50%)${rightPanel?.characterFlipped ? ' scaleX(-1)' : ''}`,
                height: '92%', objectFit: 'contain', objectPosition: 'bottom',
                opacity: 0.5,
                filter: 'drop-shadow(0 0 28px rgba(0,0,0,.9))',
              }}
            />
          )}

          {/* Choice buttons — bottom of right panel */}
          <div
            style={{
              position: 'absolute',
              bottom: 8,
              left: 8,
              right: 8,
              zIndex: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {choices.map((choice, i) => {
              const isSelected = i === selectedIndex;
              return (
                <button
                  key={choice.id}
                  onClick={() => {
                    setSelectedIndex(i);
                    onChoiceSelect?.(choice.id);
                  }}
                  style={{
                    background: isSelected ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.68)',
                    border: `1px solid ${isSelected ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.1)'}`,
                    borderRadius: 4,
                    padding: '9px 16px',
                    fontSize: 16,
                    letterSpacing: '.08em',
                    color: isSelected ? '#fff' : 'rgba(255,255,255,.8)',
                    fontFamily: FONT_MAIN,
                    textAlign: 'left',
                    cursor: 'pointer',
                    width: '100%',
                  }}
                >
                  {'\u25B8'}&nbsp;&nbsp;{choice.text}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Controls bar — input row or space button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 52, padding: '0 20px' }}>
        {frame.showFreeTextInput ? (
          <div
            style={{
              display: 'flex',
              width: '44%',
              maxWidth: 500,
              background: 'rgba(0,0,0,.8)',
              border: '1px solid rgba(255,255,255,.12)',
              borderRadius: 3,
              overflow: 'hidden',
            }}
          >
            <input
              ref={inputRef}
              type="text"
              placeholder={t('free_text_placeholder', locale)}
              value={freeText}
              onChange={e => setFreeText(e.target.value)}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'rgba(255,255,255,.85)',
                padding: '0 14px',
                fontSize: 15,
                letterSpacing: '.1em',
                fontFamily: FONT_MAIN,
              }}
            />
            <button
              onClick={() => {
                if (freeText.trim()) onFreeTextSubmit?.(freeText.trim());
              }}
              style={{
                background: 'rgba(255,255,255,.08)',
                border: 'none',
                borderLeft: '1px solid rgba(255,255,255,.1)',
                padding: '0 16px',
                color: 'rgba(255,255,255,.45)',
                fontSize: 16,
                cursor: 'pointer',
                fontFamily: FONT_MAIN,
              }}
            >
              {'\u25B6'}
            </button>
          </div>
        ) : (
          <button
            onClick={onAdvance}
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
        )}
      </div>
    </div>
  );
}
