import { useRef, useEffect, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isToolUIPart } from 'ai';
import type { PlanningUIMessage } from '../../../server/vn/agents/planningChatAgent';
import { ToolCallWidget } from './ToolCallWidget';

interface ChatPanelProps {
  sessionId: string;
  onMessagesChange?: (messages: PlanningUIMessage[]) => void;
}

const font = "VT323,'Courier New',monospace";
const faint = 'rgba(255,255,255,.06)';
const subtle = 'rgba(255,255,255,.18)';
const gold = 'rgba(255,198,70,.85)';

export function ChatPanel({ sessionId, onMessagesChange }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status } = useChat<PlanningUIMessage>({
    transport: new DefaultChatTransport({
      api: '/api/vn/chat',
      body: () => ({ sessionId }),
    }),
  });

  const isStreaming = status === 'streaming' || status === 'submitted';

  // Notify parent of messages changes for StoryPanel
  useEffect(() => {
    onMessagesChange?.(messages as PlanningUIMessage[]);
  }, [messages, onMessagesChange]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    sendMessage({ text });
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
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
      {/* Message list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 16px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              margin: 'auto',
              textAlign: 'center',
              color: 'rgba(255,255,255,.22)',
              fontSize: 14,
              letterSpacing: '.12em',
              lineHeight: 2,
            }}
          >
            <div style={{ fontSize: 24, marginBottom: 8 }}>◆</div>
            STORY CO-AUTHOR
            <br />
            <span style={{ fontSize: 12, letterSpacing: '.08em' }}>
              describe your story idea to begin
            </span>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.role === 'user') {
            return (
              <div key={msg.id} style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                <div
                  style={{
                    maxWidth: '78%',
                    background: 'rgba(255,255,255,.07)',
                    border: `1px solid ${subtle}`,
                    borderRadius: '4px 4px 1px 4px',
                    padding: '8px 12px',
                    fontSize: 14,
                    color: 'rgba(255,255,255,.82)',
                    lineHeight: 1.55,
                    letterSpacing: '.04em',
                  }}
                >
                  {msg.parts.map((part, i) =>
                    part.type === 'text' ? <span key={i}>{part.text}</span> : null
                  )}
                </div>
              </div>
            );
          }

          if (msg.role === 'assistant') {
            return (
              <div key={msg.id} style={{ marginBottom: 10 }}>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: '.22em',
                    color: gold,
                    marginBottom: 6,
                    opacity: .7,
                  }}
                >
                  ◆ AGENT
                </div>
                {msg.parts.map((part, i) => {
                  if (part.type === 'text' && part.text) {
                    return (
                      <p
                        key={i}
                        style={{
                          margin: '0 0 6px',
                          fontSize: 14,
                          color: 'rgba(255,255,255,.82)',
                          lineHeight: 1.6,
                          letterSpacing: '.04em',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {part.text}
                      </p>
                    );
                  }
                  if (isToolUIPart(part)) {
                    return <ToolCallWidget key={i} part={part} />;
                  }
                  return null;
                })}
              </div>
            );
          }

          return null;
        })}

        {isStreaming && messages[messages.length - 1]?.role !== 'assistant' && (
          <div style={{ fontSize: 12, color: subtle, letterSpacing: '.14em', marginTop: 4 }}>
            ◌ thinking…
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          borderTop: `1px solid ${faint}`,
          padding: '10px 12px',
          background: 'rgba(0,0,0,.4)',
        }}
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="describe your story…"
            rows={2}
            disabled={isStreaming}
            style={{
              flex: 1,
              background: 'rgba(0,0,0,.6)',
              border: `1px solid ${subtle}`,
              borderRadius: 3,
              padding: '8px 10px',
              color: 'rgba(255,255,255,.82)',
              fontSize: 14,
              fontFamily: font,
              letterSpacing: '.04em',
              resize: 'none',
              outline: 'none',
              lineHeight: 1.5,
              opacity: isStreaming ? .5 : 1,
            }}
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            style={{
              background: 'none',
              border: `1px solid ${isStreaming || !input.trim() ? subtle : 'rgba(255,198,70,.4)'}`,
              borderRadius: 3,
              padding: '8px 14px',
              fontSize: 13,
              letterSpacing: '.16em',
              color: isStreaming || !input.trim() ? subtle : gold,
              fontFamily: font,
              cursor: isStreaming || !input.trim() ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
              transition: 'color .15s, border-color .15s',
            }}
          >
            {isStreaming ? '…' : 'SEND ▶'}
          </button>
        </form>
      </div>
    </div>
  );
}
