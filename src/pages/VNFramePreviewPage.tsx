import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useLocale } from '../context/LocaleContext';
import { useScaleManager } from '../hooks/useScaleManager';
import { FullScreenFrame } from '../components/vn/frames/FullScreenFrame';
import { DialogueFrame }   from '../components/vn/frames/DialogueFrame';
import { ThreePanelFrame } from '../components/vn/frames/ThreePanelFrame';
import { ChoiceFrame }     from '../components/vn/frames/ChoiceFrame';
import { BattleFrame }     from '../components/vn/frames/BattleFrame';
import { SkillCheckFrame } from '../components/vn/frames/SkillCheckFrame';
import { InventoryFrame }  from '../components/vn/frames/InventoryFrame';
import { MapFrame }        from '../components/vn/frames/MapFrame';
import { FrameEffects }    from '../components/vn/FrameEffects';
import { MOCK_PACK, PREVIEW_GROUPS } from '../lib/mockVNData';
import type { VNFrame }    from '../../server/vn/types/vnFrame';

export function VNFramePreviewPage() {
  const { locale, setLocale } = useLocale();
  const [groupIdx,   setGroupIdx]   = useState(0);
  const [variantIdx, setVariantIdx] = useState(0);

  // Reset variant when group changes
  useEffect(() => { setVariantIdx(0); }, [groupIdx]);

  const group   = PREVIEW_GROUPS[groupIdx];
  const variant = group.variants[variantIdx];

  // Cycle to next variant on advance
  const handleAdvance = useCallback(() => {
    setVariantIdx(i => (i + 1) % group.variants.length);
  }, [group.variants.length]);

  // Ref used for FrameEffects
  const frameContainerRef = useRef<HTMLDivElement>(null!);

  // Scale the 16:9 canvas inside the right panel
  const { containerRef, canvasStyle } = useScaleManager({
    baseWidth: 1144,
    baseHeight: 644,
    mode: 'fit',
    maxScale: 1,
  });

  const renderFrame = (frame: VNFrame) => {
    const common = {
      frame,
      pack: MOCK_PACK,
      onAdvance: handleAdvance,
      isMuted: true,
      onToggleMute: () => {},
    };

    switch (frame.type) {
      case 'full-screen':
        return <FullScreenFrame {...common} />;
      case 'dialogue':
        if (
          frame.dialogue?.targetPanel === 'center'
          || !frame.panels.some(p => p.id === 'left' || p.id === 'right')
        ) {
          return <FullScreenFrame {...common} />;
        }
        return <DialogueFrame {...common} />;
      case 'three-panel':
        return <ThreePanelFrame {...common} />;
      case 'choice':
        return (
          <ChoiceFrame
            {...common}
            onChoiceSelect={(_id) => handleAdvance()}
            onFreeTextSubmit={(_text) => handleAdvance()}
          />
        );
      case 'battle':
        return <BattleFrame {...common} onChoiceSelect={(_id) => handleAdvance()} />;
      case 'skill-check':
        return <SkillCheckFrame {...common} />;
      case 'inventory':
        return (
          <InventoryFrame
            {...common}
            onChoiceSelect={(_id) => handleAdvance()}
          />
        );
      case 'map':
        return (
          <MapFrame
            {...common}
            onChoiceSelect={(_id) => handleAdvance()}
          />
        );
      case 'character-sheet':
        return <FullScreenFrame {...common} />;
      default:
        return <FullScreenFrame {...common} />;
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        width: '100vw',
        height: '100vh',
        background: '#050505',
        fontFamily: "VT323, 'Courier New', monospace",
        overflow: 'hidden',
      }}
    >
      {/* ── Sidebar ──────────────────────────────────────────────────────────── */}
      <div
        style={{
          width: 212,
          height: '100vh',
          flexShrink: 0,
          borderRight: '1px solid rgba(255,255,255,.07)',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 16px 14px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
          <div style={{ fontSize: 10, letterSpacing: '.44em', color: 'rgba(255,255,255,.28)', marginBottom: 2 }}>
            DESIGN SYSTEM
          </div>
          <div style={{ fontSize: 20, letterSpacing: '.22em', color: 'rgba(255,255,255,.82)' }}>
            VN FRAMES
          </div>
        </div>

        {/* Groups + Variants */}
        <div style={{ flex: 1, padding: '8px 0' }}>
          {PREVIEW_GROUPS.map((g, gi) => (
            <div key={g.label} style={{ marginBottom: 4 }}>
              {/* Group label */}
              <div
                style={{
                  padding: '10px 16px 4px',
                  fontSize: 10,
                  letterSpacing: '.44em',
                  color: 'rgba(255,255,255,.32)',
                }}
              >
                {g.label}
              </div>

              {/* Variants */}
              {g.variants.map((v, vi) => {
                const active = gi === groupIdx && vi === variantIdx;
                return (
                  <button
                    key={v.label}
                    onClick={() => { setGroupIdx(gi); setVariantIdx(vi); }}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '5px 16px 5px 28px',
                      background: active ? 'rgba(255,255,255,.06)' : 'none',
                      border: 'none',
                      borderLeft: `2px solid ${active ? 'rgba(255,255,255,.35)' : 'transparent'}`,
                      cursor: 'pointer',
                      fontSize: 15,
                      letterSpacing: '.1em',
                      color: active ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.36)',
                      fontFamily: "VT323, 'Courier New', monospace",
                    }}
                  >
                    {active ? '▸' : '·'}&nbsp;&nbsp;{v.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,.07)' }}>
          <div style={{ fontSize: 10, letterSpacing: '.22em', color: 'rgba(255,255,255,.2)', marginBottom: 10, lineHeight: 1.6 }}>
            SPACE / CLICK FRAME<br />
            → NEXT VARIANT
          </div>
          <Link
            to="/vn"
            style={{ fontSize: 13, letterSpacing: '.16em', color: 'rgba(255,255,255,.28)', textDecoration: 'none' }}
          >
            ← VN HOME
          </Link>
          <button
            onClick={() => setLocale(locale === 'en' ? 'zh-CN' : 'en')}
            style={{
              display: 'block',
              marginTop: 12,
              fontSize: 14,
              letterSpacing: '.2em',
              color: 'rgba(255,255,255,.5)',
              background: 'none',
              border: '1px solid rgba(255,255,255,.15)',
              borderRadius: 3,
              padding: '5px 12px',
              cursor: 'pointer',
              fontFamily: "VT323, 'Courier New', monospace",
              width: '100%',
              textAlign: 'left' as const,
            }}
          >
            {locale === 'en' ? '中文 ZH-CN' : 'ENGLISH EN'}
          </button>
        </div>
      </div>

      {/* ── Canvas area ──────────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          height: '100vh',
          position: 'relative',
          overflow: 'hidden',
          background: '#0a0a0a',
        }}
      >
        {/* Scaled 16:9 frame */}
        <div
          style={{
            ...canvasStyle,
            position: 'absolute',
            top: '50%',
            left: '50%',
            transformOrigin: 'center center',
          }}
        >
          {/* key resets component state (typewriter) when variant switches */}
          <div
            key={`${groupIdx}-${variantIdx}`}
            ref={frameContainerRef}
            style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
          >
            {renderFrame(variant.frame)}
            <FrameEffects
              effects={variant.frame.effects ?? []}
              containerRef={frameContainerRef}
            />
          </div>
        </div>

        {/* Variant badge — bottom-right of canvas area */}
        <div
          style={{
            position: 'absolute',
            bottom: 14,
            right: 18,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 11,
            letterSpacing: '.22em',
            color: 'rgba(255,255,255,.2)',
            pointerEvents: 'none',
          }}
        >
          <span>{group.label}</span>
          <span style={{ color: 'rgba(255,255,255,.1)' }}>·</span>
          <span>{variant.label}</span>
          {group.variants.length > 1 && (
            <>
              <span style={{ color: 'rgba(255,255,255,.1)' }}>·</span>
              <span>{variantIdx + 1}/{group.variants.length}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
