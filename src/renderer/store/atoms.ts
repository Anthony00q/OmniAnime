import { atom } from 'jotai';
import type { AppSettings, ThemeId } from '../../types/settings';
import { DEFAULT_ACCENT_HSL, isThemeValue } from '../utils/color';

export type ToastPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center';

export const currentViewAtom = atom<string>('home');
export const previousViewAtom = atom<string>('home');
export const selectedAnimeAtom = atom<string | null>(null);

export const activeProviderAtom = atom<string>('animeav1');

const EMPTY_OUTPUT_DIRS: string[] = [];

export const settingsAtom = atom<AppSettings | Record<string, never>>({} as AppSettings);

export const toastPositionAtom = atom<ToastPosition>('top-center');

export const themeAtom = atom<ThemeId>((get) => {
  const s = get(settingsAtom) as Partial<AppSettings>;
  const t = s?.theme;
  if (isThemeValue(t)) return t;
  return 'dark';
});

export const accentColorAtom = atom<string>((get) => {
  const s = get(settingsAtom) as Partial<AppSettings>;
  return s?.accentColor ?? DEFAULT_ACCENT_HSL;
});

export const outputDirsAtom = atom<string[]>((get) => {
  const s = get(settingsAtom) as Partial<AppSettings>;
  const dirs = s?.outputDirs;
  if (Array.isArray(dirs) && dirs.length > 0) return dirs;
  return EMPTY_OUTPUT_DIRS;
});

export const showCloseConfirmAtom = atom<boolean>(false);

export interface AvailableAppUpdate {
  version: string;
  notes?: string;
}

export type AppUpdatePhase = 'idle' | 'downloading' | 'downloaded';

export const appUpdateAvailableAtom = atom<AvailableAppUpdate | null>(null);
export const appUpdateModalOpenAtom = atom<boolean>(false);
export const appUpdateDismissedAtom = atom<boolean>(false);
export const appUpdatePhaseAtom = atom<AppUpdatePhase>('idle');
export const appUpdatePercentAtom = atom<number>(0);
export const appUpdateErrorAtom = atom<string | null>(null);

export const providerChangedCounterAtom = atom(0);
export const settingsChangedCounterAtom = atom(0);
export const navigateToCatalogCounterAtom = atom(0);
export const focusSearchCounterAtom = atom(0);

export const pendingCatalogGenreAtom = atom<string | null>(null);

export const openAnimeAtom = atom(null, (_get, set, slug: string) => {
  const current = _get(currentViewAtom);
  if (current !== 'details') {
    set(previousViewAtom, current);
  }
  set(selectedAnimeAtom, slug);
  set(currentViewAtom, 'details');
});

export const closeAnimeDetailsAtom = atom(null, (_get, set) => {
  set(selectedAnimeAtom, null);
  set(currentViewAtom, _get(previousViewAtom));
});

export const navigateToCatalogAtom = atom(null, (_get, set, genre?: string) => {
  if (genre) {
    set(pendingCatalogGenreAtom, genre);
  }
  const current = _get(currentViewAtom);
  if (current !== 'catalog' && current !== 'details' && current !== 'settings') {
    set(previousViewAtom, current);
  }
  set(currentViewAtom, 'catalog');
  set(navigateToCatalogCounterAtom, (c) => c + 1);
  setTimeout(() => {
    set(focusSearchCounterAtom, (c) => c + 1);
  }, 50);
});
