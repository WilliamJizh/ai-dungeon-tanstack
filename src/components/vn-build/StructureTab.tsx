import { useState } from 'react';
import type { PlanDraftState, DraftAct, DraftScene } from '../../hooks/usePlanDraft';
import { FONT_MAIN as font } from '../../lib/fonts';
const subtle = 'rgba(255,255,255,.18)';
const gold = 'rgba(255,198,70,.85)';
const blue = 'rgba(140,210,255,.7)';
const green = 'rgba(80,220,120,.8)';

function SceneRow({ scene, isLast }: { scene: DraftScene; isLast: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginLeft: 16, borderLeft: `1px solid ${subtle}`, paddingLeft: 12, marginBottom: isLast ? 0 : 4 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 11, color: subtle }}>{open ? '▼' : '▶'}</span>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,.75)', letterSpacing: '.06em' }}>
          {scene.title}
        </span>
        {scene.mood && (
          <span style={{ fontSize: 11, color: blue, marginLeft: 4 }}>♪ {scene.mood}</span>
        )}
        {scene.backgroundUrl && (
          <span style={{ fontSize: 10, color: green, marginLeft: 4 }}>✓ bg</span>
        )}
        {scene.musicUrl && (
          <span style={{ fontSize: 10, color: green }}>✓ ♫</span>
        )}
      </button>

      {open && (
        <div style={{ marginTop: 6, paddingBottom: 8 }}>
          {scene.backgroundUrl && (
            <img
              src={scene.backgroundUrl}
              alt={scene.title}
              style={{
                display: 'block',
                width: '100%',
                maxHeight: 70,
                objectFit: 'cover',
                borderRadius: 3,
                border: `1px solid ${subtle}`,
                marginBottom: 6,
              }}
            />
          )}
          {scene.beats?.length > 0 && (
            <ul style={{ margin: '0 0 4px 14px', padding: 0 }}>
              {scene.beats.map((beat, i) => (
                <li key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', lineHeight: 1.6 }}>
                  {beat}
                </li>
              ))}
            </ul>
          )}
          {scene.exitConditions?.length > 0 && (
            <div style={{ fontSize: 11, color: subtle, marginTop: 4 }}>
              EXIT: {scene.exitConditions.join(' · ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActRow({ act }: { act: DraftAct }) {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ marginBottom: 10 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '4px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 12, color: subtle }}>{open ? '▼' : '▶'}</span>
        <span style={{ fontSize: 14, color: gold, letterSpacing: '.1em', textTransform: 'uppercase' }}>
          {act.title}
        </span>
        <span style={{ fontSize: 11, color: subtle }}>
          {act.scenes.length} scene{act.scenes.length !== 1 ? 's' : ''}
        </span>
      </button>

      {open && act.scenes.length > 0 && (
        <div style={{ marginTop: 4 }}>
          {act.scenes.map((scene, i) => (
            <SceneRow key={scene.id} scene={scene} isLast={i === act.scenes.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function StructureTab({ draft }: { draft: PlanDraftState }) {
  if (!draft.premise && draft.acts.length === 0) {
    return (
      <div style={{ padding: 20, color: 'rgba(255,255,255,.25)', fontSize: 13, letterSpacing: '.08em', fontFamily: font }}>
        Story structure will appear as the agent proposes acts and scenes.
      </div>
    );
  }

  return (
    <div style={{ padding: '12px 16px', fontFamily: font, overflowY: 'auto', height: '100%' }}>
      {draft.premise && (
        <div style={{ marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid rgba(255,255,255,.08)` }}>
          <div style={{ fontSize: 16, color: gold, letterSpacing: '.1em', marginBottom: 4 }}>
            {draft.premise.title}
          </div>
          {draft.premise.setting && (
            <div style={{ fontSize: 12, color: subtle }}>
              {draft.premise.setting.world} · {draft.premise.setting.era} · {draft.premise.setting.tone}
            </div>
          )}
          {draft.premise.themes?.length > 0 && (
            <div style={{ fontSize: 11, color: blue, marginTop: 3 }}>
              {draft.premise.themes.join(' · ')}
            </div>
          )}
        </div>
      )}

      {draft.acts.map(act => (
        <ActRow key={act.id} act={act} />
      ))}

      {draft.premise?.possibleEndings?.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid rgba(255,255,255,.08)` }}>
          <div style={{ fontSize: 11, letterSpacing: '.16em', color: subtle, marginBottom: 6 }}>
            ENDINGS
          </div>
          {draft.premise.possibleEndings.map((ending, i) => (
            <div key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,.45)', marginBottom: 3 }}>
              ○ {ending}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
