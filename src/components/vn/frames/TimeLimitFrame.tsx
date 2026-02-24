import { useEffect, useState } from 'react';
import type { VNFrame } from '../../../../server/vn/types/vnFrame';
import { FONT_MAIN } from '../../../lib/fonts';

interface TimeLimitFrameProps {
    frame: VNFrame;
    onChoiceSelect?: (id: string) => void;
    onFreeTextSubmit?: (text: string) => void;
}

export function TimeLimitFrame({ frame, onFreeTextSubmit }: TimeLimitFrameProps) {
    const data = frame.timeLimit;
    const initialSeconds = data?.seconds || 10;

    const [timeLeft, setTimeLeft] = useState(initialSeconds);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (timeLeft <= 0) {
            if (!failed) {
                setFailed(true);
                // Dispatch timeout action back to the server.
                // Usually we either send a choice id 'timeout' or free text.
                onFreeTextSubmit?.(`[timeout]`);
            }
            return;
        }

        const timer = setInterval(() => {
            setTimeLeft(prev => Math.max(0, prev - 1));
        }, 1000);

        return () => clearInterval(timer);
    }, [timeLeft, failed, onFreeTextSubmit]);

    const pct = Math.max(0, (timeLeft / initialSeconds) * 100);

    // Rapid pulsing when time is extremely low
    const isCritical = timeLeft <= 3;

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                background: isCritical ? '#200' : '#050505',
                fontFamily: FONT_MAIN,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                transition: 'background 0.2s',
            }}
        >
            {/* Background vignette */}
            <div style={{
                position: 'absolute',
                inset: 0,
                boxShadow: isCritical ? 'inset 0 0 200px rgba(255,0,0,0.8)' : 'inset 0 0 100px rgba(0,0,0,0.9)',
                pointerEvents: 'none',
                animation: isCritical ? 'pulseRed 0.5s infinite alternate' : 'none',
            }} />

            <div style={{ zIndex: 10, textAlign: 'center', width: '80%', maxWidth: 800 }}>

                {/* Urgent Description */}
                <p style={{
                    fontSize: 28,
                    lineHeight: 1.6,
                    color: '#fff',
                    marginBottom: 60,
                }}>
                    {failed ? data?.failureConsequence : data?.text}
                </p>

                {/* Timer Bar */}
                <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 48, fontWeight: 'bold', color: isCritical ? '#ff2a3a' : '#fff', letterSpacing: '2px' }}>
                        00:{timeLeft.toString().padStart(2, '0')}
                    </div>
                </div>

                <div style={{ width: '100%', height: 24, background: 'rgba(255,255,255,0.1)', border: '2px solid rgba(255,255,255,0.3)' }}>
                    <div style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: isCritical ? '#ff2a3a' : '#fff',
                        transition: 'width 1s linear',
                    }} />
                </div>

                {/* Input hint */}
                {!failed && (
                    <div style={{ marginTop: 40, fontSize: 13, letterSpacing: '.12em', color: 'rgba(255,255,255,.4)' }}>
                        [AWAITING URGENT PLAYER ACTION]
                    </div>
                )}

            </div>

            <style>{`
        @keyframes pulseRed {
          0% { opacity: 0.5; }
          100% { opacity: 1; }
        }
      `}</style>
        </div>
    );
}
