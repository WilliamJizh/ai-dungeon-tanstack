import { useCallback, useEffect, useRef, useState } from 'react';
import DiceBox from '@3d-dice/dice-box';
import type { DieResult } from '@3d-dice/dice-box';
import type { VNFrame } from '../../../../server/vn/types/vnFrame';
import type { VNPackage } from '../../../../server/vn/types/vnTypes';
import { resolveAsset } from '../../../lib/resolveAsset';
import { t } from '../../../lib/i18n';
import { useLocale } from '../../../context/LocaleContext';
import { FONT_MAIN } from '../../../lib/fonts';

interface DiceRollFrameProps {
  frame: VNFrame;
  pack: VNPackage;
  onAdvance: () => void;
  onDiceResult?: (value: number) => void;
}

const TRANSITION = 'opacity 0.45s ease';

/**
 * Dice-roll frame — no card, just floating UI over a full-frame dice canvas.
 *
 * dice-box appends its canvas to document.body; after init() we reparent it
 * into #vn-dice-roll-box so physics stay correct and dice are contained.
 *
 * Layer order:
 *   z:1  background image
 *   z:2  gradient
 *   z:10 #vn-dice-roll-box  — full-frame, canvas lives here after reparent
 *   z:25 floating header    — title + notation, top-center
 *   z:25 floating footer    — result / loading dots, bottom-center
 *   z:30 HUD
 */
