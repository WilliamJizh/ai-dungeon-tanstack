import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { FONT_MAIN as FONT } from '../lib/fonts'

const ACTIONS = [
  { id: 'STRIKE',     icon: '⚔',  label: 'STRIKE'     },
  { id: 'ANALYSE',    icon: '⊙',  label: 'ANALYSE'    },
  { id: 'INTIMIDATE', icon: '◆',  label: 'INTIMIDATE' },
  { id: 'FLEE',       icon: '▷',  label: 'FLEE'       },
] as const

const ENEMY_HEALTH = [
  { id: 1, name: 'ENFORCER', hp: 74, maxHp: 100 },
  { id: 2, name: 'FIXER',    hp: 51, maxHp: 80  },
]

const INITIAL_LOG = [
  'ROUND 1 — COMBAT BEGINS',
  'ENFORCER moves forward.',
  'FIXER flanks from the left.',
  '▸ Your move.',
]

export function BattleScenePage() {
  const navigate = useNavigate()
  const [log, setLog] = useState<string[]>(INITIAL_LOG)
  const [activeIdx, setActiveIdx] = useState(0)

  const handleAction = (id: string, idx: number) => {
    setActiveIdx(idx)
    setLog(prev => [...prev.slice(-6), `▸ You use ${id}.`])
  }

  return (
    <div
      style={{
        position: 'relative',
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        background: '#000',
        color: '#fff',
        fontFamily: FONT,
      }}
    >
      {/* ── Scene — fills full viewport ── */}
      <div style={{ position: 'absolute', inset: 0 }}>

        {/* Background */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: "url('/assets/background-fight.png')", backgroundSize: 'cover', backgroundPosition: 'center', filter: 'grayscale(0.7) brightness(0.5)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right,rgba(0,0,0,0.55) 0%,transparent 30%,transparent 70%,rgba(0,0,0,0.45) 100%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom,rgba(0,0,0,0.35) 0%,transparent 25%,transparent 65%,rgba(0,0,0,0.75) 100%)' }} />

        {/* HUD — top left */}
        <div style={{ position: 'absolute', top: 16, left: 20, zIndex: 20 }}>
          <button
            onClick={() => navigate({ to: '/preview' })}
            style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 3, padding: '5px 12px', fontSize: 13, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.38)', cursor: 'pointer', fontFamily: FONT, display: 'block', marginBottom: 5 }}
          >
            [ESC] RETREAT
          </button>
          <p style={{ fontSize: 12, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.22)', paddingLeft: 2 }}>ROUND 1 / 10</p>
        </div>

        {/* Enemy HP — top right */}
        <div style={{ position: 'absolute', top: 20, right: 24, zIndex: 20, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
          {ENEMY_HEALTH.map(e => (
            <div key={e.id} style={{ background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3, padding: '8px 14px', minWidth: 200 }}>
              <div style={{ marginBottom: 5 }}>
                <span style={{ fontSize: 16, letterSpacing: '0.1em' }}>{e.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 12, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.4)', minWidth: 18 }}>HP</span>
                <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.1)', borderRadius: 1 }}>
                  <div style={{ height: '100%', width: `${(e.hp / e.maxHp) * 100}%`, background: 'rgba(255,255,255,0.82)', borderRadius: 1 }} />
                </div>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.32)', letterSpacing: '0.06em' }}>{e.hp}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Enemies — right side, original stare-down positions */}
        <div style={{ position: 'absolute', bottom: '30%', right: '22%', zIndex: 10 }}>
          <img src="/assets/enemy-2.png" alt="Fixer" style={{ height: '38vh', width: 'auto', objectFit: 'contain', objectPosition: 'bottom', filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.9))' }} />
        </div>
        <div style={{ position: 'absolute', bottom: '30%', right: '6%', zIndex: 10 }}>
          <img src="/assets/enemy-1.png" alt="Enforcer" style={{ height: '44vh', width: 'auto', objectFit: 'contain', objectPosition: 'bottom', filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.9))' }} />
        </div>

        {/* Player — left side, back view */}
        <div style={{ position: 'absolute', bottom: '24%', left: '-1%', zIndex: 20 }}>
          <img src="/assets/character-player-back.png" alt="Player" style={{ height: '65vh', width: 'auto', objectFit: 'contain', objectPosition: 'bottom', filter: 'drop-shadow(0 0 60px rgba(0,0,0,0.95))' }} />
        </div>
      </div>

      {/* ── Action bar — overlaid at bottom ── */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '68%',
          zIndex: 30,
          background: 'rgba(0,0,0,0.82)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 6,
          display: 'grid',
          gridTemplateColumns: '160px 1fr 220px',
          height: 148,
          overflow: 'hidden',
        }}
      >
        {/* Player portrait + HP — portrait above HP */}
        <div
          style={{
            borderRight: '1px solid rgba(255,255,255,0.07)',
            padding: '10px 16px',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          {/* Portrait circle */}
          <div
            style={{
              width: 58, height: 58, borderRadius: '50%',
              overflow: 'hidden', border: '1px solid rgba(255,255,255,0.22)',
              background: 'rgba(255,255,255,0.04)', flexShrink: 0,
            }}
          >
            <img
              src="/assets/character-detective.png"
              alt="Detective"
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', filter: 'grayscale(0.15)' }}
            />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15, letterSpacing: '0.1em' }}>DETECTIVE</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em' }}>LV 12</div>
          </div>
          {/* HP bar below name */}
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.38)', minWidth: 16 }}>HP</span>
            <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 1 }}>
              <div style={{ height: '100%', width: '68%', background: 'rgba(255,255,255,0.82)', borderRadius: 1 }} />
            </div>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.32)' }}>68/100</span>
          </div>
        </div>

        {/* Combat log */}
        <div
          style={{
            borderRight: '1px solid rgba(255,255,255,0.07)',
            padding: '10px 18px',
            display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 2,
            overflow: 'hidden',
          }}
        >
          {log.map((line, i) => (
            <p
              key={i}
              style={{
                fontSize: 14, letterSpacing: '0.04em', lineHeight: 1.3,
                color: i === log.length - 1
                  ? 'rgba(255,255,255,0.9)'
                  : `rgba(255,255,255,${0.12 + (i / (log.length - 1)) * 0.38})`,
              }}
            >
              {line}
            </p>
          ))}
        </div>

        {/* Skill icon buttons — 2×2 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          {ACTIONS.map((action, i) => (
            <button
              key={action.id}
              onClick={() => handleAction(action.id, i)}
              style={{
                background: activeIdx === i ? 'rgba(255,255,255,0.09)' : 'transparent',
                border: 'none',
                borderRight: i % 2 === 0 ? '1px solid rgba(255,255,255,0.07)' : 'none',
                borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.07)' : 'none',
                cursor: 'pointer', fontFamily: FONT,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 3,
                color: activeIdx === i ? '#fff' : 'rgba(255,255,255,0.45)',
                transition: 'background 0.1s, color 0.1s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#fff' }}
              onMouseLeave={e => { e.currentTarget.style.background = activeIdx === i ? 'rgba(255,255,255,0.09)' : 'transparent'; e.currentTarget.style.color = activeIdx === i ? '#fff' : 'rgba(255,255,255,0.45)' }}
            >
              <span style={{ fontSize: 24, lineHeight: 1 }}>{action.icon}</span>
              <span style={{ fontSize: 11, letterSpacing: '0.1em' }}>{action.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
