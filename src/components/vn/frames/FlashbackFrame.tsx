import { useCallback, useEffect } from 'react';
import type { VNFrame } from '../../../../server/vn/types/vnFrame';
import type { VNPackage } from '../../../../server/vn/types/vnTypes';
import { resolveAsset } from '../../../lib/resolveAsset';
import { useTypewriter } from '../hooks/useTypewriter';
import { FONT_MAIN } from '../../../lib/fonts';

interface FlashbackFrameProps {
    frame: VNFrame;
    pack: VNPackage;
    onAdvance: () => void;
}

export function FlashbackFrame({ frame, pack, onAdvance }: FlashbackFrameProps) {
    const data = frame.flashback;
    const bg = data?.backgroundAsset ? resolveAsset(data.backgroundAsset, pack) : null;

    const typeWriter = useTypewriter(
        data?.text ?? '',
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

    // Determine css filter
    let filterCss = 'sepia(80%) hue-rotate(-15deg) contrast(120%)'; // default sepia
    if (data?.filter === 'grayscale') {
        filterCss = 'grayscale(100%) contrast(150%) brightness(80%)';
    } else if (data?.filter === 'glitch') {
        // simplified glitch styling for now
        filterCss = 'hue-rotate(90deg) contrast(200%) saturate(200%)';
    }

    return (
        <div
            onClick={handleClick}
            style={{
                width: '100%',
                height: '100%',
                background: '#000',
                fontFamily: FONT_MAIN,
                overflow: 'hidden',
                position: 'relative',
                cursor: 'default',
                // Apply the flashback filter to everything inside
                filter: filterCss,
            }}
        >
            {/* Background */}
            {bg && (
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        backgroundImage: `url(${bg})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        opacity: 0.6,
                        // SLow drift 
                        animation: 'drift 30s linear infinite alternate',
                    }}
                />
            )}

            {/* Vignette */}
            <div style={{
                position: 'absolute',
                inset: 0,
                boxShadow: 'inset 0 0 150px rgba(0,0,0,0.9)',
            }} />

            {/* Text Container */}
            <div
                style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '80%',
                    maxWidth: 800,
                    textAlign: 'center',
                }}
            >
                <p style={{
                    fontSize: 32,
                    lineHeight: 1.8,
                    color: 'rgba(255,255,255,0.9)',
                    letterSpacing: '.05em',
                    textShadow: '0 4px 12px rgba(0,0,0,1)',
                    margin: 0,
                }}>
                    {typeWriter.displayedText}
                </p>
            </div>

            <style>{`
        @keyframes drift {
          0% { transform: scale(1.1) translate(0, 0); }
          100% { transform: scale(1.1) translate(-20px, -10px); }
        }
      `}</style>
        </div>
    );
}