export function DiceRollFrame({ frame, pack, onAdvance, onDiceResult }: DiceRollFrameProps) {
  const { locale } = useLocale();
  const dr = frame.diceRoll;
  const bg = resolveAsset(frame.panels[0]?.backgroundAsset, pack);
  const [diceSettled, setDiceSettled] = useState(false);
  const [rolledValue, setRolledValue] = useState<number | null>(null);
  const diceBoxRef = useRef<DiceBox | null>(null);

  const handleAdvance = useCallback(() => {
    if (diceSettled) {
      if (rolledValue != null) onDiceResult?.(rolledValue);
      onAdvance();
    }
  }, [diceSettled, rolledValue, onDiceResult, onAdvance]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space' && diceSettled) {
        e.preventDefault();
        handleAdvance();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleAdvance, diceSettled]);

  useEffect(() => {
    if (!dr) return;
    let destroyed = false;

    // Clean up any stray canvases from previous hot-reloads or React 18 strict mode
    const cleanupCanvases = () => {
      document.querySelectorAll('#vn-dice-roll-canvas').forEach(el => el.remove());
    };
    cleanupCanvases();

    const box = new DiceBox({
      container: '#vn-dice-roll-box',
      assetPath: '/assets/dice-box/',
      id: 'vn-dice-roll-canvas',
      scale: 15, // larger dice size
      gravity: 1,
      mass: 1,
      friction: 0.8,
      restitution: 0,
      angularDamping: 0.4,
      linearDamping: 0.4,
      spinForce: 5,
      throwForce: 4,
      startingHeight: 6,
      settleTimeout: 5000,
      offscreen: false,
      theme: 'default',
      themeColor: '#c0a060',
    });

    diceBoxRef.current = box;

    box.init().then(() => {
      if (destroyed) return;

      // dice-box appends its canvas to document.body — reparent into our container
      const canvas = document.getElementById('vn-dice-roll-canvas') as HTMLCanvasElement | null;
      const containerEl = document.getElementById('vn-dice-roll-box');
      if (canvas && containerEl) {
        containerEl.appendChild(canvas);
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';

        // Force the engine to recognize the new container size instead of 0x0
        setTimeout(() => {
          if (!destroyed) window.dispatchEvent(new Event('resize'));
        }, 50);
      }

      box.onRollComplete = (results: DieResult[]) => {
        if (destroyed) return;
        const physicsResult = results.reduce((sum, r) => sum + (r.value ?? 0), 0);
        setRolledValue(dr.roll ?? physicsResult);
        setDiceSettled(true);
      };

      // Delay roll slightly to ensure resize has applied
      setTimeout(() => {
        if (!destroyed) box.roll(dr.diceNotation);
      }, 100);
    });

    return () => {
      destroyed = true;
      try { box.clear(); } catch { /* ignore */ }
      cleanupCanvases();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!dr) return null;

  const label = dr.description
    ? dr.description.toUpperCase()
    : `ROLLING ${dr.diceNotation.toUpperCase()}`;

  return (
    <div
      onClick={handleAdvance}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#000',
        fontFamily: FONT_MAIN,
        overflow: 'hidden',
        cursor: diceSettled ? 'default' : 'wait',
      }}
    >
      {/* z:1 — background image */}
      {bg && (
        <div
          style={{
            position: 'absolute', inset: 0, zIndex: 1,
            backgroundImage: `url(${bg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'grayscale(.4) brightness(.3)',
          }}
        />
      )}

      {/* z:2 — gradient */}
      <div
        style={{
          position: 'absolute', inset: 0, zIndex: 2,
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,.1) 0%, rgba(0,0,0,.55) 100%)',
        }}
      />

      {/* z:10 — card container */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            width: 420,
            height: 480,
            background: 'rgba(0,0,0,.82)',
            border: '1px solid rgba(255,255,255,.14)',
            borderRadius: 6,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            pointerEvents: 'auto',
          }}
        >
          {/* Card header */}
          <div style={{
            padding: '28px 0',
            textAlign: 'center',
            background: 'transparent',
            borderBottom: '1px solid rgba(255,255,255,.08)'
          }}>
            <div style={{ fontSize: 16, letterSpacing: '.25em', color: 'rgba(255,255,255,.55)', textTransform: 'uppercase' }}>
              {label}
            </div>
            <div style={{ fontSize: 13, letterSpacing: '.2em', color: 'rgba(255,255,255,.35)', marginTop: 8 }}>
              {dr.diceNotation.toUpperCase()}
            </div>
          </div>

          {/* Dice Canvas Container */}
          <div style={{ flex: 1, position: 'relative' }}>
            <div id="vn-dice-roll-box" style={{ position: 'absolute', inset: 0 }} />
          </div>

          {/* Card footer */}
          <div style={{
            height: 100,
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderTop: '1px solid rgba(255,255,255,.08)',
            background: 'transparent'
          }}>
            {/* Loading dots */}
            <div
              style={{
                position: 'absolute',
                opacity: diceSettled ? 0 : 1,
                transition: TRANSITION,
                fontSize: 13,
                letterSpacing: '.28em',
                color: 'rgba(255,255,255,.28)',
                textShadow: '0 1px 8px rgba(0,0,0,.9)',
                animation: diceSettled ? 'none' : 'diceRollPulse 1.4s ease-in-out infinite',
              }}
            >
              ···
            </div>

            {/* Result */}
            <div
              style={{
                position: 'absolute',
                opacity: diceSettled ? 1 : 0,
                transition: TRANSITION,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
                <span style={{ fontSize: 13, letterSpacing: '.28em', color: 'rgba(255,255,255,.55)', textTransform: 'uppercase', textShadow: '0 1px 8px rgba(0,0,0,.9)' }}>
                  {t('rolled_label', locale)}
                </span>
                <span
                  style={{
                    fontSize: 42,
                    lineHeight: 1,
                    letterSpacing: '-.01em',
                    color: '#c0a060',
                    textShadow: '0 0 32px rgba(192,160,96,.7), 0 2px 16px rgba(0,0,0,.9)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {rolledValue ?? 0}
                </span>
              </div>
              <div style={{ fontSize: 11, letterSpacing: '.22em', color: 'rgba(255,255,255,.28)', textShadow: '0 1px 8px rgba(0,0,0,.9)' }}>
                {t('continue_hint', locale)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* z:30 — HUD */}
      {frame.hud && (
        <div
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0,
            zIndex: 30,
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
          <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', fontSize: 13, letterSpacing: '.22em', color: 'rgba(255,255,255,.2)' }}>
            {frame.hud.scene}
          </div>
          {frame.hud.showNav && (
            <div style={{ display: 'flex', gap: 20 }}>
              {['[ESC]', 'SAVE', 'LOAD', 'LOG', 'AUTO'].map((lbl) => (
                <button
                  key={lbl}
                  onClick={(e) => e.stopPropagation()}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, letterSpacing: '.1em', color: 'rgba(255,255,255,.16)', fontFamily: FONT_MAIN, padding: 0 }}
                >
                  {lbl}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes diceRollPulse {
          0%, 100% { opacity: 0.18; }
          50%       { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
