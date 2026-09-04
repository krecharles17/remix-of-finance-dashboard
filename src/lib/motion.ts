import { useEffect, useRef, useState } from "react";

/** Cubic ease-out — the house curve. */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Counts a number up from zero on mount (after an optional delay).
 * Uses rAF so it stays in step with the rest of the page-load sequence.
 */
export function useCountUp(target: number, duration = 1400, delay = 0): number {
  const [value, setValue] = useState(0);
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    let raf = 0;
    let start = 0;
    let timer: ReturnType<typeof setTimeout>;
    const from = 0;

    const tick = (now: number) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / duration);
      setValue(from + (targetRef.current - from) * easeOut(t));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setValue(targetRef.current);
    };

    timer = setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, delay);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [duration, delay]);

  // If the target changes after the initial count-up, glide to it.
  const settledRef = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => {
      settledRef.current = true;
    }, delay + duration);
    return () => clearTimeout(t);
  }, [delay, duration]);

  useEffect(() => {
    if (!settledRef.current) return;
    let raf = 0;
    let start = 0;
    const from = value;
    const to = target;
    const tick = (now: number) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / 520);
      setValue(from + (to - from) * easeOut(t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return value;
}

/**
 * Returns true once `delay` ms have elapsed since mount — the primitive the
 * single page-load sequence is built from.
 */
export function useStage(delay: number): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return on;
}

/** Observed width/height of an element, for responsive SVG charts. */
export function useMeasure<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [rect, setRect] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setRect({ width: r.width, height: r.height });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setRect({ width: r.width, height: r.height });
    return () => ro.disconnect();
  }, []);

  return { ref, ...rect };
}
