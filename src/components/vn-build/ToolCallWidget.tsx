import { useState } from 'react';
import { isToolUIPart } from 'ai';
import type { PlanningUIMessage } from '../../../server/vn/agents/planningChatAgent';
import { FONT_MAIN } from '../../lib/fonts';

type Part = PlanningUIMessage['parts'][number];

interface ToolCallWidgetProps {
  part: Part;
  onTweak?: (id: string, type: string) => void;
}

const TOOL_LABELS: Record<string, string> = {
  'tool-proposeStoryPremise': '⚙ Story Premise',
  'tool-proposeCharacter': '⚙ Character',
  'tool-draftNodeOutline': '⚙ Node Outline',
  'tool-draftNodeBeats': '⚙ Node Beats',
  'tool-finalizeNode': '⚙ Finalize Node',
  'tool-updateElement': '⚙ Update',
  'tool-finalizePackage': '⚙ Finalize Package',
  'dynamic-tool': '🔍 Search',
};

const subtle = 'rgba(255,255,255,.18)';
const faint = 'rgba(255,255,255,.06)';
const gold = 'rgba(255,198,70,.85)';
const blue = 'rgba(140,210,255,.7)';

function StateChip({ state }: { state: string }) {
  const color =
    state === 'output-available' ? 'rgba(80,220,120,.8)' :
      state === 'input-available' ? gold :
        subtle;
  const label =
    state === 'output-available' ? '✓ done' :
      state === 'input-available' ? '◌ executing…' :
        state === 'input-streaming' ? '░ streaming…' :
          state;
  return (
    <span style={{ fontSize: 11, color, letterSpacing: '.08em', fontFamily: FONT_MAIN }}>
      {label}
    </span>
  );
}

function ProposeCharacterWidget({ part }: { part: Part }) {
  if (!isToolUIPart(part)) return null;
  if (!part.input) return null;
  const input = part.input as { id: string; name: string; role: string; description: string };
  const output = part.state === 'output-available'
    ? (part.output as { imageUrl?: string }) : null;

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ color: subtle, fontSize: 13, letterSpacing: '.06em', marginBottom: 4 }}>
        <span style={{ color: gold }}>{input.name}</span>
        {' '}&nbsp;·&nbsp;{' '}
        <span style={{ color: blue }}>{input.role}</span>
        {' '}&nbsp;·&nbsp;{' '}
        <span style={{ opacity: .6 }}>{input.id}</span>
      </div>
      {input.description && (
        <p style={{ margin: '4px 0', fontSize: 14, color: 'rgba(255,255,255,.65)', lineHeight: 1.5 }}>
          {input.description}
        </p>
      )}
      {output?.imageUrl ? (
        <img
          src={output.imageUrl}
          alt={input.name}
          style={{ display: 'block', height: 120, marginTop: 8, borderRadius: 3, border: `1px solid ${subtle}`, objectFit: 'contain', background: '#111' }}
        />
      ) : part.state === 'input-available' ? (
        <div style={{ marginTop: 8, fontSize: 13, color: subtle }}>
          Generating portrait…
        </div>
      ) : null}
    </div>
  );
}

function ProposeStoryPremiseWidget({ part }: { part: Part }) {
  if (!isToolUIPart(part)) return null;
  if (!part.input) return null;
  const input = part.input as { title: string; premise: string; setting: { world: string; era: string; tone: string }; themes: string[] };

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 16, color: gold, letterSpacing: '.08em', marginBottom: 4 }}>{input.title}</div>
      {input.premise && <p style={{ margin: '4px 0', fontSize: 14, color: 'rgba(255,255,255,.65)', lineHeight: 1.5 }}>{input.premise}</p>}
      {input.setting && (
        <div style={{ fontSize: 12, color: subtle, marginTop: 4 }}>
          {input.setting.world} · {input.setting.era} · {input.setting.tone}
        </div>
      )}
      {input.themes?.length > 0 && (
        <div style={{ fontSize: 12, color: blue, marginTop: 4 }}>
          {input.themes.join(' · ')}
        </div>
      )}
    </div>
  );
}

