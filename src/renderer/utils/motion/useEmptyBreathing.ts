import { useLayoutEffect, useRef, type RefObject } from 'react';
import { animate, cubicBezier } from 'animejs';
import { EMPTY_BREATH_DURATION, EMPTY_ICON_OPACITY, EMPTY_ICON_MIN_OPACITY } from './tokens';
import { useReducedMotion } from './useReducedMotion';

export function useEmptyBreathing(active: boolean): RefObject<HTMLDivElement | null> {
  const targetRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    const element = targetRef.current;
    if (!element || !active || reduced) return;

    const breathing = animate(element, {
      opacity: [EMPTY_ICON_OPACITY, EMPTY_ICON_MIN_OPACITY],
      duration: EMPTY_BREATH_DURATION / 2,
      ease: cubicBezier(0.4, 0, 0.6, 1),
      alternate: true,
      loop: true,
      autoplay: !document.hidden,
    });
    const syncVisibility = () => {
      if (document.hidden) breathing.pause();
      else breathing.resume();
    };
    document.addEventListener('visibilitychange', syncVisibility);
    return () => {
      document.removeEventListener('visibilitychange', syncVisibility);
      breathing.revert();
    };
  }, [active, reduced]);

  return targetRef;
}
