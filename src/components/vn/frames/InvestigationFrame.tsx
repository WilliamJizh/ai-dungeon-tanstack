import { useCallback } from 'react';
import type { VNFrame } from '../../../../server/vn/types/vnFrame';
import type { VNPackage } from '../../../../server/vn/types/vnTypes';
import { resolveAsset } from '../../../lib/resolveAsset';
import { FONT_MAIN } from '../../../lib/fonts';

interface InvestigationFrameProps {
    frame: VNFrame;
    pack: VNPackage;
    onFreeTextSubmit?: (text: string) => void;
}

export function InvestigationFrame({ frame, pack, onFreeTextSubmit }: InvestigationFrameProps) {
    const data = frame.investigationData;
    const bg = data?.backgroundAsset ? resolveAsset(data.backgroundAsset, pack) : null;

    const handleHotspotClick = useCallback((id: string) => {
        onFreeTextSubmit?.(`[investigate] ${id}`);
    }, [onFreeTextSubmit]);

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                background: '#000',
                fontFamily: FONT_MAIN,
                overflow: 'hidden',
                position: 'relative',
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
                        filter: 'brightness(.6)',
                    }}
                />
            )}

            {/* Screen tint/scanline effect */}
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.1) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.03), rgba(0, 255, 0, 0.01), rgba(0, 0, 255, 0.03))',
                    backgroundSize: '100% 2px, 3px 100%',
                    pointerEvents: 'none',
                }}
            />

            {/* Hotspot List Overlay */}
            <div
                style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    bottom: 0,
                    width: 320,
                    background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.85) 40%, rgba(0,0,0,0.95))',
                    padding: '40px 30px',
                    display: 'flex',
                    flexDirection: 'column',
                    borderLeft: '1px solid rgba(140,210,255,0.1)',
                }}
            >
                <div style={{ fontSize: 13, letterSpacing: '.4em', color: 'rgba(140,210,255,0.8)', marginBottom: 24, textTransform: 'uppercase' }}>
                    INVESTIGATION MODE
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflowY: 'auto' }}>
                    {data?.hotspots.map((h, i) => (
                        <button
                            key={h.id}
                            onClick={() => handleHotspotClick(h.id)}
                            className="investigation-hotspot"
                            style={{
                                background: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderLeft: '3px solid rgba(140,210,255,0.6)',
                                padding: '16px',
                                textAlign: 'left',
                                color: 'rgba(255,255,255,0.9)',
                                fontFamily: FONT_MAIN,
                                fontSize: 16,
                                letterSpacing: '.05em',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                position: 'relative',
                            }}
                        >
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>TARGET 0{i + 1}</div>
                            {h.label}

                            <div
                                className="target-reticle"
                                style={{
                                    position: 'absolute',
                                    right: 16,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    opacity: 0,
                                    transition: 'opacity 0.2s',
                                    color: 'rgba(140,210,255,1)',
                                }}
                            >
                                ⌖
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            <style>{`
        .investigation-hotspot:hover {
          background: rgba(140,210,255,0.1) !important;
          border-color: rgba(140,210,255,0.3) !important;
          transform: translateX(-4px);
        }
        .investigation-hotspot:hover .target-reticle {
          opacity: 1 !important;
        }
      `}</style>
        </div>
    );
}
