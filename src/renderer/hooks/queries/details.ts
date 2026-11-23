import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { EpisodeAvailability } from '@/types/anime';
import { scanEpisodeAvailability } from '@/utils/episodeAvailabilityScan';
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
  episodes: readonly number[],
  priority: readonly number[],
  enabled: boolean,
) {
  const key = useMemo(() => ['episode-availability', provider, slug, 'DUB'], [provider, slug]);
  const { data: entries = EMPTY_AVAILABILITY_CACHE } = useQuery<AvailabilityCache>({
    queryKey: key,
    queryFn: async () => ({}),
    enabled: false,
    gcTime: 30 * 60_000,
  });
  const priorityRef = useRef(priority);
  const retryRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    priorityRef.current = priority;
  }, [priority]);

  useEffect(() => {
    if (!enabled || provider !== 'animeav1' || episodes.length === 0) return;
    const controller = new AbortController();
    const inFlight = new Set<string>();
    let scanning = false;
    const check = async (episode: number) => {
      const requestId = crypto.randomUUID();
      inFlight.add(requestId);
      let state: EpisodeAvailability = 'error';
      try {
        const result = await window.api
          .invoke('get-episode-availability', { provider, slug, episodes: [episode], lang: 'DUB', requestId })
          .then((value) => unwrap<Record<number, EpisodeAvailability> | null>(value, { toast: false }));
        state = result?.[episode] ?? 'error';
      } catch {
        state = 'error';
      } finally {
        inFlight.delete(requestId);
      }
      if (!controller.signal.aborted) {
        queryClient.setQueryData<AvailabilityCache>(key, (old) => ({
          ...old,
          [episode]: {
            state,
            expires: Date.now() + (state === 'available' ? 30 : state === 'error' ? 1 : 5) * 60_000,
          },
        }));
      }
    };
    const start = (shouldCheck: (entry: AvailabilityEntry | undefined) => boolean) => {
      if (scanning) return;
      const cached = queryClient.getQueryData<AvailabilityCache>(key) ?? EMPTY_AVAILABILITY_CACHE;
      const pending = episodes.filter((episode) => shouldCheck(cached[episode]));
      if (pending.length === 0) return;
      if (pending.some((episode) => cached[episode])) {
        queryClient.setQueryData<AvailabilityCache>(key, (old) => {
          const next = { ...old };
          for (const episode of pending) delete next[episode];
          return next;
        });
      }
      scanning = true;
      void scanEpisodeAvailability(pending, controller.signal, () => priorityRef.current, check).finally(() => {
        scanning = false;
      });
    };
    const now = Date.now();
    start((entry) => !entry || entry.expires <= now);
    retryRef.current = () => start((entry) => entry?.state === 'error');
    return () => {
      retryRef.current = null;
      controller.abort();
      for (const requestId of inFlight) {
        void window.api
          .invoke('cancel-episode-availability', requestId)
          .then((value) => unwrap(value, { toast: false }))
          .catch(() => undefined);
      }
    };
  }, [enabled, provider, slug, episodes, key, queryClient]);

  const states = useMemo(
    () =>
      Object.fromEntries(Object.entries(entries).map(([ep, entry]) => [ep, entry.state])) as Record<
        number,
        EpisodeAvailability
      >,
    [entries],
  );
  const retry = useCallback(() => retryRef.current?.(), []);
  const checking = enabled && provider === 'animeav1' && episodes.some((ep) => !entries[ep]);
  return { states, checking, retry };
}
