import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isToolUIPart } from 'ai';
import type { VNFrame } from '../../server/vn/types/vnFrame';
import type { StorytellerUIMessage } from '../../server/vn/agents/storytellerChatAgent';
import type { VNPackage } from '../../server/vn/types/vnTypes';
import { useVN } from '../context/VNContext';
import { useLocale } from '../context/LocaleContext';
import { useScaleManager } from '../hooks/useScaleManager';
import { VNRenderer } from '../components/vn/VNRenderer';
import { LanguageToggle } from '../components/shared/LanguageToggle';
import { audioPlayer } from '../lib/audioPlayer';
import { FONT_MAIN } from '../lib/fonts';
import { t } from '../lib/i18n';

// ─── Inner component — keyed on sessionId+sceneId so useChat resets each scene ─

interface StorytellerSessionProps {
  vnPackage: VNPackage;
  sessionId: string;
  currentLocationId: string;
  onNodeComplete: (nextNodeId: string) => void;
  isMuted: boolean;
  onToggleMute: () => void;
}

function StorytellerSession({
  vnPackage,
  sessionId,
  currentLocationId,
  onNodeComplete,
  isMuted,
  onToggleMute,
}: StorytellerSessionProps) {
  const { messages, sendMessage, status } = useChat<StorytellerUIMessage>({
    transport: new DefaultChatTransport({
      api: '/api/vn/tell-chat',
      body: () => ({ sessionId, packageId: vnPackage.id }),
    }),
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  // Kick off the first turn (scene opener) on mount — guard against Strict Mode double-fire
  const sentRef = useRef(false);
  useEffect(() => {
    if (sentRef.current) return;
    sentRef.current = true;
    sendMessage({ text: '[scene start]' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Accumulate frames from completed frameBuilderTool outputs across all messages
  const frames = useMemo(
    () => {
      const allParts = messages.flatMap((msg) =>
        msg.role === 'assistant' ? msg.parts : [],
      );
      console.log('[StorytellerSession] assistant parts:', allParts.map((p) => ({ type: (p as Record<string, unknown>).type, state: (p as Record<string, unknown>).state })));
      return messages.flatMap((msg) => {
        if (msg.role !== 'assistant') return [];
        return msg.parts
          .filter(
            (p) =>
              isToolUIPart(p) &&
              p.type === 'tool-frameBuilderTool' &&
              p.state === 'output-available',
          )
          .map((p) => (p as { output: { ok: boolean; frame?: VNFrame } }).output)
          .filter((o) => o.ok && o.frame)
          .map((o) => o.frame!);
      });
    },
    [messages],
  );

  // Detect pending node completion from the latest nodeCompleteTool output
  const pendingNodeComplete = useMemo<string | null | undefined>(() => {
    for (const msg of [...messages].reverse()) {
      if (msg.role !== 'assistant') continue;
      for (const part of [...msg.parts].reverse()) {
        if (
          isToolUIPart(part) &&
          part.type === 'tool-nodeCompleteTool' &&
          part.state === 'output-available'
        ) {
          const out = (part as { output: { nextNodeId?: string | null } }).output;
          return out.nextNodeId ?? null;
        }
      }
    }
    return undefined;
  }, [messages]);

  // Start music when the first frame with a musicAsset arrives
  useEffect(() => {
    if (frames.length === 0) return;
    const musicFrame = frames.find((f) => f.audio?.musicAsset);
    const key = musicFrame?.audio?.musicAsset;
    if (!key) return;
    const url = vnPackage.assets.music[key]?.url;
    if (url) audioPlayer.play(url);
  }, [frames, vnPackage]);

  const handlePlayerAction = useCallback(
    (text: string) => {
      sendMessage({ text });
    },
    [sendMessage],
  );

  return (
    <VNRenderer
      frames={frames}
      pendingNodeComplete={pendingNodeComplete}
      isLoading={isLoading}
      onPlayerAction={handlePlayerAction}
      pack={vnPackage}
      currentLocationId={currentLocationId}
      onNodeComplete={onNodeComplete}
      isMuted={isMuted}
      onToggleMute={onToggleMute}
    />
  );
}

// ─── Outer page — layout, guard, scaling ─────────────────────────────────────

export function VNEnginePage() {
  const navigate = useNavigate();
  const { isHydrated, vnPackage, sessionId, currentLocationId, advanceLocation } = useVN();
  const { locale, setLocale } = useLocale();
  const [isMuted, setIsMuted] = useState(false);

  const { containerRef, canvasStyle, isViewportTooSmall } = useScaleManager({
    baseWidth: 1144,
    baseHeight: 644,
    mode: 'fit',
    maxScale: 1,
    minViewportWidth: 480,
  });

  // Guard: redirect if no package loaded
  useEffect(() => {
    if (isHydrated && !vnPackage) {
      navigate({ to: '/vn' });
    }
  }, [isHydrated, vnPackage, navigate]);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      audioPlayer.setMuted(next);
      return next;
    });
  }, []);

  const handleNodeComplete = useCallback(
    (nextLocationId: string) => {
      advanceLocation(nextLocationId);
    },
    [advanceLocation],
  );

  if (!isHydrated || !vnPackage || !currentLocationId) return null;

  if (isViewportTooSmall) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100vw',
          height: '100vh',
          background: '#000',
          color: 'rgba(255,255,255,.4)',
          fontFamily: FONT_MAIN,
          fontSize: 16,
          letterSpacing: '.2em',
          textAlign: 'center',
          padding: 20,
        }}
      >
        {t('resize_warning', locale)}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100vw',
        height: '100vh',
        background: '#000',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        style={{
          ...canvasStyle,
          position: 'absolute',
          top: '50%',
          left: '50%',
          transformOrigin: 'center center',
        }}
      >
        <StorytellerSession
          key={`${sessionId}--${currentLocationId}`}
          vnPackage={vnPackage}
          sessionId={sessionId}
          currentLocationId={currentLocationId}
          onNodeComplete={handleNodeComplete}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
        />
      </div>
      <div style={{ position: 'absolute', bottom: 12, left: 12, zIndex: 100, opacity: 0.35 }}>
        <LanguageToggle
          locale={locale}
          onToggle={() => setLocale(locale === 'en' ? 'zh-CN' : 'en')}
          style={{ fontSize: 11, padding: '3px 8px' }}
        />
      </div>
    </div>
  );
}
