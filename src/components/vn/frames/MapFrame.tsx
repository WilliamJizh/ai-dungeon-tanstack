import { useState, useEffect, useRef, useCallback } from 'react';
import type { VNFrame } from '../../../../server/vn/types/vnFrame';
import type { VNPackage } from '../../../../server/vn/types/vnTypes';
import { resolveAsset } from '../../../lib/resolveAsset';
import { t } from '../../../lib/i18n';
import { useLocale } from '../../../context/LocaleContext';

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
 * Drag to pan the map around.
 */
export function MapFrame({ frame, pack, onAdvance, onChoiceSelect }: MapFrameProps) {
  const { locale } = useLocale();
  const mapData = frame.mapData;
  const [hoveredLocation, setHoveredLocation] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const PAN_LIMIT = 300;

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Only pan if not clicking on a location node
    if ((e.target as HTMLElement).closest('[data-location]')) return;
    dragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    panStart.current = { ...pan };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [pan]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPan({
      x: Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, panStart.current.x + dx)),
      y: Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, panStart.current.y + dy)),
    });
  }, []);

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

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

  // Layered map: read level from mapData (region, area, or default world)
  const mapLevel = (mapData as Record<string, unknown>).level as
    | 'region'
    | 'area'
    | undefined;
  const headerKey =
    mapLevel === 'region'
      ? 'map_title_region'
      : mapLevel === 'area'
        ? 'map_title_area'
        : 'map_title';

  const ENCOUNTER_ICONS: Record<string, string> = {
    combat: '\u2694\uFE0F',
    dialogue: '\uD83D\uDCAC',
    explore: '\uD83D\uDD0D',
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#000',
        fontFamily: "VT323, 'Courier New', monospace",
        overflow: 'hidden',
        cursor: dragging.current ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Map background — pannable */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${mapBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'grayscale(.3) brightness(.6)',
          transform: `translate(${pan.x}px, ${pan.y}px)`,
          transition: dragging.current ? 'none' : 'transform 0.1s ease-out',
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
          {t(headerKey, locale)}
        </div>
      </div>

      {/* Location nodes — pannable with background */}
      {mapData.locations.map((location) => {
        const isCurrent = location.id === currentLocationId;
        const isAccessible = location.accessible && !isCurrent;
        const isVisited = location.visited && !isCurrent;
        const isHovered = hoveredLocation === location.id;
        const isInaccessible = !location.accessible && !isCurrent;

        return (
          <div
            key={location.id}
            data-location
            style={{
              position: 'absolute',
              left: `calc(${location.x}% + ${pan.x}px)`,
              top: `calc(${location.y}% + ${pan.y}px)`,
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

            {/* Label + encounter type icon */}
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
                display: 'flex',
                alignItems: 'center',
                gap: 4,
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
              {(() => {
                const enc = (location as Record<string, unknown>)
                  .encounterType as string | undefined;
                const icon = enc ? ENCOUNTER_ICONS[enc] : undefined;
                return icon ? (
                  <span style={{ fontSize: 13, lineHeight: 1 }}>{icon}</span>
                ) : null;
              })()}
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
            : t('select_destination', locale)}
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <div
            style={{
              fontSize: 14,
              letterSpacing: '.18em',
              color: 'rgba(255,255,255,.35)',
            }}
          >
            DRAG TO PAN
          </div>
          <div
            style={{
              fontSize: 14,
              letterSpacing: '.18em',
              color: 'rgba(255,255,255,.45)',
            }}
          >
            {t('close_map', locale)}
          </div>
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
