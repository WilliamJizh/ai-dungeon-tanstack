import type { PlanDraftState, DraftCharacter } from '../../hooks/usePlanDraft';

const font = "VT323,'Courier New',monospace";
const subtle = 'rgba(255,255,255,.18)';
const gold = 'rgba(255,198,70,.85)';
const blue = 'rgba(140,210,255,.7)';
const faint = 'rgba(255,255,255,.06)';

function CharacterCard({ char }: { char: DraftCharacter }) {
  return (
    <div
      style={{
        background: faint,
        border: `1px solid ${subtle}`,
        borderRadius: 4,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Portrait */}
      <div
        style={{
          width: '100%',
          aspectRatio: '3/4',
          background: '#0a0a0a',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {char.imageUrl ? (
          <img
            src={char.imageUrl}
            alt={char.name}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              color: 'rgba(255,255,255,.08)',
              letterSpacing: '.1em',
              fontFamily: font,
            }}
          >
            ░░
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: '8px 10px' }}>
        <div style={{ fontSize: 14, color: gold, letterSpacing: '.08em', marginBottom: 2 }}>
          {char.name}
        </div>
        <div style={{ fontSize: 11, color: blue, letterSpacing: '.06em', marginBottom: 4 }}>
          {char.role}
        </div>
        {char.description && (
          <p
            style={{
              margin: 0,
              fontSize: 11,
              color: 'rgba(255,255,255,.45)',
              lineHeight: 1.5,
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {char.description}
          </p>
        )}
      </div>
    </div>
  );
}

export function CharactersTab({ draft }: { draft: PlanDraftState }) {
  if (draft.characters.length === 0) {
    return (
      <div
        style={{
          padding: 20,
          color: 'rgba(255,255,255,.25)',
          fontSize: 13,
          letterSpacing: '.08em',
          fontFamily: font,
        }}
      >
        Characters will appear here as the agent proposes them.
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '12px 16px',
        fontFamily: font,
        overflowY: 'auto',
        height: '100%',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
          gap: 12,
        }}
      >
        {draft.characters.map(char => (
          <CharacterCard key={char.id} char={char} />
        ))}
      </div>
    </div>
  );
}
