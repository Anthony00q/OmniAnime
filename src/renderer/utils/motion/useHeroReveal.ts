import { useLayoutEffect, useRef, type RefObject } from 'react';
import { animate, type JSAnimation } from 'animejs';
import { MOTION_DURATION, MOTION_FADE_MS, easeOut, springEase } from './tokens';
import { useReducedMotion } from './useReducedMotion';

const UNSET = Symbol('unset');
const HERO_REVEAL_SCALE = 1.03;

interface HeroRevealOptions {
  disabled?: boolean;
}

export function useHeroReveal<T extends HTMLElement = HTMLElement>(
  trigger: unknown,
  { disabled = false }: HeroRevealOptions = {},
): RefObject<T | null> {
  const targetRef = useRef<T>(null);
  const reduced = useReducedMotion();
  const previousRef = useRef<unknown>(UNSET);

  useLayoutEffect(() => {
    const previous = previousRef.current;
    previousRef.current = trigger;
    const el = targetRef.current;
    if (previous === trigger || !trigger || !el || disabled) return;
    const clear = () => {
      el.style.opacity = '';
      el.style.transform = '';
    };
    const reveal: JSAnimation = reduced
      ? animate(el, { opacity: [0, 1], duration: MOTION_FADE_MS, ease: easeOut, onComplete: clear })
      : animate(el, {
          opacity: [0, 1],
          scale: [HERO_REVEAL_SCALE, 1],
          ease: springEase(MOTION_DURATION.emphatic),
          onComplete: clear,
        });
    return () => {
      reveal.revert();
      clear();
    };
  }, [trigger, disabled, reduced]);

  return targetRef;
}
