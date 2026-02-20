import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';

type ScaleMode = 'fit' | 'cover';

type UseScaleManagerOptions = {
  baseWidth: number;
  baseHeight: number;
  mode?: ScaleMode;
  minScale?: number;
  maxScale?: number;
  minViewportWidth?: number;
  minViewportHeight?: number;
};

type UseScaleManagerResult = {
  containerRef: RefObject<HTMLDivElement>;
  scale: number;
  viewportWidth: number;
  viewportHeight: number;
  isViewportTooSmall: boolean;
  canvasStyle: CSSProperties;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getScale = (
  containerWidth: number,
  containerHeight: number,
  baseWidth: number,
  baseHeight: number,
  mode: ScaleMode,
) => {
  if (!containerWidth || !containerHeight || !baseWidth || !baseHeight) {
    return 1;
  }

  const widthRatio = containerWidth / baseWidth;
  const heightRatio = containerHeight / baseHeight;
  return mode === 'cover' ? Math.max(widthRatio, heightRatio) : Math.min(widthRatio, heightRatio);
};

export function useScaleManager({
  baseWidth,
  baseHeight,
  mode = 'fit',
  minScale = 0,
  maxScale = 1,
  minViewportWidth,
  minViewportHeight,
}: UseScaleManagerOptions): UseScaleManagerResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState(() => ({
    width: typeof window === 'undefined' ? baseWidth : window.innerWidth,
    height: typeof window === 'undefined' ? baseHeight : window.innerHeight,
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let frameId = 0;
    const updateSize = (width: number, height: number) => {
      setContainerSize((prev) => {
        if (prev.width === width && prev.height === height) {
          return prev;
        }
        return { width, height };
      });
    };

    const measure = () => {
      frameId = 0;
      updateSize(container.clientWidth, container.clientHeight);
    };

    const queueMeasure = () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(measure);
    };

    queueMeasure();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(queueMeasure);
      observer.observe(container);
      return () => {
        if (frameId) {
          cancelAnimationFrame(frameId);
        }
        observer.disconnect();
      };
    }

    window.addEventListener('resize', queueMeasure);
    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      window.removeEventListener('resize', queueMeasure);
    };
  }, []);

  const scale = useMemo(() => {
    const rawScale = getScale(containerSize.width, containerSize.height, baseWidth, baseHeight, mode);
    return clamp(rawScale, minScale, maxScale);
  }, [baseHeight, baseWidth, containerSize.height, containerSize.width, maxScale, minScale, mode]);

  const isViewportTooSmall = useMemo(() => {
    if (typeof minViewportWidth === 'number' && containerSize.width < minViewportWidth) {
      return true;
    }
    if (typeof minViewportHeight === 'number' && containerSize.height < minViewportHeight) {
      return true;
    }
    return false;
  }, [containerSize.height, containerSize.width, minViewportHeight, minViewportWidth]);

  const canvasStyle = useMemo<CSSProperties>(
    () => ({
      width: baseWidth,
      height: baseHeight,
      transform: `translate(-50%, -50%) scale(${scale})`,
      willChange: 'transform',
    }),
    [baseHeight, baseWidth, scale],
  );

  return {
    containerRef,
    scale,
    viewportWidth: containerSize.width,
    viewportHeight: containerSize.height,
    isViewportTooSmall,
    canvasStyle,
  };
}
