import { useEffect, useState } from 'react';
import type { VNFrame } from '../../../../server/vn/types/vnFrame';
import type { VNPackage } from '../../../../server/vn/types/vnTypes';
import { resolveAsset } from '../../../lib/resolveAsset';
import { t } from '../../../lib/i18n';
import { useLocale } from '../../../context/LocaleContext';
import { FONT_MAIN } from '../../../lib/fonts';

interface BattleFrameProps {
  frame: VNFrame;
  pack: VNPackage;
  onAdvance: () => void;
  onChoiceSelect?: (choiceId: string) => void;
}

/**
 * Battle frame: full-screen stare-down with floating action bar.
 *
 * CSS values from vn-system.html section 05:
 * - Action bar: width 68%, grid-template-columns 160px 1fr 220px, height 148px
 * - Player avatar: 58px circle, border 1px solid rgba(255,255,255,.22)
 * - HP bars: fill = (hp/maxHp)*100%, green>60%, yellow 30-60%, red<30%
 * - Combat log: last 4 entries, dim1(.15) dim2(.25) dim3(.45) active(.9)
 * - Skills: 2x2 grid, active bg rgba(255,255,255,.09)
 */
export function BattleFrame({ frame, pack, onAdvance, onChoiceSelect }: BattleFrameProps) {
  const { locale } = useLocale();
  const battle = frame.battle;
  const [activeSkill, setActiveSkill] = useState(0);
  const bg = resolveAsset(frame.panels[0]?.backgroundAsset, pack);
  void onAdvance;

  // Find active skill index from data
  useEffect(() => {
    if (battle?.skills) {
      const idx = battle.skills.findIndex(s => s.active);
      if (idx >= 0) setActiveSkill(idx);
    }
  }, [battle?.skills]);

  if (!battle) return null;

  const getHpColor = (hp: number, maxHp: number) => {
    const pct = (hp / maxHp) * 100;
    if (pct > 60) return '#4ade80';
    if (pct >= 30) return '#facc15';
    return '#ef4444';
  };

  const playerPortrait = resolveAsset(battle.player.portraitAsset, pack);
  const logEntries = battle.combatLog.slice(-4);
  const dimClasses = ['rgba(255,255,255,.15)', 'rgba(255,255,255,.25)', 'rgba(255,255,255,.45)', 'rgba(255,255,255,.9)'];

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#000',
        fontFamily: FONT_MAIN,
        overflow: 'hidden',
      }}
    >
      {/* Background */}
      <div
        style={{
          position: 'absolute', inset: 0,
          backgroundImage: `url(${bg})`,
          backgroundSize: 'cover', backgroundPosition: 'center',
          filter: 'grayscale(.7) brightness(.5)',
        }}
      />
      {/* Gradient overlays */}
      <div
        style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to right, rgba(0,0,0,.55) 0%, transparent 30%, transparent 70%, rgba(0,0,0,.45) 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, rgba(0,0,0,.35) 0%, transparent 25%, transparent 65%, rgba(0,0,0,.75) 100%)',
        }}
      />

      {/* HUD top-left */}
      <div style={{ position: 'absolute', top: 16, left: 20, zIndex: 20 }}>
        <div
          style={{
            background: 'rgba(0,0,0,.6)',
            border: '1px solid rgba(255,255,255,.12)',
            borderRadius: 3,
            padding: '5px 12px',
            fontSize: 13,
            letterSpacing: '.12em',
            color: 'rgba(255,255,255,.38)',
            marginBottom: 5,
          }}
        >
          {t('retreat', locale)}
        </div>
        <p style={{ fontSize: 12, letterSpacing: '.1em', color: 'rgba(255,255,255,.22)', paddingLeft: 2 }}>
          {t('round_label', locale)} {battle.round}
        </p>
      </div>

      {/* Enemy HP blocks — top right */}
      <div
        style={{
          position: 'absolute', top: 20, right: 24, zIndex: 20,
          display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end',
        }}
      >
        {battle.enemies.map((enemy, i) => {
          const pct = (enemy.hp / enemy.maxHp) * 100;
          return (
            <div
              key={i}
              style={{
                background: 'rgba(0,0,0,.65)',
                border: '1px solid rgba(255,255,255,.1)',
                borderRadius: 3,
                padding: '8px 14px',
                minWidth: 200,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 16, letterSpacing: '.1em' }}>{enemy.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 12, letterSpacing: '.14em', color: 'rgba(255,255,255,.4)', minWidth: 18 }}>HP</span>
                <div
                  style={{
                    flex: 1, height: 5,
                    background: 'rgba(255,255,255,.1)',
                    borderRadius: 1, overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: getHpColor(enemy.hp, enemy.maxHp),
                      borderRadius: 1,
                    }}
                  />
                </div>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,.32)', letterSpacing: '.06em' }}>{enemy.hp}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating action bar — centered bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '68%',
          zIndex: 30,
          backdropFilter: 'blur(10px)',
          background: 'rgba(0,0,0,.82)',
          border: '1px solid rgba(255,255,255,.12)',
          borderRadius: 6,
          overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: '160px 1fr 220px',
          height: 148,
        }}
      >
        {/* Player portrait + HP */}
        <div
          style={{
            borderRight: '1px solid rgba(255,255,255,.07)',
            padding: '10px 16px',
            display: 'flex', flexDirection: 'column', gap: 6,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 58, height: 58, borderRadius: '50%',
              overflow: 'hidden',
              border: '1px solid rgba(255,255,255,.22)',
              flexShrink: 0,
              background: 'rgba(255,255,255,.04)',
            }}
          >
            <img
              src={playerPortrait}
              alt={battle.player.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', filter: 'grayscale(.15)' }}
            />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15, letterSpacing: '.1em' }}>{battle.player.name}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', letterSpacing: '.08em' }}>LV {battle.player.level}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
            <span style={{ fontSize: 10, letterSpacing: '.1em', color: 'rgba(255,255,255,.38)', minWidth: 16 }}>HP</span>
            <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,.1)', borderRadius: 1, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${(battle.player.hp / battle.player.maxHp) * 100}%`,
                  background: getHpColor(battle.player.hp, battle.player.maxHp),
                  borderRadius: 1,
                }}
              />
            </div>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,.32)' }}>
              {battle.player.hp}/{battle.player.maxHp}
            </span>
          </div>
        </div>

        {/* Combat log */}
        <div
          style={{
            borderRight: '1px solid rgba(255,255,255,.07)',
            padding: '10px 18px',
            display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 2,
            overflow: 'hidden',
          }}
        >
          {logEntries.map((line, i) => {
            // Assign dim levels: oldest=dim1, newest=active
            const offset = 4 - logEntries.length;
            const colorIdx = Math.max(0, Math.min(3, i + offset));
            return (
              <p
                key={i}
                style={{
                  fontSize: 14,
                  letterSpacing: '.04em',
                  lineHeight: 1.3,
                  color: dimClasses[colorIdx],
                  animation: i === logEntries.length - 1 ? 'fadeIn 0.3s ease' : undefined,
                }}
              >
                {colorIdx === 3 ? '\u25B8 ' : ''}{line}
              </p>
            );
          })}
        </div>

        {/* Skill buttons — 2x2 grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          {battle.skills.map((skill, i) => {
            const isActive = i === activeSkill;
            const isTopRow = i < 2;
            const isOdd = i % 2 === 0;
            return (
              <button
                key={i}
                onClick={() => {
                  setActiveSkill(i);
                  onChoiceSelect?.(skill.label);
                }}
                style={{
                  background: isActive ? 'rgba(255,255,255,.09)' : 'transparent',
                  border: 'none',
                  borderRight: isOdd ? '1px solid rgba(255,255,255,.07)' : undefined,
                  borderBottom: isTopRow ? '1px solid rgba(255,255,255,.07)' : undefined,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                  cursor: 'pointer',
                  fontFamily: FONT_MAIN,
                  color: isActive ? '#fff' : 'rgba(255,255,255,.45)',
                }}
              >
                <span style={{ fontSize: 24, lineHeight: 1 }}>{skill.icon}</span>
                <span style={{ fontSize: 11, letterSpacing: '.1em' }}>{skill.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
