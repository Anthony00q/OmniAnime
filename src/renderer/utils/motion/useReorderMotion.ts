import { useCallback, useLayoutEffect, useRef } from 'react';
import { animate, type JSAnimation } from 'animejs';
import { MOTION_DURATION, easeOut } from './tokens';
import { useReducedMotion } from './useReducedMotion';

export function useReorderMotion() {
  const rowsRef = useRef(new Map<string, HTMLElement>());
  const beforeRef = useRef<Map<string, number> | null>(null);
  const animationRef = useRef<JSAnimation | null>(null);
  const reduced = useReducedMotion();

  const stop = useCallback(() => {
    const animation = animationRef.current;
    animationRef.current = null;
    animation?.revert();
  }, []);

  useLayoutEffect(() => stop, [stop]);

  useLayoutEffect(() => {
    const before = beforeRef.current;
    beforeRef.current = null;
    if (reduced) {
      stop();
      return;
    }
    if (!before) return;
    stop();
    const deltas = new Map<HTMLElement, number>();
    before.forEach((top, key) => {
      const row = rowsRef.current.get(key);
      if (!row) return;
      const delta = top - row.getBoundingClientRect().top;
      if (Number.isFinite(delta) && Math.abs(delta) >= 1) deltas.set(row, delta);
    });
    if (deltas.size === 0) return;
    const animation = animate([...deltas.keys()], {
      translateY: (target: unknown) => [deltas.get(target as HTMLElement) ?? 0, 0],
      duration: MOTION_DURATION.base,
      ease: easeOut,
      onComplete: () => {
        if (animationRef.current === animation) stop();
      },
    });
    animationRef.current = animation;
  });

  const registerRow = useCallback((key: string, row: HTMLElement | null) => {
    if (row) rowsRef.current.set(key, row);
    else rowsRef.current.delete(key);
  }, []);

  const prepareFlip = useCallback(() => {
    const before = new Map<string, number>();
    rowsRef.current.forEach((row, key) => before.set(key, row.getBoundingClientRect().top));
    beforeRef.current = before;
  }, []);

  return { registerRow, prepareFlip };
}
