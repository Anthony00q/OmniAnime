import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY).matches : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(QUERY);
    setReduced(list.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    if (typeof list.addEventListener === 'function') list.addEventListener('change', onChange);
    else list.addListener(onChange);
    return () => {
      if (typeof list.removeEventListener === 'function') list.removeEventListener('change', onChange);
      else list.removeListener(onChange);
    };
  }, []);

  return reduced;
}