function NodeToolWidget({ part }: { part: Part }) {
  if (!isToolUIPart(part)) return null;
  const toolCall = { toolName: part.type, args: part.input as any };

  switch (toolCall.toolName) {
    case 'tool-draftNodeOutline':
      return (
        <>
          <div style={{ fontSize: 14, color: '#fff', marginBottom: 2 }}>Drafting Node Outline: {toolCall.args.title}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)' }}>ID: {toolCall.args.id}</div>
        </>
      );
    case 'tool-draftNodeBeats':
      return (
        <>
          <div style={{ fontSize: 14, color: '#fff', marginBottom: 2 }}>Drafting Beats for Node: {toolCall.args.nodeId}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)' }}>Beats: {toolCall.args.beats.length}</div>
        </>
      );
    case 'tool-finalizeNode':
      return (
        <>
          <div style={{ fontSize: 14, color: '#fff', marginBottom: 2 }}>Finalizing Node: {toolCall.args.nodeId}</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)' }}>Generating assets...</div>
          {toolCall.toolName === 'tool-finalizeNode' && (
            <div>Generates Image & Audio</div>
          )}
        </>
      );
    default:
      return null;
  }
}

function FinalizePackageWidget({ part }: { part: Part }) {
  if (!isToolUIPart(part) || part.state !== 'output-available') return null;
  const output = part.output as { packageId?: string; title?: string; totalScenes?: number };
  if (!output?.packageId) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 14, color: 'rgba(80,220,120,.9)', marginBottom: 6 }}>
        ✓ &nbsp;"{output.title}" is ready — {output.totalScenes} scene{output.totalScenes !== 1 ? 's' : ''}
      </div>
      <a
        href={`/vn/play?pkg=${output.packageId}`}
        style={{
          display: 'inline-block',
          padding: '6px 16px',
          border: '1px solid rgba(80,220,120,.4)',
          borderRadius: 3,
          fontSize: 13,
          letterSpacing: '.12em',
          color: 'rgba(80,220,120,.9)',
          textDecoration: 'none',
          fontFamily: FONT_MAIN,
        }}
      >
        PLAY ▶
      </a>
    </div>
  );
}

function GenericToolWidget({ part }: { part: Part }) {
  const [open, setOpen] = useState(false);
  if (!isToolUIPart(part)) return null;

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: blue, fontSize: 12, padding: 0 }}
      >
        {open ? '▼' : '▶'} details
      </button>
      {open && (
        <pre style={{ margin: '6px 0 0', fontSize: 11, color: subtle, overflowX: 'auto', maxHeight: 120 }}>
          {JSON.stringify(part.input, null, 2)}
        </pre>
      )}
    </div>
  );
}

export function ToolCallWidget({ part }: ToolCallWidgetProps) {
  if (!isToolUIPart(part)) return null;

  // Skip google_search display — handled transparently by model
  if (part.type === 'dynamic-tool') return null;

  const label = TOOL_LABELS[part.type] ?? `⚙ ${part.type.replace('tool-', '')}`;

  return (
    <div
      style={{
        margin: '6px 0',
        background: faint,
        border: `1px solid ${subtle}`,
        borderRadius: 4,
        padding: '8px 12px',
        fontFamily: FONT_MAIN,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: part.state !== 'input-streaming' ? 4 : 0 }}>
        <span style={{ fontSize: 12, color: subtle, letterSpacing: '.1em' }}>{label}</span>
        <StateChip state={part.state} />
      </div>

      {part.type === 'tool-proposeStoryPremise' && <ProposeStoryPremiseWidget part={part} />}
      {part.type === 'tool-proposeCharacter' && <ProposeCharacterWidget part={part} />}
      {(part.type === 'tool-draftNodeOutline' || part.type === 'tool-draftNodeBeats' || part.type === 'tool-finalizeNode') && <NodeToolWidget part={part} />}
      {part.type === 'tool-finalizePackage' && <FinalizePackageWidget part={part} />}
      {part.type === 'tool-updateElement' && <GenericToolWidget part={part} />}
    </div>
  );
}
