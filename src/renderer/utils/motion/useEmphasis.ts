import { useLayoutEffect, useRef, type RefObject } from 'react';
import { animate, type JSAnimation } from 'animejs';
import { MOTION_DURATION, easeOut } from './tokens';
import { useReducedMotion } from './useReducedMotion';

interface EmphasisOptions {
  disabled?: boolean;
  mode?: 'pulse' | 'fade';
  duration?: number;
}

const UNSET = Symbol('unset');
const PULSE_SCALE = 1.12;

export function useEmphasis<T extends HTMLElement = HTMLElement>(
  trigger: unknown,
  { disabled = false, mode = 'pulse', duration = MOTION_DURATION.emphatic }: EmphasisOptions = {},
): RefObject<T | null> {
  const targetRef = useRef<T>(null);
  const reduced = useReducedMotion();
  const previousRef = useRef<unknown>(UNSET);

  useLayoutEffect(() => {
    const previous = previousRef.current;
    previousRef.current = trigger;
    const el = targetRef.current;
    if (previous === UNSET || previous === trigger || !el || disabled || reduced) return;
    const clear = () => {
      el.style.opacity = '';
      el.style.transform = '';
    };
    const emphasis: JSAnimation =
      mode === 'fade'
        ? animate(el, { opacity: [0, 1], duration, ease: easeOut, onComplete: clear })
        : animate(el, {
            keyframes: {
              '0%': { scale: 1, ease: 'out(2)' },
              '45%': { scale: PULSE_SCALE, ease: 'inOut(2)' },
              '100%': { scale: 1 },
            },
            duration,
            onComplete: clear,
          });
    return () => {
      emphasis.revert();
      clear();
    };
  }, [trigger, disabled, reduced, mode, duration]);

  return targetRef;
}
