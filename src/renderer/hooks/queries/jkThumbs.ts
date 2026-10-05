import { useQuery } from '@tanstack/react-query';
import { unwrap } from './unwrap';

// Thumbs JK bajo demanda (solo jkanime); inmutables: staleTime largo.
export function useJkEpisodeThumbs(
  slug: string | null,
  provider: string,
  fromEp: number | null,
  toEp: number | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['jk-ep-thumbs', provider, slug, fromEp, toEp],
    queryFn: async () => {
      const thumbs = unwrap(await window.api.invoke('get-episode-thumbs', { slug, fromEp, toEp, provider }));
      return (thumbs && typeof thumbs === 'object' ? thumbs : {}) as Record<number, string>;
    },
    enabled:
      enabled &&
      !!slug &&
      provider === 'jkanime' &&
      typeof fromEp === 'number' &&
      typeof toEp === 'number' &&
      Number.isFinite(fromEp) &&
      Number.isFinite(toEp) &&
      toEp >= fromEp,
    staleTime: 30 * 60 * 1000,
  });
}
