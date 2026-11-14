import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EpisodeAvailability } from '@/types/anime';
import { useDeferredProvider } from './internal';
import { unwrap } from './unwrap';

export function animeDetailsKey(provider: string, slug: string | null): (string | null)[] {
  return ['details', provider, slug];
}

export function fetchAnimeDetails(slug: string | null, provider: string): Promise<any> {
  return window.api.invoke('get-details', { slug, provider }).then(unwrap);
}

export function useAnimeDetails(slug: string | null) {
  const provider = useDeferredProvider();

  return useQuery({
    queryKey: animeDetailsKey(provider, slug),
    queryFn: () => fetchAnimeDetails(slug, provider),
    enabled: !!slug,
    staleTime: 30 * 1000,
  });
}

// Precarga de la ficha por slug: misma key/fn que useAnimeDetails, sin fetch duplicado.
export function prefetchAnimeDetails(
  queryClient: QueryClient,
  provider: string,
  slug: string | null | undefined,
): void {
  if (!slug) return;
  void queryClient.prefetchQuery({
    queryKey: animeDetailsKey(provider, slug),
    queryFn: () => fetchAnimeDetails(slug, provider),
    staleTime: 30 * 1000,
  });
}

type AvailabilityEntry = { state: EpisodeAvailability; expires: number };
type AvailabilityCache = Record<number, AvailabilityEntry>;
const EMPTY_AVAILABILITY_CACHE: AvailabilityCache = {};

export function useDubAvailability(
  queryClient: QueryClient,
  provider: string,
  slug: string,
  visible: number[],
  enabled: boolean,
) {
  const key = useMemo(() => ['episode-availability', provider, slug, 'DUB'], [provider, slug]);
  const { data: entries = EMPTY_AVAILABILITY_CACHE } = useQuery<AvailabilityCache>({
    queryKey: key,
    queryFn: async () => ({}),
    enabled: false,
    gcTime: 30 * 60_000,
  });
  const [checking, setChecking] = useState(false);
  const [retryEpisodes, setRetryEpisodes] = useState<number[]>([]);
  const runRef = useRef<{ id: string; cancelled: boolean } | null>(null);
  const busyRef = useRef(false);
  const scopeRef = useRef(0);
  const targets = useMemo(() => [...new Set([...visible, ...retryEpisodes])], [visible, retryEpisodes]);

  const cancel = useCallback(() => {
    const run = runRef.current;
    if (run) {
      run.cancelled = true;
      void window.api
        .invoke('cancel-episode-availability', run.id)
        .then(unwrap)
        .catch(() => undefined);
      runRef.current = null;
    }
    busyRef.current = false;
  }, []);

  useEffect(() => {
    scopeRef.current++;
    setRetryEpisodes([]);
    setChecking(false);
    return cancel;
  }, [provider, slug, enabled, cancel]);

  useEffect(() => {
    if (!enabled || provider !== 'animeav1' || busyRef.current) return;
    const cached = queryClient.getQueryData<AvailabilityCache>(key) || {};
    const next = targets.filter((ep) => !cached[ep] || cached[ep].expires <= Date.now()).slice(0, 2);
    if (!next.length) {
      setChecking(false);
      if (retryEpisodes.length) setRetryEpisodes([]);
      return;
    }
    const scope = scopeRef.current;
    const timer = setTimeout(() => {
      if (scope !== scopeRef.current) return;
      const run = { id: crypto.randomUUID(), cancelled: false };
      runRef.current = run;
      busyRef.current = true;
      setChecking(true);
      void window.api
        .invoke('get-episode-availability', {
          provider,
          slug,
          episodes: next,
          lang: 'DUB',
          requestId: run.id,
        })
        .then((value) => unwrap(value, { toast: false }) as Record<number, EpisodeAvailability> | null)
        .catch(() => Object.fromEntries(next.map((ep) => [ep, 'error'])) as Record<number, EpisodeAvailability>)
        .then((result) => {
          if (run.cancelled || scope !== scopeRef.current) return;
          const now = Date.now();
          queryClient.setQueryData<AvailabilityCache>(key, (old) => {
            const updated = { ...old };
            for (const ep of next) {
              const state = result?.[ep] || 'error';
              updated[ep] = { state, expires: now + (state === 'available' ? 30 : state === 'error' ? 1 : 5) * 60_000 };
            }
            return updated;
          });
        })
        .finally(() => {
          if (runRef.current !== run) return;
          runRef.current = null;
          busyRef.current = false;
          setChecking(false);
        });
    }, 100);
    return () => clearTimeout(timer);
  }, [enabled, provider, slug, targets, entries, retryEpisodes, key, queryClient, checking]);

  const states = useMemo(() => {
    const now = Date.now();
    return Object.fromEntries(
      Object.entries(entries)
        .filter(([, entry]) => entry.expires > now)
        .map(([ep, entry]) => [ep, entry.state]),
    ) as Record<number, EpisodeAvailability>;
  }, [entries]);
  const retry = useCallback(() => {
    const cached = queryClient.getQueryData<AvailabilityCache>(key) || {};
    setRetryEpisodes(
      Object.entries(cached)
        .filter(([, entry]) => entry.state === 'error')
        .map(([ep]) => Number(ep)),
    );
    queryClient.setQueryData<AvailabilityCache>(key, (old) =>
      Object.fromEntries(Object.entries(old || {}).filter(([, entry]) => entry.state !== 'error')),
    );
  }, [queryClient, key]);

  const now = Date.now();
  const checkingTargets =
    enabled &&
    provider === 'animeav1' &&
    (checking || targets.some((ep) => !entries[ep] || entries[ep].expires <= now));

  return { states, checking: checkingTargets, retry };
}
