import { useCallback, useEffect } from 'react';
import type { VNFrame } from '../../../../server/vn/types/vnFrame';
import type { VNPackage } from '../../../../server/vn/types/vnTypes';
import { resolveAsset } from '../../../lib/resolveAsset';
import { useTypewriter } from '../hooks/useTypewriter';
import { FONT_MAIN } from '../../../lib/fonts';
import { t } from '../../../lib/i18n';
import { useLocale } from '../../../context/LocaleContext';

interface CGPresentationFrameProps {
    frame: VNFrame;
    pack: VNPackage;
    onAdvance: () => void;
    isMuted?: boolean;
    onToggleMute?: () => void;
}

export function CGPresentationFrame({ frame, pack, onAdvance }: CGPresentationFrameProps) {
    const { locale } = useLocale();
    const data = frame.cgPresentation;
    const bg = data?.cgAsset ? resolveAsset(data.cgAsset, pack) : null;

    const typeWriter = useTypewriter(
        data?.description ?? '',
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
                width: '100%',
                height: '100%',
                background: '#000',
                fontFamily: FONT_MAIN,
                overflow: 'hidden',
                cursor: 'default',
                position: 'relative',
            }}
        >
            {/* CG Image */}
            {bg && (
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        backgroundImage: `url(${bg})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        // Simple subtle zoom effect commonly used on CGs
                        animation: 'slowZoom 20s linear forwards',
                    }}
                />
            )}

            {/* Description Overlay */}
            {data?.description && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: 60,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: '80%',
                        maxWidth: 900,
                        zIndex: 20,
                        background: 'linear-gradient(to right, transparent, rgba(0,0,0,0.8), transparent)',
                        padding: '24px 40px',
                        textAlign: 'center',
                    }}
                >
                    <p
                        style={{
                            fontSize: 22,
                            lineHeight: 1.6,
                            color: 'rgba(255,255,255,.95)',
                            letterSpacing: '.06em',
                            textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                            margin: 0,
                        }}
                    >
                        {typeWriter.displayedText}
                    </p>
                </div>
            )}

            {/* Click indicator */}
            {typeWriter.isDone && (
                <div style={{ position: 'absolute', bottom: 20, right: 30, fontSize: 13, letterSpacing: '.12em', color: 'rgba(255,255,255,.4)', textShadow: '0 1px 2px #000' }}>
                    {t('next_hint', locale)}
                </div>
            )}

            <style>{`
        @keyframes slowZoom {
          0% { transform: scale(1); }
          100% { transform: scale(1.05); }
        }
      `}</style>
        </div>
    );
}
