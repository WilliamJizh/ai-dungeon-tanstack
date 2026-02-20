import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Word-by-word text reveal hook.
 * Splits text on spaces and reveals one word at a time at ~40ms intervals.
 * Returns displayedText, isDone, and skip() to instantly show full text.
 */
export function useTypewriter(
  text: string,
  enabled: boolean,
): { displayedText: string; isDone: boolean; skip: () => void } {
  const [wordIndex, setWordIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wordsRef = useRef<string[]>([]);

  // Split text into words whenever text changes
  const words = text ? text.split(' ') : [];
  wordsRef.current = words;

  // Reset when text changes
  useEffect(() => {
    if (!enabled) return;
    setWordIndex(0);

    intervalRef.current = setInterval(() => {
      setWordIndex(prev => {
        const next = prev + 1;
        if (next >= wordsRef.current.length) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return wordsRef.current.length;
        }
        return next;
      });
    }, 40);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [text, enabled]);

  const skip = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setWordIndex(wordsRef.current.length);
  }, []);

  if (!enabled) {
    return { displayedText: text, isDone: true, skip };
  }

  const isDone = wordIndex >= words.length;
  const displayedText = words.slice(0, wordIndex).join(' ');

  return { displayedText, isDone, skip };
}
