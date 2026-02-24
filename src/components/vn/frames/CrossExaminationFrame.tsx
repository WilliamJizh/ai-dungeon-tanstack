import { useCallback, useEffect } from 'react';
import type { VNFrame } from '../../../../server/vn/types/vnFrame';
import { useTypewriter } from '../hooks/useTypewriter';
import { FONT_MAIN } from '../../../lib/fonts';

interface CrossExaminationFrameProps {
    frame: VNFrame;
    onAdvance: () => void;
    onFreeTextSubmit?: (text: string) => void;
}

export function CrossExaminationFrame({ frame, onAdvance, onFreeTextSubmit }: CrossExaminationFrameProps) {
    const data = frame.crossExamination;

    const typeWriter = useTypewriter(
        data?.statement ?? '',
        !!data
    );

    const handleClick = useCallback(() => {
        // Unlike normal frames, clicking the bg doesn't advance, it just skips typing
        if (!typeWriter.isDone) {
            typeWriter.skip();
        }
    }, [typeWriter]);

    const handlePress = (e: React.MouseEvent) => {
        e.stopPropagation();
        onFreeTextSubmit?.(`[press]`);
    };

    const handlePresent = (e: React.MouseEvent) => {
        e.stopPropagation();
        // In a full implementation, this would open an inventory picker.
        // For now, we simulate presenting whatever is contradicting.
        const itemId = data?.contradictionItemId || 'evidence';
        onFreeTextSubmit?.(`[present] ${itemId}`);
    };

    const handleNext = (e: React.MouseEvent) => {
        e.stopPropagation();
        onAdvance();
    };

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                e.preventDefault();
                if (!typeWriter.isDone) typeWriter.skip();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [handleClick, typeWriter]);

    return (
        <div
            onClick={handleClick}
            style={{
                width: '100%',
                height: '100%',
                background: 'linear-gradient(to bottom, #1a2a3a 0%, #050a10 100%)',
                fontFamily: FONT_MAIN,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                cursor: 'default',
                padding: '0 5%',
            }}
        >
            {/* Witness Label */}
            <div style={{
                position: 'absolute',
                top: 60,
                background: '#8a0a14',
                padding: '8px 40px',
                border: '2px solid #ff2a3a',
                color: '#fff',
                fontSize: 24,
                fontWeight: 'bold',
                letterSpacing: '.2em',
                textTransform: 'uppercase',
                boxShadow: '0 5px 15px rgba(255, 42, 58, 0.3)',
            }}>
                {data?.speaker} — TESTIMONY
            </div>

            {/* Statement Box */}
            <div style={{
                width: '100%',
                maxWidth: 900,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(140,210,255,0.3)',
                borderLeft: '4px solid #148aff',
                borderRight: '4px solid #148aff',
                padding: '40px 60px',
                textAlign: 'center',
                marginBottom: 60,
                minHeight: 180,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                <div style={{
                    fontSize: 28,
                    lineHeight: 1.6,
                    color: '#148aff',
                    fontStyle: 'italic',
                    textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                }}>
                    "{typeWriter.displayedText}"
                </div>
            </div>

            {/* Action Buttons */}
            {typeWriter.isDone && (
                <div style={{ display: 'flex', gap: 40, animation: 'fadeInUp 0.3s ease-out' }}>
                    <button
                        onClick={handlePress}
                        style={{
                            background: '#0a6600',
                            border: '2px solid #1aff00',
                            color: '#fff',
                            padding: '16px 48px',
                            fontSize: 20,
                            fontWeight: 'bold',
                            letterSpacing: '.1em',
                            cursor: 'pointer',
                            textTransform: 'uppercase',
                            boxShadow: '0 0 20px rgba(26, 255, 0, 0.2)',
                            transition: 'all 0.1s',
                        }}
                        onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
                        onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                    >
                        Press
                    </button>

                    <button
                        onClick={handlePresent}
                        style={{
                            background: '#8a0a14',
                            border: '2px solid #ff2a3a',
                            color: '#fff',
                            padding: '16px 48px',
                            fontSize: 20,
                            fontWeight: 'bold',
                            letterSpacing: '.1em',
                            cursor: 'pointer',
                            textTransform: 'uppercase',
                            boxShadow: '0 0 20px rgba(255, 42, 58, 0.2)',
                            transition: 'all 0.1s',
                        }}
                        onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
                        onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                    >
                        Present
                    </button>

                    {/* Failsafe advance if the player is stuck */}
                    <button
                        onClick={handleNext}
                        style={{
                            background: 'transparent',
                            border: '1px solid rgba(255,255,255,0.2)',
                            color: 'rgba(255,255,255,0.5)',
                            padding: '16px 24px',
                            fontSize: 16,
                            cursor: 'pointer',
                        }}
                    >
                        Next {'>'}
                    </button>
                </div>
            )}

            <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
        </div>
    );
}
