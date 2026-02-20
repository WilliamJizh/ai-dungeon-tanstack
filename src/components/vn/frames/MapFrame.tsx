import { useState, useEffect } from 'react';
import type { VNFrame } from '../../../../server/vn/types/vnFrame';
import type { VNPackage } from '../../../../server/vn/types/vnTypes';
import { resolveAsset } from '../../../lib/resolveAsset';

interface MapFrameProps {
  frame: VNFrame;
  pack: VNPackage;
  onAdvance: () => void;
  onChoiceSelect?: (id: string) => void;
}

/**
 * Map frame: world map with location nodes overlaid on a background image.
 *
 * Accessible nodes are clickable (calls onChoiceSelect).
 * Current location pulses with amber highlight.
 * Escape closes the map.
 */
export function MapFrame({ frame, pack, onAdvance, onChoiceSelect }: MapFrameProps) {
  const mapData = frame.mapData;
  const [hoveredLocation, setHoveredLocation] = useState<string | null>(null);

  const mapBg = resolveAsset(mapData?.backgroundAsset, pack);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onAdvance();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onAdvance]);

  if (!mapData) return null;

  const currentLocationId = mapData.currentLocationId;
  const hoveredLoc = mapData.locations.find((l) => l.id === hoveredLocation);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#000',
        fontFamily: "VT323, 'Courier New', monospace",
        overflow: 'hidden',
      }}
    >
      {/* Map background */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${mapBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'grayscale(.3) brightness(.6)',
        }}
      />

      {/* Top gradient */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(to bottom, rgba(0,0,0,.6) 0%, transparent 25%)',
          pointerEvents: 'none',
        }}
      />
      {/* Bottom gradient */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(to top, rgba(0,0,0,.7) 0%, transparent 40%)',
          pointerEvents: 'none',
        }}
      />

      {/* Header bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          padding: '14px 20px',
        }}
      >
        <div
          style={{
            fontSize: 18,
            letterSpacing: '.4em',
            color: 'rgba(255,255,255,.7)',
          }}
        >
          [ WORLD MAP ]
        </div>
      </div>

      {/* Location nodes */}
      {mapData.locations.map((location) => {
        const isCurrent = location.id === currentLocationId;
        const isAccessible = location.accessible && !isCurrent;
        const isVisited = location.visited && !isCurrent;
        const isHovered = hoveredLocation === location.id;
        const isInaccessible = !location.accessible && !isCurrent;

        return (
          <div
            key={location.id}
            style={{
              position: 'absolute',
              left: `${location.x}%`,
              top: `${location.y}%`,
              transform: 'translate(-50%, -50%)',
              zIndex: 15,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
            onMouseEnter={() => setHoveredLocation(location.id)}
            onMouseLeave={() => setHoveredLocation(null)}
            onClick={() => {
              if (isAccessible) {
                onChoiceSelect?.(location.id);
              }
            }}
          >
            {/* Tooltip */}
            {isHovered && location.description && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '120%',
                  whiteSpace: 'nowrap',
                  fontSize: 12,
                  background: 'rgba(0,0,0,.7)',
                  padding: '4px 8px',
                  borderRadius: 3,
                  color: 'rgba(255,255,255,.8)',
                  letterSpacing: '.06em',
                  pointerEvents: 'none',
                }}
              >
                {location.description}
              </div>
            )}

            {/* Node ring */}
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: isAccessible ? 'pointer' : 'default',
                opacity: isInaccessible ? 0.3 : 1,
                ...(isCurrent
                  ? {
                      border: '2px solid #facc15',
                      boxShadow: '0 0 12px rgba(250,204,21,.5)',
                      animation: 'mapPulse 1.5s ease-in-out infinite',
                    }
                  : isAccessible
                    ? {
                        border: `2px solid ${isHovered ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,.7)'}`,
                      }
                    : isVisited
                      ? {
                          border: '1px solid rgba(255,255,255,.4)',
                        }
                      : {
                          border: '1px solid rgba(255,255,255,.3)',
                        }),
              }}
            >
              {/* Center dot */}
              <div
                style={{
                  borderRadius: '50%',
                  ...(isCurrent
                    ? {
                        width: 20,
                        height: 20,
                        background: '#facc15',
                      }
                    : isAccessible
                      ? {
                          width: 12,
                          height: 12,
                          background: isHovered
                            ? '#fff'
                            : 'rgba(255,255,255,.6)',
                        }
                      : isVisited
                        ? {
                            width: 8,
                            height: 8,
                            background: 'rgba(255,255,255,.35)',
                          }
                        : {
                            width: 10,
                            height: 10,
                            background: 'rgba(255,255,255,.2)',
                          }),
                }}
              />
            </div>

            {/* Label */}
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                marginTop: 4,
                whiteSpace: 'nowrap',
                fontSize: 15,
                letterSpacing: '.12em',
                color: isCurrent
                  ? '#facc15'
                  : isAccessible
                    ? isHovered
                      ? '#fff'
                      : 'rgba(255,255,255,.85)'
                    : 'rgba(255,255,255,.3)',
              }}
            >
              {location.label}
            </div>
          </div>
        );
      })}

      {/* Bottom bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '16px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          zIndex: 20,
        }}
      >
        <div
          style={{
            fontSize: 14,
            letterSpacing: '.18em',
            color: 'rgba(255,255,255,.45)',
          }}
        >
          {hoveredLoc?.description
            ? hoveredLoc.description
            : 'SELECT A DESTINATION'}
        </div>
        <div
          style={{
            fontSize: 14,
            letterSpacing: '.18em',
            color: 'rgba(255,255,255,.45)',
          }}
        >
          [ ESC ] CLOSE MAP
        </div>
      </div>

      {/* Pulse animation keyframes */}
      <style>{`
        @keyframes mapPulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.08); }
        }
      `}</style>
    </div>
  );
}
