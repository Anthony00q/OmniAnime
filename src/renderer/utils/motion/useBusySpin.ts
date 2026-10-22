import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { waapi, type WAAPIAnimation } from 'animejs';
import { LOADING_SPIN_DURATION } from './tokens';
import { useReducedMotion } from './useReducedMotion';

export function useBusySpin(scope: unknown) {
  const ref = useRef<SVGSVGElement>(null);
  const [busy, setBusy] = useState(false);
  const reduced = useReducedMotion();
  const lifecycle = useRef({
    active: false,
    version: 0,
    running: false,
    pending: false,
    animation: null as WAAPIAnimation | null,
    finishFeedback: null as (() => void) | null,
  });

  useLayoutEffect(() => {
    const state = lifecycle.current;
    state.active = true;
    state.running = false;
    setBusy(false);
    return () => {
      state.active = false;
      state.version += 1;
      state.finishFeedback?.();
    };
  }, [scope]);

  useLayoutEffect(() => {
    if (reduced) lifecycle.current.finishFeedback?.();
  }, [reduced]);

  const run = useCallback(
    async <T>(task: () => Promise<T>): Promise<T | undefined> => {
      const state = lifecycle.current;
      if (!state.active || state.running) return;
      const version = ++state.version;
      state.running = true;
      state.pending = true;
      setBusy(true);

      const feedback = new Promise<void>((resolve) => {
        let stopped = false;
        const finish = () => {
          if (stopped) return;
          stopped = true;
          state.animation?.revert();
          state.animation = null;
          state.finishFeedback = null;
          resolve();
        };
        state.finishFeedback = finish;
        const icon = ref.current;
        if (!icon || reduced) {
          finish();
          return;
        }
        let angle = 0;
        const turn = () => {
          state.animation = waapi.animate(icon, {
            rotate: [angle, angle + 360],
            duration: LOADING_SPIN_DURATION,
            ease: 'linear',
            onComplete: () => {
              if (stopped || !state.active || state.version !== version) return;
              if (state.pending) {
                angle += 360;
                state.animation?.revert();
                turn();
              } else finish();
            },
          });
        };
        turn();
      });
      const operation = Promise.resolve()
        .then(task)
        .finally(() => {
          if (state.version === version) state.pending = false;
        });
      const [result] = await Promise.allSettled([operation, feedback]);
      if (!state.active || state.version !== version) return;
      state.running = false;
      setBusy(false);
      if (result.status === 'rejected') throw result.reason;
      return result.value;
    },
    [reduced],
  );

  return { ref, busy, run };
}
