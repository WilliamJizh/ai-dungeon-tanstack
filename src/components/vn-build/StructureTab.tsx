import { useState } from 'react';
import type { PlanDraftState, DraftNode } from '../../hooks/usePlanDraft';
import { FONT_MAIN as font } from '../../lib/fonts';
const subtle = 'rgba(255,255,255,.18)';
const gold = 'rgba(255,198,70,.85)';
const blue = 'rgba(140,210,255,.7)';
const green = 'rgba(80,220,120,.8)';

function NodeRow({ node, isLast }: { node: DraftNode; isLast: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ marginLeft: 6, borderLeft: `1px solid ${subtle}`, paddingLeft: 12, marginBottom: isLast ? 0 : 8 }}>
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
        <span style={{ fontSize: 11, color: subtle }}>{open ? '▼' : '▶'}</span>
        <span style={{ fontSize: 14, color: gold, letterSpacing: '.06em' }}>
          {node.title}
        </span>
        {node.mood && (
          <span style={{ fontSize: 11, color: blue, marginLeft: 4 }}>♪ {node.mood}</span>
        )}
        {node.backgroundUrl && (
          <span style={{ fontSize: 10, color: green, marginLeft: 4 }}>✓ bg</span>
        )}
        {node.musicUrl && (
          <span style={{ fontSize: 10, color: green }}>✓ ♫</span>
        )}
      </button>

      {open && (
        <div style={{ marginTop: 6, paddingBottom: 8 }}>
          {node.backgroundUrl && (
            <img
              src={node.backgroundUrl}
              alt={node.title}
              style={{
                display: 'block',
                width: '100%',
                maxHeight: 120,
                objectFit: 'cover',
                borderRadius: 4,
                border: `1px solid ${subtle}`,
                marginBottom: 8,
              }}
            />
          )}
          {node.beats?.length > 0 && (
            <ul style={{ margin: '0 0 8px 16px', padding: 0 }}>
              {node.beats.map((beat, i) => (
                <li key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', lineHeight: 1.6, margin: '4px 0' }}>
                  {beat.title && <strong style={{ color: gold, marginRight: 4 }}>{beat.title}:</strong>}
                  {beat.description}
                  {beat.objective && <div style={{ color: gold, fontSize: 11 }}>Obj: {beat.objective}</div>}
                  {beat.pacing && <div style={{ color: subtle, fontSize: 11 }}>Pacing: {beat.pacing}</div>}
                </li>
              ))}
            </ul>
          )}
          {node.exitConditions?.length > 0 && (
            <div style={{ fontSize: 11, color: blue, marginTop: 4, background: 'rgba(140,210,255,0.1)', padding: '4px 8px', borderRadius: 4 }}>
              <strong>Exits:</strong>
              <ul style={{ margin: '2px 0 0 16px', padding: 0 }}>
                {node.exitConditions.map((exit, i) => (
                  <li key={i}>{exit.condition} ➔ {exit.nextNodeId || 'END'}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function StructureTab({ draft }: { draft: PlanDraftState }) {
  if (!draft.premise && draft.nodes.length === 0) {
    return (
      <div style={{ padding: 20, color: 'rgba(255,255,255,.25)', fontSize: 13, letterSpacing: '.08em', fontFamily: font }}>
        Story structure will appear as the agent drafts Nodes.
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

      {draft.nodes.map((node, i) => (
        <NodeRow key={node.id} node={node} isLast={i === draft.nodes.length - 1} />
      ))}

      {draft.premise?.possibleEndings && draft.premise.possibleEndings.length > 0 && (
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
