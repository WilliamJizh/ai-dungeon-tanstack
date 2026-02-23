import { useState, useRef } from 'react';
import type { PlanDraftState } from '../../hooks/usePlanDraft';
import { FONT_MAIN as font } from '../../lib/fonts';
const subtle = 'rgba(255,255,255,.18)';
const gold = 'rgba(255,198,70,.85)';
const faint = 'rgba(255,255,255,.06)';
const green = 'rgba(80,220,120,.8)';

interface MusicTrack {
  sceneId: string;
  sceneTitle: string;
  actTitle: string;
  musicUrl: string;
  mood?: string;
}

function TrackRow({ track }: { track: MusicTrack }) {
  const [playing, setPlaying] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  const togglePlay = async () => {
    if (playing) {
      sourceRef.current?.stop();
      sourceRef.current = null;
      setPlaying(false);
      return;
    }

    if (!ctxRef.current) {
      ctxRef.current = new AudioContext();
    }
    const ctx = ctxRef.current;
    if (ctx.state === 'suspended') await ctx.resume();

    const response = await fetch(track.musicUrl);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.loop = true;
    source.connect(ctx.destination);
    source.onended = () => setPlaying(false);
    source.start();
    sourceRef.current = source;
    setPlaying(true);
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
  const tracks: MusicTrack[] = draft.nodes.flatMap(node =>
    node.beats
      .filter(beat => beat.musicUrl)
      .map(beat => ({
        sceneId: beat.id,
        sceneTitle: beat.title,
        actTitle: node.title, // Assuming node title acts as the parent title
        musicUrl: beat.musicUrl!,
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
