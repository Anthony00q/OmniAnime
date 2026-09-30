import { useQuery, type QueryClient } from '@tanstack/react-query';
import { useDeferredProvider } from './internal';

export function animeDetailsKey(provider: string, slug: string | null): (string | null)[] {
  return ['details', provider, slug];
}

export function fetchAnimeDetails(slug: string | null, provider: string): Promise<any> {
  return window.api.invoke('get-details', { slug, provider });
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
