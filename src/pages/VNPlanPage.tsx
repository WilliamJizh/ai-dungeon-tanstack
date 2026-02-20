import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useVN } from '../context/VNContext';

interface PlanProgress {
  type: string;
  message: string;
}

const RANDOM_PRESETS = [
  {
    genre: 'noir detective',
    setting: '1940s San Francisco. Rain-slicked streets, jazz clubs, corrupt city officials.',
    protagonist: 'A world-weary private detective with a drinking problem and a code of honour.',
    context: 'A missing heiress, a murdered informant, and a conspiracy that reaches city hall.',
  },
  {
    genre: 'sci-fi horror',
    setting: 'A derelict deep-space research station orbiting a gas giant, year 2387.',
    protagonist: "The station's AI systems engineer, awakened from cryo mid-emergency.",
    context: 'The crew is missing. Something answered the distress beacon before you did.',
  },
  {
    genre: 'feudal Japan fantasy',
    setting: 'Sengoku-era Japan where fox spirits walk among samurai clans.',
    protagonist: 'A ronin hired to escort a merchant, secretly a kitsune in disguise.',
    context: 'Two rival clans, an ancient curse, and a shrine that grants wishes at a price.',
  },
  {
    genre: 'gothic romance',
    setting: 'Victorian England, 1887. A crumbling estate on the Yorkshire moors in perpetual fog.',
    protagonist: 'A newly hired governess with a mysterious past and the ability to see ghosts.',
    context: 'The lord of the manor hides a terrible secret. His dead wife may not be gone.',
  },
  {
    genre: 'post-apocalyptic',
    setting: 'A flooded megacity, 2141. The upper floors are for the wealthy, the depths lawless.',
    protagonist: 'A diver scavenger who finds pre-flood data that could change everything.',
    context: 'A corporate faction and a resistance both want what you found.',
  },
  {
    genre: 'mythological adventure',
    setting: 'Ancient Greece during the age of heroes. Gods meddle freely in mortal affairs.',
    protagonist: 'A half-mortal child of Hermes, banished from Olympus for a forgotten crime.',
    context: 'A prophecy, a stolen golden fleece, and a goddess who wants you dead.',
  },
  {
    genre: 'cyberpunk heist',
    setting: 'Neo-Seoul, 2077. Neon towers above, flooded slums below. Corps own everything.',
    protagonist: 'A ghost hacker who can jack into any system — and any mind.',
    context: 'One last job to buy your freedom. The target is the most secure vault on Earth.',
  },
  {
    genre: 'cozy mystery',
    setting: 'A tiny English village, 1952. Everyone knows everyone. Secrets run deep.',
    protagonist: 'A retired spy posing as a baker who keeps stumbling into murders.',
    context: 'The village fete, a poisoned scone, and six suspects who all had motive.',
  },
  {
    genre: 'dark fantasy',
    setting: 'A dying empire where magic is fading and the old gods have gone silent.',
    protagonist: 'The last court mage, tasked with finding why the magic is disappearing.',
    context: 'The answer lies in the Forbidden Archives — sealed for a reason.',
  },
  {
    genre: 'space western',
    setting: "The outer colonies, 2290. No law beyond the frontier. Everyone's running from something.",
    protagonist: 'A bounty hunter with an illegal AI partner and a ship that barely flies.',
    context: 'The target is a child. The client is the government. Something is very wrong.',
  },
] as const;

/**
 * VN planning page: user configures genre, setting, protagonist, context.
 * On submit: creates an EventSource to /api/vn/plan streaming SSE progress.
 * On 'complete': sets package and navigates to /vn/play.
 */
