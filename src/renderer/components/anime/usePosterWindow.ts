import { useEffect, useRef, useState } from 'react';

type ObserverPool = {
  observer: IntersectionObserver;
  targets: Map<Element, () => void>;
};

const pools = new WeakMap<Element, ObserverPool>();
const POSTER_LOOKAHEAD = '240px 0px';

function observe(root: Element, target: Element, load: () => void) {
  let pool = pools.get(root);
  if (!pool) {
    const targets = new Map<Element, () => void>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) targets.get(entry.target)?.();
      },
      { root, rootMargin: POSTER_LOOKAHEAD },
    );
    pool = { observer, targets };
    pools.set(root, pool);
  }
  const { observer, targets } = pool;
  const stop = () => {
    if (!targets.delete(target)) return;
    observer.unobserve(target);
    if (targets.size === 0) {
      observer.disconnect();
      pools.delete(root);
    }
  };
  targets.set(target, () => {
    stop();
    load();
  });
  observer.observe(target);
  return stop;
}

export function usePosterWindow(deferred: boolean, priority: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [released, setReleased] = useState(priority);
  const waiting = deferred && !released;
  useEffect(() => {
    if (priority && !released) {
      setReleased(true);
      return;
    }
    if (!waiting) return;
    const target = ref.current;
    const root = target?.closest('[data-view-scroller]');
    if (!target || !root || typeof IntersectionObserver === 'undefined') {
      setReleased(true);
      return;
    }
    return observe(root, target, () => setReleased(true));
  }, [waiting, priority, released]);
  return { ref, waiting };
}
