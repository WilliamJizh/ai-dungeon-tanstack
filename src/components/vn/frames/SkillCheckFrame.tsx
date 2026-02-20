import { useEffect } from 'react';
import type { VNFrame } from '../../../../server/vn/types/vnFrame';
import type { VNPackage } from '../../../../server/vn/types/vnTypes';
import { resolveAsset } from '../../../lib/resolveAsset';

interface SkillCheckFrameProps {
  frame: VNFrame;
  pack: VNPackage;
  onAdvance: () => void;
}

/**
 * Skill-check frame: dice roll overlay with stat card, DC bar, and outcome banner.
 *
 * Layout: full-screen darkened background with centered card showing roll result.
 * Click / Space to continue.
 */
export function SkillCheckFrame({ frame, pack, onAdvance }: SkillCheckFrameProps) {
  const sc = frame.skillCheck;
  const bg = resolveAsset(frame.panels[0]?.backgroundAsset, pack);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        onAdvance();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onAdvance]);

  if (!sc) return null;

  const succeeded = sc.succeeded;
  const resultColor = succeeded ? '#4ade80' : '#ef4444';

  return (
    <div
      onClick={onAdvance}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#000',
        fontFamily: "VT323, 'Courier New', monospace",
        overflow: 'hidden',
        cursor: 'default',
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
          filter: 'grayscale(.5) brightness(.4)',
        }}
      />
      {/* Gradient overlays */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(to bottom, rgba(0,0,0,.6) 0%, transparent 30%, transparent 70%, rgba(0,0,0,.6) 100%)',
        }}
      />

      {/* HUD */}
      {frame.hud && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 30,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 20px',
            height: 48,
          }}
        >
          <div
            style={{
              fontSize: 13,
              letterSpacing: '.1em',
              color: 'rgba(255,255,255,.38)',
              lineHeight: 1.4,
            }}
          >
            {frame.hud.chapter}
            <small
              style={{
                fontSize: 11,
                display: 'block',
                color: 'rgba(255,255,255,.2)',
              }}
            >
              {frame.hud.scene}
            </small>
          </div>
          <div
            style={{
              position: 'absolute',
              left: '50%',
              transform: 'translateX(-50%)',
              fontSize: 13,
              letterSpacing: '.22em',
              color: 'rgba(255,255,255,.2)',
            }}
          >
            {frame.hud.scene}
          </div>
          {frame.hud.showNav && (
            <div style={{ display: 'flex', gap: 20 }}>
              {['[ESC]', 'SAVE', 'LOAD', 'LOG', 'AUTO'].map((label) => (
                <button
                  key={label}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 11,
                    letterSpacing: '.1em',
                    color: 'rgba(255,255,255,.16)',
                    fontFamily: "VT323,'Courier New',monospace",
                    padding: 0,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Center card */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 420,
          background: 'rgba(0,0,0,.78)',
          border: '1px solid rgba(255,255,255,.14)',
          borderRadius: 6,
          padding: '28px 32px',
          zIndex: 20,
        }}
      >
        {/* Stat name header */}
        <div
          style={{
            textTransform: 'uppercase',
            fontSize: 20,
            letterSpacing: '.28em',
            color: 'rgba(255,255,255,.55)',
            marginBottom: 4,
            textAlign: 'center',
          }}
        >
          {sc.stat} CHECK
        </div>

        {/* Stat value */}
        <div
          style={{
            fontSize: 14,
            letterSpacing: '.2em',
            color: 'rgba(255,255,255,.35)',
            marginBottom: 20,
            textAlign: 'center',
            textTransform: 'uppercase',
          }}
        >
          {sc.stat.slice(0, 3).toUpperCase()} {sc.statValue}
        </div>

        {/* Dice display */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div
            style={{
              width: 160,
              height: 160,
              borderRadius: '50%',
              border: '2px solid rgba(255,255,255,.22)',
              background: 'rgba(255,255,255,.04)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: 80, color: '#fff', lineHeight: 1 }}>{sc.roll}</span>
          </div>
          {/* Modifier + total below circle */}
          <div
            style={{
              marginTop: 8,
              textAlign: 'center',
            }}
          >
            {sc.modifier != null && (
              <span
                style={{
                  fontSize: 14,
                  color: 'rgba(255,255,255,.45)',
                  letterSpacing: '.1em',
                }}
              >
                {sc.modifier >= 0 ? `+${sc.modifier}` : `${sc.modifier}`}
              </span>
            )}
            <span
              style={{
                fontSize: 18,
                color: 'rgba(255,255,255,.7)',
                marginLeft: 10,
                letterSpacing: '.1em',
              }}
            >
              = {sc.total}
            </span>
          </div>
        </div>

        {/* DC bar */}
        <div
          style={{
            marginTop: 20,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span
            style={{
              fontSize: 16,
              letterSpacing: '.18em',
              color: 'rgba(255,255,255,.45)',
            }}
          >
            DC {sc.difficulty}
          </span>
          <span
            style={{
              fontSize: 16,
              letterSpacing: '.18em',
              color: resultColor,
            }}
          >
            RESULT {sc.total}
          </span>
        </div>

        {/* Divider */}
        <div
          style={{
            borderTop: '1px solid rgba(255,255,255,.08)',
            marginTop: 12,
            marginBottom: 12,
          }}
        />

        {/* Outcome banner */}
        <div
          style={{
            width: '100%',
            padding: '6px 0',
            textAlign: 'center',
            borderRadius: 3,
            fontSize: 22,
            letterSpacing: '.3em',
            background: succeeded
              ? 'rgba(74,222,128,.15)'
              : 'rgba(239,68,68,.15)',
            border: succeeded
              ? '1px solid rgba(74,222,128,.3)'
              : '1px solid rgba(239,68,68,.3)',
            color: resultColor,
          }}
        >
          {succeeded ? '\u2713  SUCCESS' : '\u2717  FAILURE'}
        </div>

        {/* Description */}
        {sc.description && (
          <div
            style={{
              marginTop: 14,
              fontSize: 14,
              color: 'rgba(255,255,255,.38)',
              letterSpacing: '.06em',
              lineHeight: 1.5,
              fontStyle: 'italic',
              textAlign: 'center',
            }}
          >
            {sc.description}
          </div>
        )}

        {/* Continue hint */}
        <div
          style={{
            marginTop: 20,
            textAlign: 'center',
            fontSize: 12,
            letterSpacing: '.22em',
            color: 'rgba(255,255,255,.22)',
          }}
        >
          SPACE / CLICK TO CONTINUE
        </div>
      </div>
    </div>
  );
}
