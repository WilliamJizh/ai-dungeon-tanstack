import { useCallback, useEffect } from 'react';
import type { VNFrame } from '../../../../server/vn/types/vnFrame';
import type { VNPackage } from '../../../../server/vn/types/vnTypes';
import { resolveAsset } from '../../../lib/resolveAsset';
import { useTypewriter } from '../hooks/useTypewriter';
import { FONT_MAIN } from '../../../lib/fonts';

interface DynamicCutInFrameProps {
    frame: VNFrame;
    pack: VNPackage;
    onAdvance: () => void;
}

export function DynamicCutInFrame({ frame, pack, onAdvance }: DynamicCutInFrameProps) {
    const data = frame.cutIn;
    const charImg = data?.characterAsset ? resolveAsset(data.characterAsset, pack) : null;

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

    // Styling based on intense visual novel/persona style cut-ins
    const getStyleColors = () => {
        switch (data?.style) {
            case 'critical': return { bg: '#8a0a14', line: '#ff2a3a', text: '#fff' };
            case 'thought': return { bg: '#0f2438', line: '#2a88ff', text: '#d4e8ff' };
            case 'shout':
            default: return { bg: '#aa6600', line: '#ffd52a', text: '#000' };
        }
    };

    const colors = getStyleColors();

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
                // Striped animated background for high tension
                backgroundImage: `repeating-linear-gradient(-45deg, transparent, transparent 10px, rgba(255,255,255,0.03) 10px, rgba(255,255,255,0.03) 20px)`,
            }}
        >
            {/* 
        The Cut-In Slash Container 
        Using a clipped polygon to make a jagged/angled comic stripe across the screen
      */}
            <div
                style={{
                    position: 'absolute',
                    top: '20%',
                    left: -40,
                    right: -40,
                    height: '60%',
                    background: colors.bg,
                    borderTop: `4px solid ${colors.line}`,
                    borderBottom: `4px solid ${colors.line}`,
                    transform: 'skewY(-5deg)',
                    display: 'flex',
                    alignItems: 'center',
                    boxShadow: '0 0 50px rgba(0,0,0,0.8)',
                    animation: 'slashIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
                    opacity: 0,
                }}
            >
                {/* Undo the skew for contents */}
                <div style={{
                    transform: 'skewY(5deg)',
                    width: '100%',
                    height: '100%',
                    display: 'grid',
                    gridTemplateColumns: 'minmax(200px, 1fr) 2fr',
                    alignItems: 'center',
                    padding: '0 80px',
                }}>

                    {/* Character Art (zoomed, showing face/bust) */}
                    <div style={{ position: 'relative', height: '100%' }}>
                        {charImg && (
                            <img
                                src={charImg}
                                alt={data?.speaker}
                                style={{
                                    position: 'absolute',
                                    bottom: -100, // pull character down to show upper body/face mostly
                                    left: 0,
                                    height: '180%',
                                    objectFit: 'contain',
                                    filter: 'drop-shadow(5px 0 0 rgba(0,0,0,0.5))',
                                    animation: 'slideRight 0.5s ease-out forwards',
                                }}
                            />
                        )}
                    </div>

                    {/* Speech Text */}
                    <div style={{ zIndex: 10 }}>
                        <div style={{
                            fontSize: 64,
                            fontWeight: 900,
                            fontStyle: 'italic',
                            color: colors.text,
                            letterSpacing: '.05em',
                            textShadow: data?.style === 'shout' ? 'none' : '2px 2px 0 #000',
                            lineHeight: 1.1,
                        }}>
                            "{typeWriter.displayedText}"
                        </div>
                        <div style={{
                            marginTop: 16,
                            fontSize: 24,
                            fontWeight: 'bold',
                            color: colors.line,
                            letterSpacing: '.2em',
                            textTransform: 'uppercase',
                            textShadow: '1px 1px 0 #000'
                        }}>
                            — {data?.speaker}
                        </div>
                    </div>

                </div>
            </div>

            <style>{`
        @keyframes slashIn {
          0% { transform: skewY(-5deg) scaleY(0); opacity: 0; }
          100% { transform: skewY(-5deg) scaleY(1); opacity: 1; }
        }
        @keyframes slideRight {
          0% { transform: translateX(-50px); opacity: 0; }
          100% { transform: translateX(0); opacity: 1; }
        }
      `}</style>
        </div>
    );
}
