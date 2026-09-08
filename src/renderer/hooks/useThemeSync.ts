import { useLayoutEffect, useRef } from 'react';
import { useAtomValue } from 'jotai';
import { themeAtom, accentColorAtom } from '../store/atoms';
import { getAccentHex } from '../utils/color';

export function useThemeSync(): void {
  const theme = useAtomValue(themeAtom);
  const accentColor = useAtomValue(accentColorAtom);
  const prevThemeRef = useRef<string | null>(null);
  const prevAccentHexRef = useRef<string | null>(null);
  const accentRafRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (prevThemeRef.current !== theme) {
      document.documentElement.classList.remove('theme-oled', 'theme-quantum');
      if (theme && theme !== 'dark') {
        document.documentElement.classList.add(`theme-${theme}`);
      }
      prevThemeRef.current = theme;
    }
  }, [theme]);

  useLayoutEffect(() => {
    const normalized = getAccentHex(accentColor);
    if (prevAccentHexRef.current === normalized) return;
    prevAccentHexRef.current = normalized;
    if (accentRafRef.current !== null) cancelAnimationFrame(accentRafRef.current);
    accentRafRef.current = requestAnimationFrame(() => {
      if (prevAccentHexRef.current === normalized) {
        document.documentElement.style.setProperty('--color-primary', normalized);
      }
      accentRafRef.current = null;
    });
    return () => {
      if (accentRafRef.current !== null) {
        cancelAnimationFrame(accentRafRef.current);
        accentRafRef.current = null;
      }
    };
  }, [accentColor]);
}
