import { useState, useEffect, useCallback } from 'react';
import type { VNFrame } from '../../../../server/vn/types/vnFrame';
import type { VNPackage } from '../../../../server/vn/types/vnTypes';
import { resolveAsset } from '../../../lib/resolveAsset';
import { t } from '../../../lib/i18n';
import { useLocale } from '../../../context/LocaleContext';
import { FONT_MAIN } from '../../../lib/fonts';

interface InventoryFrameProps {
  frame: VNFrame;
  pack: VNPackage;
  onAdvance: () => void;
  onChoiceSelect?: (id: string) => void;
}

/**
 * Inventory frame: item grid with detail panel, keyboard navigation.
 *
 * Modes:
 *  - 'view': display-only, ESC/click to close
 *  - 'select': player picks an item, Enter to confirm
 */
export function InventoryFrame({ frame, pack, onAdvance, onChoiceSelect }: InventoryFrameProps) {
  const { locale } = useLocale();
  const inv = frame.inventoryData;
  const items = inv?.items ?? [];
  const mode = inv?.mode ?? 'view';

  const [selectedIndex, setSelectedIndex] = useState(0);

  const bg = frame.panels[0]?.backgroundAsset
    ? resolveAsset(frame.panels[0].backgroundAsset, pack)
    : null;

  const handleClose = useCallback(() => {
    onAdvance();
  }, [onAdvance]);

  const handleSelect = useCallback(() => {
    if (mode === 'select' && items.length > 0) {
      onChoiceSelect?.(items[selectedIndex].id);
    }
  }, [mode, items, selectedIndex, onChoiceSelect]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => {
          const cols = 4;
          return i >= cols ? i - cols : i;
        });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => {
          const cols = 4;
          return i + cols < items.length ? i + cols : i;
        });
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(items.length - 1, i + 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleSelect();
      } else if (e.key === 'Escape' || e.key === 'i') {
        e.preventDefault();
        handleClose();
      } else if (e.code === 'Space' && mode === 'view') {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [items.length, mode, handleSelect, handleClose]);

  const selected = items[selectedIndex] ?? null;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#0c0c0c',
        fontFamily: FONT_MAIN,
        overflow: 'hidden',
      }}
    >
      {/* Background */}
      {bg && (
        <>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url(${bg})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              filter: 'grayscale(.6) brightness(.3)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,.82)',
            }}
          />
        </>
      )}

      {/* Main panel */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          padding: '24px 28px',
          zIndex: 10,
        }}
      >
        {/* Top header */}
        <div>
          <div
            style={{
              fontSize: 22,
              letterSpacing: '.4em',
              color: 'rgba(255,255,255,.7)',
              marginBottom: 4,
            }}
          >
            {t('inventory_title', locale)}
          </div>
          {inv?.prompt && (
            <div
              style={{
                fontSize: 14,
                fontStyle: 'italic',
                color: 'rgba(255,255,255,.4)',
                letterSpacing: '.06em',
              }}
            >
              {inv.prompt}
            </div>
          )}
        </div>

        {/* Main content */}
        <div
          style={{
            display: 'flex',
            flex: 1,
            gap: 20,
            overflow: 'hidden',
            marginTop: 16,
          }}
        >
          {/* Left: item grid */}
          <div
            style={{
              flex: 1,
              overflow: 'auto',
            }}
          >
            {items.length > 0 ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 10,
                }}
              >
                {items.map((item, i) => {
                  const isSelected = i === selectedIndex;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedIndex(i)}
                      style={{
                        padding: 12,
                        borderRadius: 4,
                        border: `1px solid ${isSelected ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.08)'}`,
                        background: isSelected
                          ? 'rgba(255,255,255,.1)'
                          : 'rgba(255,255,255,.04)',
                        color: isSelected ? '#fff' : 'rgba(255,255,255,.6)',
                        cursor: 'pointer',
                        position: 'relative',
                      }}
                    >
                      {/* Equipped badge */}
                      {item.equipped && (
                        <div
                          style={{
                            position: 'absolute',
                            top: 4,
                            right: 6,
                            fontSize: 10,
                            letterSpacing: '.08em',
                            color: '#facc15',
                          }}
                        >
                          {t('equipped', locale)}
                        </div>
                      )}
                      {/* Icon */}
                      <div
                        style={{
                          fontSize: 28,
                          display: 'block',
                          marginBottom: 6,
                          textAlign: 'center',
                        }}
                      >
                        {item.icon}
                      </div>
                      {/* Name */}
                      <div
                        style={{
                          fontSize: 14,
                          letterSpacing: '.1em',
                          textAlign: 'center',
                          lineHeight: 1.2,
                        }}
                      >
                        {item.name}
                      </div>
                      {/* Quantity */}
                      {item.quantity > 1 && (
                        <div
                          style={{
                            fontSize: 12,
                            color: 'rgba(255,255,255,.35)',
                            textAlign: 'center',
                            marginTop: 4,
                          }}
                        >
                          x{item.quantity}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  fontSize: 18,
                  letterSpacing: '.3em',
                  color: 'rgba(255,255,255,.2)',
                }}
              >
                {t('inventory_empty', locale)}
              </div>
            )}
          </div>

          {/* Right: detail panel */}
          <div
            style={{
              width: 200,
              flexShrink: 0,
              background: 'rgba(0,0,0,.45)',
              border: '1px solid rgba(255,255,255,.07)',
              borderRadius: 4,
              padding: 16,
              overflow: 'auto',
            }}
          >
            {selected ? (
              <>
                <div
                  style={{
                    fontSize: 42,
                    textAlign: 'center',
                    marginBottom: 8,
                  }}
                >
                  {selected.icon}
                </div>
                <div
                  style={{
                    fontSize: 18,
                    color: '#fff',
                    textAlign: 'center',
                  }}
                >
                  {selected.name}
                </div>
                {selected.equipped && (
                  <div
                    style={{
                      display: 'inline-block',
                      margin: '6px auto 0',
                      padding: '2px 8px',
                      borderRadius: 10,
                      fontSize: 11,
                      letterSpacing: '.12em',
                      color: '#facc15',
                      border: '1px solid rgba(250,204,21,.35)',
                      background: 'rgba(250,204,21,.1)',
                      width: 'fit-content',
                    }}
                  >
                    EQUIPPED
                  </div>
                )}
                <div
                  style={{
                    fontSize: 13,
                    color: 'rgba(255,255,255,.5)',
                    lineHeight: 1.6,
                    marginTop: 8,
                  }}
                >
                  {selected.description}
                </div>
                {selected.effect && (
                  <div
                    style={{
                      fontSize: 12,
                      color: 'rgba(74,222,128,.7)',
                      marginTop: 8,
                      letterSpacing: '.04em',
                    }}
                  >
                    {selected.effect}
                  </div>
                )}
              </>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  fontSize: 14,
                  color: 'rgba(255,255,255,.2)',
                }}
              >
                NO ITEM
              </div>
            )}
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            marginTop: 12,
            textAlign: 'center',
            fontSize: 14,
            letterSpacing: '.22em',
            color: 'rgba(255,255,255,.3)',
          }}
        >
          {mode === 'select' && items.length > 0 ? (
            <span>
              {selected?.name ?? 'ITEM'} selected &mdash; [ENTER] to use &nbsp;&nbsp; [ARROWS] navigate
            </span>
          ) : (
            <span>{t('close_hint', locale)}</span>
          )}
        </div>
      </div>
    </div>
  );
}
