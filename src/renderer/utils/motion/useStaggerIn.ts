import { useLayoutEffect, useRef, type RefObject } from 'react';
import { animate, type JSAnimation } from 'animejs';
import { MOTION_DURATION, MOTION_FADE_MS, MOTION_RISE_PX, easeOut, springEase, staggerDelay } from './tokens';
import { resolveStaggerPlan, type StaggerSnapshot } from './staggerSequence';
import { useReducedMotion } from './useReducedMotion';

interface StaggerInOptions {
  disabled?: boolean;
  replay?: unknown;
  scopeKey?: unknown;
  flat?: boolean;
}

export function useStaggerIn<T extends HTMLElement = HTMLElement>(
  keys: readonly (string | null)[],
  { disabled = false, replay, scopeKey = 'default', flat = false }: StaggerInOptions = {},
): RefObject<T | null> {
  const containerRef = useRef<T>(null);
  const reduced = useReducedMotion();
  const snapshotRef = useRef<StaggerSnapshot | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      // Un grid desmontado no tiene nada animado todavía: al volver, entran todos.
      snapshotRef.current = null;
      return;
    }

    const items = Array.from(container.children) as HTMLElement[];
    const plan = resolveStaggerPlan(snapshotRef.current, keys, scopeKey, replay);
    snapshotRef.current = plan.snapshot;
    if (disabled) return;

    // Las claves y los hijos deben corresponder 1:1 para evitar animar otra tarjeta.
    if (items.length !== keys.length) {
      snapshotRef.current = {
        ...plan.snapshot,
        keys: null,
        pendingReplay: false,
        suppressHydration: true,
      };
      return;
    }

    const entering = plan.indexes.map((index) => items[index]);
    if (entering.length === 0) return;

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
            delay: (_target, index) => staggerDelay(index ?? 0, entering.length),
            ease: springEase(MOTION_DURATION.enter),
            onComplete: clear,
          });
    return () => {
      entrance.revert();
      clear();
    };
  }, [keys, disabled, reduced, replay, scopeKey, flat]);

  return containerRef;
}
