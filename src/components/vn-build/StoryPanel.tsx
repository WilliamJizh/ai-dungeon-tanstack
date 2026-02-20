import { useState } from 'react';
import type { PlanDraftState } from '../../hooks/usePlanDraft';
import { StructureTab } from './StructureTab';
import { CharactersTab } from './CharactersTab';
import { MusicTab } from './MusicTab';

type Tab = 'structure' | 'characters' | 'music';

interface StoryPanelProps {
  draft: PlanDraftState;
}

const font = "VT323,'Courier New',monospace";
const subtle = 'rgba(255,255,255,.18)';
const gold = 'rgba(255,198,70,.85)';

const TABS: { id: Tab; label: string }[] = [
  { id: 'structure', label: 'STRUCTURE' },
  { id: 'characters', label: 'CHARACTERS' },
  { id: 'music', label: 'MUSIC' },
];

export function StoryPanel({ draft }: StoryPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('structure');

  const charCount = draft.characters.length;
  const sceneCount = draft.acts.reduce((sum, a) => sum + a.scenes.length, 0);
  const musicCount = draft.acts.reduce((sum, a) => sum + a.scenes.filter(s => s.musicUrl).length, 0);

  const badgeFor = (tab: Tab) => {
    if (tab === 'characters') return charCount > 0 ? charCount : null;
    if (tab === 'structure') return sceneCount > 0 ? sceneCount : null;
    if (tab === 'music') return musicCount > 0 ? musicCount : null;
    return null;
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        fontFamily: font,
        overflow: 'hidden',
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          borderBottom: `1px solid rgba(255,255,255,.08)`,
          padding: '0 12px',
          gap: 2,
          flexShrink: 0,
        }}
      >
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          const badge = badgeFor(tab.id);
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: active ? `2px solid ${gold}` : '2px solid transparent',
                padding: '10px 14px 8px',
                fontSize: 11,
                letterSpacing: '.18em',
                color: active ? gold : subtle,
                fontFamily: font,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'color .15s',
              }}
            >
              {tab.label}
              {badge !== null && (
                <span
                  style={{
                    fontSize: 10,
                    background: active ? 'rgba(255,198,70,.15)' : 'rgba(255,255,255,.08)',
                    borderRadius: 2,
                    padding: '0 4px',
                    color: active ? gold : subtle,
                  }}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {activeTab === 'structure' && <StructureTab draft={draft} />}
        {activeTab === 'characters' && <CharactersTab draft={draft} />}
        {activeTab === 'music' && <MusicTab draft={draft} />}
      </div>
    </div>
  );
}
