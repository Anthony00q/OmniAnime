import { useLayoutEffect, useRef, type RefObject } from 'react';
import { animate, type JSAnimation } from 'animejs';
import { MOTION_DURATION, MOTION_FADE_MS, MOTION_RISE_PX, easeOut, springEase, staggerDelay } from './tokens';
import { useReducedMotion } from './useReducedMotion';

interface StaggerInOptions {
  disabled?: boolean;
  replay?: unknown;
  flat?: boolean;
}

export function useStaggerIn<T extends HTMLElement = HTMLElement>(
  count: number,
  { disabled = false, replay, flat = false }: StaggerInOptions = {},
): RefObject<T | null> {
  const containerRef = useRef<T>(null);
  const reduced = useReducedMotion();
  const enteredRef = useRef(0);
  const lastReplayRef = useRef<unknown>(replay);

  useLayoutEffect(() => {
    const replayChanged = lastReplayRef.current !== replay;
    lastReplayRef.current = replay;
    const container = containerRef.current;
    if (!container) {
      // Un grid desmontado no tiene nada animado todavía: al volver, entran todos.
      enteredRef.current = 0;
      return;
    }
    if (disabled) return;
    const items = Array.from(container.children) as HTMLElement[];
    if (replayChanged) {
      enteredRef.current = 0;
    } else if (items.length < enteredRef.current) {
      enteredRef.current = items.length;
      return;
    }
    const entering = items.slice(enteredRef.current);
    if (entering.length === 0) return;
    enteredRef.current = items.length;
    const clear = () => {
      for (const item of entering) {
        item.style.opacity = '';
        item.style.transform = '';
      }
    };
    const entrance: JSAnimation =
      reduced || flat
        ? animate(entering, {
            opacity: [0, 1],
            duration: reduced ? MOTION_FADE_MS : MOTION_DURATION.base,
            ease: easeOut,
            onComplete: clear,
          })
        : animate(entering, {
            opacity: [0, 1],
            translateY: [MOTION_RISE_PX, 0],
            delay: (_target, index) => staggerDelay(index ?? 0),
            ease: springEase(MOTION_DURATION.enter),
            onComplete: clear,
          });
    return () => {
      entrance.revert();
      clear();
    };
  }, [count, disabled, reduced, replay, flat]);

  return containerRef;
}
