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
  memory?: { snapshot: StaggerSnapshot | null };
}

export function useStaggerIn<T extends HTMLElement = HTMLElement>(
  keys: readonly (string | null)[],
  { disabled = false, replay, scopeKey = 'default', flat = false, memory }: StaggerInOptions = {},
): RefObject<T | null> {
  const containerRef = useRef<T>(null);
  const reduced = useReducedMotion();
  const snapshotRef = useRef<StaggerSnapshot | null>(null);
  const interruptedRef = useRef<{
    snapshot: StaggerSnapshot;
    keys: readonly (string | null)[];
    indexes: number[];
    reduced: boolean;
    flat: boolean;
  } | null>(null);

  useLayoutEffect(() => {
    const interrupted = interruptedRef.current;
    interruptedRef.current = null;
    const container = containerRef.current;
    if (!container) {
      snapshotRef.current = null;
      return;
    }

    const remember = (snapshot: StaggerSnapshot) => {
      snapshotRef.current = snapshot;
      if (memory) memory.snapshot = snapshot;
    };
    const items = Array.from(container.children) as HTMLElement[];
    const previous = memory ? memory.snapshot : snapshotRef.current;
    const plan = resolveStaggerPlan(previous, keys, scopeKey, replay);
    remember(plan.snapshot);
    if (disabled) return;

    // Las claves y los hijos deben corresponder 1:1 para evitar animar otra tarjeta.
    if (items.length !== keys.length) {
      remember({
        ...plan.snapshot,
        keys: null,
        pendingReplay: false,
        suppressHydration: true,
      });
      return;
    }

    const indexes =
      interrupted?.snapshot === previous &&
      interrupted.keys === keys &&
      interrupted.reduced === reduced &&
      interrupted.flat === flat &&
      previous.scopeKey === scopeKey &&
      previous.replay === replay
        ? interrupted.indexes
        : plan.indexes;
    const entering = indexes.map((index) => items[index]);
    if (entering.length === 0) return;

    let completed = false;
    const clear = () => {
      for (const item of entering) {
        item.style.opacity = '';
        item.style.transform = '';
      }
    };
    const onComplete = () => {
      completed = true;
      clear();
    };
    const entrance: JSAnimation =
      reduced || flat
        ? animate(entering, {
            opacity: [0, 1],
            duration: reduced ? MOTION_FADE_MS : MOTION_DURATION.base,
            ease: easeOut,
            onComplete,
          })
        : animate(entering, {
            opacity: [0, 1],
            translateY: [MOTION_RISE_PX, 0],
            delay: (_target, index) => staggerDelay(index ?? 0, entering.length),
            ease: springEase(MOTION_DURATION.enter),
            onComplete,
          });
    return () => {
      if (!completed) interruptedRef.current = { snapshot: plan.snapshot, keys, indexes, reduced, flat };
      entrance.revert();
      clear();
    };
  }, [keys, disabled, reduced, replay, scopeKey, flat, memory]);

  return containerRef;
}
