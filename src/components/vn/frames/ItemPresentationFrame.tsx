import { useCallback, useEffect } from 'react';
import type { VNFrame } from '../../../../server/vn/types/vnFrame';
import type { VNPackage } from '../../../../server/vn/types/vnTypes';
import { resolveAsset } from '../../../lib/resolveAsset';
import { useTypewriter } from '../hooks/useTypewriter';
import { FONT_MAIN } from '../../../lib/fonts';
import { t } from '../../../lib/i18n';
import { useLocale } from '../../../context/LocaleContext';

interface ItemPresentationFrameProps {
    frame: VNFrame;
    pack: VNPackage;
    onAdvance: () => void;
    isMuted?: boolean;
    onToggleMute?: () => void;
}

export function ItemPresentationFrame({ frame, pack, onAdvance }: ItemPresentationFrameProps) {
    const { locale } = useLocale();
    const data = frame.itemPresentation;
    const itemImg = data?.itemAsset ? resolveAsset(data.itemAsset, pack) : null;

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
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%',
                background: 'radial-gradient(circle at center, #1a1a2e 0%, #050505 80%)',
                fontFamily: FONT_MAIN,
                overflow: 'hidden',
                cursor: 'pointer',
                position: 'relative',
            }}
        >
            {/* Item Image */}
            {itemImg && (
                <img
                    src={itemImg}
                    alt={data?.itemName}
                    style={{
                        height: '40%',
                        objectFit: 'contain',
                        filter: 'drop-shadow(0 0 40px rgba(100, 200, 255, 0.3))',
                        animation: 'float 4s ease-in-out infinite',
                        marginBottom: 40,
                    }}
                />
            )}

            {/* Description Box */}
            {data && (
                <div
                    style={{
                        background: 'rgba(0,0,0,.75)',
                        border: '1px solid rgba(255,255,255,.15)',
                        borderTop: '2px solid rgba(140,210,255,.5)',
                        borderRadius: 6,
                        padding: '20px 40px',
                        textAlign: 'center',
                        maxWidth: 600,
                        width: '80%',
                        boxShadow: '0 10px 30px rgba(0,0,0,0.8)',
                    }}
                >
                    <div style={{ fontSize: 24, letterSpacing: '.1em', color: 'rgba(255,198,70,1)', marginBottom: 12 }}>
                        {data.itemName}
                    </div>
                    <p style={{ fontSize: 18, lineHeight: 1.6, color: 'rgba(255,255,255,.8)', margin: 0 }}>
                        {typeWriter.displayedText}
                    </p>
                </div>
            )}

            {/* Click indicator */}
            {typeWriter.isDone && (
                <div style={{ position: 'absolute', bottom: 30, fontSize: 13, letterSpacing: '.12em', color: 'rgba(255,255,255,.3)' }}>
                    {t('next_hint', locale)}
                </div>
            )}

            <style>{`
        @keyframes float {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-15px); }
          100% { transform: translateY(0px); }
        }
      `}</style>
        </div>
    );
}
