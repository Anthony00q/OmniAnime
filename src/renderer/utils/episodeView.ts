import { useCallback, useEffect, useState } from 'react';

export type EpisodeView = 'cards' | 'list';

const STORAGE_KEY = 'omnianime:episode-view';
export const EPISODE_VIEW_EVENT = 'episode-view-changed';

export function normalizeEpisodeView(value: unknown): EpisodeView {
  return value === 'list' ? 'list' : 'cards';
}

export function getEpisodeView(): EpisodeView {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return 'cards';
    return normalizeEpisodeView(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return 'cards';
  }
}

export function setEpisodeView(view: EpisodeView): void {
  const next = normalizeEpisodeView(view);
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent<EpisodeView>(EPISODE_VIEW_EVENT, { detail: next }));
  } catch {}
}

export function useEpisodeView(): [EpisodeView, (view: EpisodeView) => void] {
  const [view, setView] = useState<EpisodeView>(getEpisodeView);
  useEffect(() => {
    const handler = (event: Event) => {
      setView(normalizeEpisodeView((event as CustomEvent<EpisodeView>).detail));
    };
    window.addEventListener(EPISODE_VIEW_EVENT, handler);
    return () => window.removeEventListener(EPISODE_VIEW_EVENT, handler);
  }, []);
  const update = useCallback((next: EpisodeView) => {
    setView(normalizeEpisodeView(next));
    setEpisodeView(next);
  }, []);
  return [view, update];
}
