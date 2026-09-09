import { useEffect, useState } from 'react';

// Una sola rama según breakpoint lg; sin window asume escritorio.
export function useDesktopBreakpoint(query = '(min-width: 1024px)'): boolean {
  const [matches, setMatches] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : true,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    setMatches(list.matches);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    if (typeof list.addEventListener === 'function') list.addEventListener('change', onChange);
    else list.addListener(onChange);
    return () => {
      if (typeof list.removeEventListener === 'function') list.removeEventListener('change', onChange);
      else list.removeListener(onChange);
    };
  }, [query]);

  return matches;
}
