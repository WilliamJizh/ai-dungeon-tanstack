import { useState, useCallback, useRef } from 'react';
import { ChatPanel } from '../components/vn-build/ChatPanel';
import { StoryPanel } from '../components/vn-build/StoryPanel';
import { usePlanDraft } from '../hooks/usePlanDraft';
import type { PlanningUIMessage } from '../../server/vn/agents/planningChatAgent';

const font = "VT323,'Courier New',monospace";
const subtle = 'rgba(255,255,255,.18)';
const gold = 'rgba(255,198,70,.85)';
const green = 'rgba(80,220,120,.9)';

// Generate a stable session ID per page mount
function newSessionId() {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function VNBuildPage() {
  const sessionIdRef = useRef(newSessionId());
  const sessionId = sessionIdRef.current;

  const [messages, setMessages] = useState<PlanningUIMessage[]>([]);
  const draft = usePlanDraft(messages);

  const handleMessagesChange = useCallback((msgs: PlanningUIMessage[]) => {
    setMessages(msgs);
  }, []);

  return (
    <div
      style={{
        height: '100dvh',
        background: '#050505',
        color: '#fff',
        fontFamily: font,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          height: 44,
          borderBottom: `1px solid rgba(255,255,255,.08)`,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 18, color: gold, letterSpacing: '.2em' }}>◆</span>
          <span style={{ fontSize: 13, letterSpacing: '.28em', textTransform: 'uppercase', color: 'rgba(255,255,255,.7)' }}>
            STORY BUILDER
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a
            href={`/debug/traces?pipeline=vn-plan-chat&sessionId=${sessionId}`}
            style={{
              fontSize: 11,
              letterSpacing: '.18em',
              color: subtle,
              textDecoration: 'none',
              padding: '4px 10px',
              border: `1px solid rgba(255,255,255,.08)`,
              borderRadius: 2,
            }}
          >
            TRACES
          </a>
          <a
            href="/vn/projects"
            style={{
              fontSize: 11,
              letterSpacing: '.18em',
              color: subtle,
              textDecoration: 'none',
              padding: '4px 10px',
              border: `1px solid rgba(255,255,255,.08)`,
              borderRadius: 2,
            }}
          >
            PROJECTS
          </a>

          {draft.packageId && (
            <a
              href={`/vn/play?pkg=${draft.packageId}`}
              style={{
                fontSize: 12,
                letterSpacing: '.18em',
                color: green,
                textDecoration: 'none',
                padding: '4px 14px',
                border: `1px solid rgba(80,220,120,.35)`,
                borderRadius: 2,
              }}
            >
              PLAY ▶
            </a>
          )}
        </div>
      </div>

      {/* Main split */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Chat panel — 45% */}
        <div
          style={{
            width: '45%',
            borderRight: `1px solid rgba(255,255,255,.08)`,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <ChatPanel
            sessionId={sessionId}
            onMessagesChange={handleMessagesChange}
          />
        </div>

        {/* Story panel — 55% */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <StoryPanel draft={draft} />
        </div>
      </div>
    </div>
  );
}
