import { useState } from 'react';
import type { PlanDraftState } from '../../hooks/usePlanDraft';

const font = "VT323,'Courier New',monospace";
const subtle = 'rgba(255,255,255,.18)';
const gold = 'rgba(255,198,70,.85)';
const faint = 'rgba(255,255,255,.06)';
const green = 'rgba(80,220,120,.8)';

interface MusicTrack {
  sceneId: string;
  sceneTitle: string;
  actTitle: string;
  musicUrl: string;
  mood: string;
}

function TrackRow({ track }: { track: MusicTrack }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useState<HTMLAudioElement | null>(null);

  const togglePlay = () => {
    if (!audioRef[0]) {
      const audio = new Audio(track.musicUrl);
      audioRef[0] = audio;
      audio.loop = true;
      audio.onended = () => setPlaying(false);
    }
    if (playing) {
      audioRef[0].pause();
      setPlaying(false);
    } else {
      audioRef[0].play().then(() => setPlaying(true)).catch(() => {});
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        background: faint,
        border: `1px solid ${subtle}`,
        borderRadius: 3,
        marginBottom: 6,
      }}
    >
      <button
        onClick={togglePlay}
        style={{
          background: 'none',
          border: `1px solid ${playing ? green : subtle}`,
          borderRadius: 2,
          padding: '2px 8px',
          fontSize: 12,
          color: playing ? green : subtle,
          fontFamily: font,
          cursor: 'pointer',
          letterSpacing: '.08em',
          minWidth: 52,
        }}
      >
        {playing ? '■ STOP' : '▶ PLAY'}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: gold, letterSpacing: '.06em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          ♪ {track.sceneTitle}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.35)', letterSpacing: '.04em' }}>
          {track.actTitle} · {track.mood}
        </div>
      </div>
    </div>
  );
}

export function MusicTab({ draft }: { draft: PlanDraftState }) {
  const tracks: MusicTrack[] = draft.acts.flatMap(act =>
    act.scenes
      .filter(s => s.musicUrl)
      .map(s => ({
        sceneId: s.id,
        sceneTitle: s.title,
        actTitle: act.title,
        musicUrl: s.musicUrl!,
        mood: s.mood,
      }))
  );

  if (tracks.length === 0) {
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
        Music tracks will appear here as scenes are generated.
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
      {tracks.map(track => (
        <TrackRow key={track.sceneId} track={track} />
      ))}
    </div>
  );
}
