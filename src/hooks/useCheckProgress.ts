import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Simulated check progress hook.
 * Provides a smooth progress bar that advances towards ~95% over the expected duration,
 * then jumps to 100% when `complete()` is called.
 */
export function useCheckProgress(expectedDurationMs: number = 60_000) {
  const [progress, setProgress] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const startTimeRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  const tick = useCallback(() => {
    const elapsed = Date.now() - startTimeRef.current;
    // Ease-out curve: fast at start, slows approaching 95%
    const ratio = Math.min(elapsed / expectedDurationMs, 1);
    const eased = 1 - Math.pow(1 - ratio, 2); // quadratic ease-out
    const value = Math.min(eased * 95, 95); // cap at 95%
    setProgress(Math.round(value));

    if (ratio < 1) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [expectedDurationMs]);

  const start = useCallback(() => {
    setProgress(0);
    setIsRunning(true);
    startTimeRef.current = Date.now();
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const complete = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setProgress(100);
    // Keep 100% visible briefly, then reset
    setTimeout(() => {
      setIsRunning(false);
      setProgress(0);
    }, 800);
  }, []);

  const reset = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setIsRunning(false);
    setProgress(0);
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return { progress, isRunning, start, complete, reset };
}

/** Estimated durations per input mode */
export const ESTIMATED_DURATION: Record<string, number> = {
  text: 30_000,
  image: 45_000,
  audio: 60_000,
  video: 90_000,
};
