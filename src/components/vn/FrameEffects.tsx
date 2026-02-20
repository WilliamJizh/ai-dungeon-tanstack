import { useEffect, useRef, useState } from 'react';
import type { VNEffect } from '../../../server/vn/types/vnFrame';

interface FrameEffectsProps {
  effects: VNEffect[];
  /** Ref to the frame container element that classes will be applied to. */
  containerRef: React.RefObject<HTMLDivElement>;
}

/**
 * Applies visual effects (shake, flash, fade, scan-lines) to a frame container.
 * Each effect is auto-cleared after its durationMs. Multiple effects can stack.
 */
export function FrameEffects({ effects, containerRef }: FrameEffectsProps) {
  const [flashEffects, setFlashEffects] = useState<VNEffect[]>([]);
  const [scanLines, setScanLines] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    // Clear old timers on new effects batch
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];

    for (const effect of effects) {
      if (effect.type === 'shake' && containerRef.current) {
        containerRef.current.classList.add('vn-effect-shake');
        const t = setTimeout(() => {
          containerRef.current?.classList.remove('vn-effect-shake');
        }, effect.durationMs);
        timersRef.current.push(t);
      }

      if (effect.type === 'flash') {
        setFlashEffects(prev => [...prev, effect]);
        const t = setTimeout(() => {
          setFlashEffects(prev => prev.filter(e => e !== effect));
        }, effect.durationMs);
        timersRef.current.push(t);
      }

      if (effect.type === 'scan-lines') {
        setScanLines(true);
        const t = setTimeout(() => setScanLines(false), effect.durationMs);
        timersRef.current.push(t);
      }

      if (effect.type === 'fade-in' && containerRef.current) {
        containerRef.current.style.opacity = '0';
        containerRef.current.style.transition = `opacity ${effect.durationMs}ms ease`;
        requestAnimationFrame(() => {
          if (containerRef.current) containerRef.current.style.opacity = '1';
        });
      }

      if (effect.type === 'fade-out' && containerRef.current) {
        containerRef.current.style.opacity = '1';
        containerRef.current.style.transition = `opacity ${effect.durationMs}ms ease`;
        requestAnimationFrame(() => {
          if (containerRef.current) containerRef.current.style.opacity = '0';
        });
      }
    }

    return () => { timersRef.current.forEach(clearTimeout); };
  }, [effects, containerRef]);

  return (
    <>
      {flashEffects.map((effect, i) => (
        <div
          key={i}
          data-testid="flash-overlay"
          style={{
            position: 'absolute', inset: 0, zIndex: 100,
            background: effect.color ?? '#fff',
            opacity: 0,
            transition: `opacity ${effect.durationMs}ms ease`,
            pointerEvents: 'none',
          }}
        />
      ))}
      {scanLines && (
        <div
          data-testid="scan-lines-overlay"
          className="vn-effect-scan-lines"
          style={{ position: 'absolute', inset: 0, zIndex: 50, pointerEvents: 'none' }}
        />
      )}
    </>
  );
}
