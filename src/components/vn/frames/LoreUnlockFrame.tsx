import { useCallback, useEffect } from 'react';
import type { VNFrame } from '../../../../server/vn/types/vnFrame';
import { useTypewriter } from '../hooks/useTypewriter';
import { FONT_MAIN } from '../../../lib/fonts';
import { t } from '../../../lib/i18n';
import { useLocale } from '../../../context/LocaleContext';

interface LoreUnlockFrameProps {
    frame: VNFrame;
    onAdvance: () => void;
}

export function LoreUnlockFrame({ frame, onAdvance }: LoreUnlockFrameProps) {
    const { locale } = useLocale();
    const data = frame.loreEntry;

    const typeWriter = useTypewriter(
        data?.content ?? '',
        !!data
    );

    const handleClick = useCallback(() => {
        if (typeWriter.isDone) {
            onAdvance();
        } else {
            typeWriter.skip();
        }
    }, [typeWriter, onAdvance]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                e.preventDefault();
                handleClick();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [handleClick]);

    return (
        <div
            onClick={handleClick}
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%',
                background: 'radial-gradient(circle at center, #111522 0%, #020305 100%)',
                fontFamily: FONT_MAIN,
                overflow: 'hidden',
                cursor: 'default',
                position: 'relative',
            }}
        >
            <div
                className="lore-container"
                style={{
                    width: '80%',
                    maxWidth: 800,
                    background: 'rgba(0,0,0,0.6)',
                    border: '1px solid rgba(140,210,255,0.15)',
                    borderTop: '3px solid rgba(140,210,255,0.8)',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                    padding: '40px 50px',
                    position: 'relative',
                    animation: 'slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                    opacity: 0,
                    transform: 'translateY(40px)',
                }}
            >
                {/* Header Ribbon */}
                <div style={{
                    position: 'absolute',
                    top: -16,
                    left: 40,
                    background: 'rgba(140,210,255,0.9)',
                    color: '#000',
                    padding: '4px 12px',
                    fontWeight: 'bold',
                    fontSize: 10,
                    letterSpacing: '.2em',
                    textTransform: 'uppercase',
                }}>
                    DATABASE UNLOCKED
                </div>

                {data && (
                    <>
                        <div style={{ fontSize: 12, letterSpacing: '.3em', color: 'rgba(255,255,255,.4)', marginBottom: 8, textTransform: 'uppercase' }}>
                            {data.category}
                        </div>
                        <div style={{ fontSize: 32, letterSpacing: '.05em', color: 'rgba(255,255,255,.95)', marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,.1)', paddingBottom: 16 }}>
                            {data.title}
                        </div>
                        <p style={{
                            fontSize: 18,
                            lineHeight: 1.7,
                            color: 'rgba(255,255,255,.75)',
                            margin: 0,
                            whiteSpace: 'pre-wrap',
                        }}>
                            {typeWriter.displayedText}
                        </p>
                    </>
                )}

                {/* Click indicator */}
                {typeWriter.isDone && (
                    <div style={{ textAlign: 'right', marginTop: 30, fontSize: 13, letterSpacing: '.12em', color: 'rgba(140,210,255,.6)', animation: 'pulse 2s infinite' }}>
                        {t('next_hint', locale)}
                    </div>
                )}
            </div>

            <style>{`
        @keyframes slideUp {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
      `}</style>
        </div>
    );
}
