import { useCallback, useEffect } from 'react';
import type { VNFrame } from '../../../../server/vn/types/vnFrame';
import type { VNPackage } from '../../../../server/vn/types/vnTypes';
import { useTypewriter } from '../hooks/useTypewriter';
import { FONT_MAIN } from '../../../lib/fonts';

interface CenteredMonologueFrameProps {
    frame: VNFrame;
    pack: VNPackage;
    onAdvance: () => void;
}

export function CenteredMonologueFrame({ frame, onAdvance }: CenteredMonologueFrameProps) {
    const data = frame.monologue;

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

    return (
        <div
            onClick={handleClick}
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%',
                background: '#040404',
                fontFamily: FONT_MAIN,
                overflow: 'hidden',
                cursor: 'default',
                padding: '0 10%',
            }}
        >
            <div style={{ maxWidth: 800, textAlign: 'center' }}>
                {data?.speaker && (
                    <div style={{ fontSize: 14, letterSpacing: '.3em', color: 'rgba(255,255,255,.3)', marginBottom: 24, textTransform: 'uppercase' }}>
                        {data.speaker}
                    </div>
                )}
                <p style={{
                    fontSize: 28,
                    lineHeight: 1.8,
                    color: 'rgba(255,255,255,.85)',
                    letterSpacing: '.05em',
                    margin: 0,
                }}>
                    {typeWriter.displayedText}
                </p>
            </div>
        </div>
    );
}