export function VNPlanPage() {
  const navigate = useNavigate();
  const { setPackage } = useVN();
  const log = (...args: unknown[]) => console.log('[VNPlanPage]', ...args);

  const [genre, setGenre] = useState('');
  const [setting, setSetting] = useState('');
  const [protagonist, setProtagonist] = useState('');
  const [context, setContext] = useState('');
  const [isPlanning, setIsPlanning] = useState(false);
  const [progress, setProgress] = useState<PlanProgress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const handleRandom = useCallback(() => {
    const preset = RANDOM_PRESETS[Math.floor(Math.random() * RANDOM_PRESETS.length)];
    setGenre(preset.genre);
    setSetting(preset.setting);
    setProtagonist(preset.protagonist);
    setContext(preset.context);
  }, []);

  const handleViewProjects = useCallback(() => {
    navigate({ to: '/vn/projects' });
  }, [navigate]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!genre.trim() || !setting.trim() || !protagonist.trim()) return;

    if (eventSourceRef.current) {
      log('Closing previous EventSource before starting new plan request');
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setIsPlanning(true);
    setProgress([]);
    setError(null);

    const params = new URLSearchParams({
      genre: genre.trim(),
      setting: setting.trim(),
      protagonist: protagonist.trim(),
    });
    if (context.trim()) params.set('context', context.trim());

    const requestUrl = `/api/vn/plan?${params.toString()}`;
    const startedAt = Date.now();
    let completed = false;

    log('Opening plan SSE', {
      requestUrl,
      genre: genre.trim(),
      settingLength: setting.trim().length,
      protagonistLength: protagonist.trim().length,
      hasContext: Boolean(context.trim()),
    });

    const es = new EventSource(requestUrl);
    eventSourceRef.current = es;

    es.onopen = () => {
      log('SSE open', { readyState: es.readyState, elapsedMs: Date.now() - startedAt });
    };

    es.onmessage = (event) => {
      log('SSE untyped message', { data: event.data, elapsedMs: Date.now() - startedAt });
    };

    es.addEventListener('progress', (event) => {
      log('SSE progress event', { data: event.data, elapsedMs: Date.now() - startedAt });
      try {
        const data = JSON.parse(event.data);
        setProgress(prev => [...prev, { type: 'progress', message: data.message }]);
      } catch (err) {
        log('Failed to parse progress payload', err);
      }
    });

    es.addEventListener('complete', (event) => {
      log('SSE complete event', { data: event.data, elapsedMs: Date.now() - startedAt });
      try {
        const data = JSON.parse(event.data);
        completed = true;
        setPackage(data.package);
        setIsPlanning(false);
        es.close();
        log('Navigating to /vn/play', { packageId: data.packageId, elapsedMs: Date.now() - startedAt });
        navigate({ to: '/vn/play' });
      } catch (err) {
        log('Failed to parse complete payload', err);
        setError('Planning completed with invalid payload');
        setIsPlanning(false);
        es.close();
      }
    });

    es.addEventListener('error', (event) => {
      log('SSE error event', {
        readyState: es.readyState,
        isMessageEvent: event instanceof MessageEvent,
        data: event instanceof MessageEvent ? event.data : undefined,
        elapsedMs: Date.now() - startedAt,
      });

      if (completed) {
        log('Ignoring SSE error after complete event');
        return;
      }

      // SSE error event may be a MessageEvent with data
      if (event instanceof MessageEvent && event.data) {
        try {
          const data = JSON.parse(event.data);
          setError(data.message ?? 'Planning failed');
          log('Planning failed with server message', data);
        } catch {
          setError('Planning failed');
          log('Planning failed with unparsable error payload');
        }
      } else {
        setError('Connection lost during planning');
        log('Planning failed due to connection loss');
      }
      setIsPlanning(false);
      es.close();
    });
  }, [genre, setting, protagonist, context, setPackage, navigate]);

  useEffect(() => {
    return () => {
      log('Component unmount: closing EventSource');
      eventSourceRef.current?.close();
    };
  }, []);

  const font = "VT323, 'Courier New', monospace";

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#050505',
        color: '#fff',
        fontFamily: font,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '60px 20px',
      }}
    >
      <h1
        style={{
          fontSize: 36,
          letterSpacing: '.28em',
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        NEW STORY
      </h1>
      <p
        style={{
          fontSize: 13,
          letterSpacing: '.44em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,.35)',
          marginBottom: 48,
        }}
      >
        CONFIGURE YOUR VISUAL NOVEL
      </p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 36 }}>
        <button
          type="button"
          onClick={handleRandom}
          disabled={isPlanning}
          style={{
            background: 'none',
            border: '1px solid rgba(255,255,255,.14)',
            borderRadius: 3,
            padding: '6px 18px',
            fontSize: 13,
            letterSpacing: '.22em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,.38)',
            fontFamily: font,
            cursor: 'pointer',
          }}
        >
          [ RANDOM ]
        </button>
        <button
          type="button"
          onClick={handleViewProjects}
          disabled={isPlanning}
          style={{
            background: 'none',
            border: '1px solid rgba(255,255,255,.14)',
            borderRadius: 3,
            padding: '6px 18px',
            fontSize: 13,
            letterSpacing: '.22em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,.38)',
            fontFamily: font,
            cursor: 'pointer',
          }}
        >
          [ PAST PROJECTS ]
        </button>
      </div>

      {!isPlanning ? (
        <form
          onSubmit={handleSubmit}
          style={{
            width: '100%',
            maxWidth: 520,
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, letterSpacing: '.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,.52)' }}>
              GENRE *
            </span>
            <input
              type="text"
              value={genre}
              onChange={e => setGenre(e.target.value)}
              placeholder="e.g. noir detective, sci-fi horror, fantasy"
              required
              style={{
                background: 'rgba(0,0,0,.8)',
                border: '1px solid rgba(255,255,255,.12)',
                borderRadius: 3,
                padding: '10px 14px',
                color: 'rgba(255,255,255,.85)',
                fontSize: 16,
                letterSpacing: '.08em',
                fontFamily: font,
                outline: 'none',
              }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, letterSpacing: '.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,.52)' }}>
              SETTING *
            </span>
            <textarea
              value={setting}
              onChange={e => setSetting(e.target.value)}
              placeholder="Describe the world, time period, and atmosphere..."
              required
              rows={3}
              style={{
                background: 'rgba(0,0,0,.8)',
                border: '1px solid rgba(255,255,255,.12)',
                borderRadius: 3,
                padding: '10px 14px',
                color: 'rgba(255,255,255,.85)',
                fontSize: 16,
                letterSpacing: '.08em',
                fontFamily: font,
                outline: 'none',
                resize: 'vertical',
              }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, letterSpacing: '.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,.52)' }}>
              PROTAGONIST *
            </span>
            <textarea
              value={protagonist}
              onChange={e => setProtagonist(e.target.value)}
              placeholder="Describe your main character..."
              required
              rows={2}
              style={{
                background: 'rgba(0,0,0,.8)',
                border: '1px solid rgba(255,255,255,.12)',
                borderRadius: 3,
                padding: '10px 14px',
                color: 'rgba(255,255,255,.85)',
                fontSize: 16,
                letterSpacing: '.08em',
                fontFamily: font,
                outline: 'none',
                resize: 'vertical',
              }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, letterSpacing: '.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,.52)' }}>
              ADDITIONAL CONTEXT
            </span>
            <textarea
              value={context}
              onChange={e => setContext(e.target.value)}
              placeholder="Optional: themes, story hooks, specific elements..."
              rows={2}
              style={{
                background: 'rgba(0,0,0,.8)',
                border: '1px solid rgba(255,255,255,.12)',
                borderRadius: 3,
                padding: '10px 14px',
                color: 'rgba(255,255,255,.85)',
                fontSize: 16,
                letterSpacing: '.08em',
                fontFamily: font,
                outline: 'none',
                resize: 'vertical',
              }}
            />
          </label>

          <button
            type="submit"
            style={{
              background: 'rgba(255,255,255,.08)',
              border: '1px solid rgba(255,255,255,.18)',
              borderRadius: 4,
              padding: '12px 24px',
              fontSize: 16,
              letterSpacing: '.2em',
              textTransform: 'uppercase',
              color: '#fff',
              fontFamily: font,
              cursor: 'pointer',
              marginTop: 12,
            }}
          >
            BEGIN PLANNING
          </button>
        </form>
      ) : (
        <div style={{ width: '100%', maxWidth: 520 }}>
          {/* Progress list */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              marginBottom: 24,
            }}
          >
            {progress.map((p, i) => (
              <div
                key={i}
                style={{
                  fontSize: 14,
                  letterSpacing: '.08em',
                  color: i === progress.length - 1 ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.35)',
                }}
              >
                {'\u25B8'} {p.message}
              </div>
            ))}
            {!error && (
              <div style={{ fontSize: 14, letterSpacing: '.2em', color: 'rgba(255,255,255,.3)', marginTop: 8 }}>
                GENERATING...
              </div>
            )}
          </div>

          {error && (
            <div
              style={{
                background: 'rgba(239,68,68,.15)',
                border: '1px solid rgba(239,68,68,.3)',
                borderRadius: 4,
                padding: '12px 16px',
                fontSize: 14,
                color: 'rgba(239,68,68,.9)',
                letterSpacing: '.06em',
              }}
            >
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
