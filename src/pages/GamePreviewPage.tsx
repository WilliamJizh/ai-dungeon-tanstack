import { useState, type FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { SendHorizontal } from 'lucide-react';
import { FONT_MAIN as FONT } from '../lib/fonts';

const CHOICE_OPTIONS = [
  'Ask about the murder',
  'Show evidence',
  'Ask about the old docks',
  'Leave',
] as const;

type Mode = 'dialogue' | 'choices';
type ActivePanel = 'left' | 'right';

const PANEL_ACTIVE   = '0 0 62%';
const PANEL_INACTIVE = '0 0 38%';

// Shared container style — transparent black, minimal radius
const BOX: React.CSSProperties = {
  background: 'rgba(0,0,0,0.68)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 4,
  backdropFilter: 'blur(8px)',
};

export function GamePreviewPage() {
  const navigate = useNavigate();
  const [customInput, setCustomInput] = useState('');
  const [mode, setMode] = useState<Mode>('dialogue');
  const [active, setActive] = useState<ActivePanel>('right');

  const handleAction = (action: string) => {
    if (action === 'Ask about the murder') {
      navigate({ to: '/battle' });
      return;
    }
    setMode('dialogue');
  };

  const handleCustomSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!customInput.trim()) return;
    handleAction(`Custom: ${customInput.trim()}`);
    setCustomInput('');
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateRows: '48px 1fr 52px',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        background: '#000',
        color: '#fff',
        fontFamily: FONT,
      }}
    >
      {/* ── HUD ── no border */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          position: 'relative',
        }}
      >
        <div style={{ lineHeight: 1.4 }}>
          <p style={{ fontSize: 13, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.38)' }}>CH.1  THE OLD CITY</p>
          <p style={{ fontSize: 11, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.2)' }}>1.  HARBOR DISTRICT</p>
        </div>
        <p style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', fontSize: 13, letterSpacing: '0.24em', color: 'rgba(255,255,255,0.22)' }}>
          HARBOR DISTRICT
        </p>
        <nav style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <button onClick={() => navigate({ to: '/' })} style={{ fontSize: 12, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', background: 'none', border: 'none' }}>
            [ESC]
          </button>
          {(['SAVE', 'LOAD', 'LOG', 'AUTO'] as const).map(item => (
            <button key={item} style={{ fontSize: 11, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.16)', cursor: 'pointer', background: 'none', border: 'none' }}>
              {item}
            </button>
          ))}
        </nav>
      </header>

      {/* ── Panels ── */}
      <div style={{ position: 'relative', display: 'flex', gap: 8, padding: '8px' }}>

        {/* Left · Detective */}
        <div
          onClick={() => setActive('left')}
          style={{
            flex: active === 'left' ? PANEL_ACTIVE : PANEL_INACTIVE,
            position: 'relative', overflow: 'hidden', borderRadius: 6,
            transition: 'flex 0.35s cubic-bezier(0.4,0,0.2,1)',
            cursor: active !== 'left' ? 'pointer' : 'default',
          }}
        >
          <div style={{ position: 'absolute', inset: 0, backgroundImage: "url('/assets/background-city.png')", backgroundSize: 'cover', backgroundPosition: 'center', filter: active === 'left' ? 'grayscale(0.6) brightness(0.42)' : 'grayscale(1) brightness(0.25)', transition: 'filter 0.35s' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.32)' }} />
          <img
            src="/assets/character-detective.png" alt="Detective"
            style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', height: '88%', width: 'auto', objectFit: 'contain', objectPosition: 'bottom', opacity: active === 'left' ? 0.92 : 0.32, filter: active === 'left' ? 'drop-shadow(0 0 28px rgba(0,0,0,0.9))' : 'grayscale(1) drop-shadow(0 0 20px rgba(0,0,0,1))', transition: 'opacity 0.35s, filter 0.35s' }}
          />

          {/* Detective bubble — name INSIDE container */}
          {mode === 'dialogue' && active === 'left' && (
            <div style={{ position: 'absolute', bottom: '42%', left: '50%', transform: 'translateX(-50%)', zIndex: 10, maxWidth: 290 }}>
              <div style={{ ...BOX, padding: '10px 16px' }}>
                <p style={{ fontSize: 11, letterSpacing: '0.22em', color: 'rgba(255, 198, 70, 0.9)', marginBottom: 6 }}>
                  DETECTIVE
                </p>
                <p style={{ fontSize: 18, lineHeight: 1.5, color: 'rgba(255,255,255,0.9)', letterSpacing: '0.02em' }}>
                  "The evidence is right here. You can't deny it."
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right · Kim */}
        <div
          onClick={() => setActive('right')}
          style={{
            flex: active === 'right' ? PANEL_ACTIVE : PANEL_INACTIVE,
            position: 'relative', overflow: 'hidden', borderRadius: 6,
            transition: 'flex 0.35s cubic-bezier(0.4,0,0.2,1)',
            cursor: active !== 'right' ? 'pointer' : 'default',
          }}
        >
          <div style={{ position: 'absolute', inset: 0, backgroundImage: "url('/assets/background-city.png')", backgroundSize: 'cover', backgroundPosition: 'center', filter: active === 'right' ? 'grayscale(0.6) brightness(0.42)' : 'grayscale(1) brightness(0.25)', transition: 'filter 0.35s' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.08), rgba(0,0,0,0.52))' }} />
          <img
            src="/assets/character-kim.png" alt="Kim"
            style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%) scaleX(-1)', height: '92%', width: 'auto', objectFit: 'contain', objectPosition: 'bottom', opacity: active === 'right' ? 1 : 0.32, filter: active === 'right' ? 'drop-shadow(0 0 28px rgba(0,0,0,0.9))' : 'grayscale(1) drop-shadow(0 0 20px rgba(0,0,0,1))', transition: 'opacity 0.35s, filter 0.35s' }}
          />

          {/* Kim bubble — name INSIDE container */}
          {mode === 'dialogue' && active === 'right' && (
            <div style={{ position: 'absolute', bottom: '42%', left: '50%', transform: 'translateX(-48%)', zIndex: 10, maxWidth: 290 }}>
              <div style={{ ...BOX, padding: '10px 16px' }}>
                <p style={{ fontSize: 11, letterSpacing: '0.22em', color: 'rgba(255, 198, 70, 0.9)', marginBottom: 6 }}>
                  DETECTIVE KIM
                </p>
                <p style={{ fontSize: 18, lineHeight: 1.5, color: 'rgba(255,255,255,0.9)', letterSpacing: '0.02em' }}>
                  "So, you finally decided to show up. We have a situation at the old docks."
                </p>
              </div>
            </div>
          )}

          {/* Choices */}
          {mode === 'choices' && (
            <div style={{ position: 'absolute', bottom: 8, left: 8, right: 8, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {CHOICE_OPTIONS.map(option => (
                <button
                  key={option}
                  onClick={() => handleAction(option)}
                  style={{ ...BOX, padding: '9px 16px', textAlign: 'left', color: 'rgba(255,255,255,0.82)', fontSize: 16, letterSpacing: '0.08em', cursor: 'pointer', fontFamily: FONT, transition: 'background 0.1s, border-color 0.1s', border: '1px solid rgba(255,255,255,0.1)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.28)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.68)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                >
                  ▸&nbsp;&nbsp;{option}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Narration — name INSIDE container */}
        {mode === 'dialogue' && (
          <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', width: '56%', maxWidth: 620, zIndex: 20, pointerEvents: 'none' }}>
            <div style={{ ...BOX, padding: '10px 22px', textAlign: 'center', background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p style={{ fontSize: 11, letterSpacing: '0.22em', color: 'rgba(140, 210, 255, 0.7)', marginBottom: 6 }}>
                NARRATOR
              </p>
              <p style={{ fontSize: 18, lineHeight: 1.68, color: 'rgba(255,255,255,0.68)', letterSpacing: '0.04em' }}>
                The rain hasn't stopped in three days. Someone wants us at the old docks before the evidence washes away.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Controls — no border */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px' }}>

        {mode === 'dialogue' && (
          <button
            onClick={() => setMode('choices')}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3, padding: '5px 14px', color: 'rgba(255,255,255,0.28)', fontSize: 13, letterSpacing: '0.12em', cursor: 'pointer', fontFamily: FONT }}
          >
            [SPACE] &nbsp;NEXT
          </button>
        )}

        {mode === 'choices' && (
          <form onSubmit={handleCustomSubmit} style={{ display: 'flex', width: '44%', maxWidth: 500 }}>
            <div style={{ flex: 1, display: 'flex', background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 3, overflow: 'hidden' }}>
              <input
                type="text" value={customInput} onChange={e => setCustomInput(e.target.value)}
                placeholder="WRITE YOUR ACTION..." autoFocus
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'rgba(255,255,255,0.85)', padding: '0 14px', fontSize: 15, letterSpacing: '0.1em', fontFamily: FONT }}
              />
              <button type="submit" style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderLeft: '1px solid rgba(255,255,255,0.1)', padding: '0 16px', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <SendHorizontal size={14} />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
