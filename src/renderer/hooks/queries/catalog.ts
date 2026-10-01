import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { hasNewCatalogItems } from '@/renderer/utils/catalogResults';
import { useDeferredProvider } from './internal';

export function useSearchAnime(query: string, enabled: boolean) {
  const provider = useDeferredProvider();

  return useQuery({
    queryKey: ['search', provider, query],
    queryFn: () => window.api.invoke('search-anime', { query, provider }),
    enabled: enabled && query.trim().length >= 3,
    staleTime: 30 * 1000,
  });
}

export function useFiltersData() {
  const provider = useDeferredProvider();
  return useQuery({
    queryKey: ['filters', provider],
    queryFn: () => window.api.invoke('get-filters-data', { force: false, provider }),
    staleTime: 30 * 60 * 1000,
  });
}

export function useCatalog(filters: Record<string, unknown>) {
  const provider = useDeferredProvider();
  return useInfiniteQuery({
    queryKey: ['catalog', provider, filters],
    queryFn: ({ pageParam }) => window.api.invoke('get-catalog', { ...filters, page: pageParam, provider }),
    initialPageParam: 1,
    getNextPageParam: (lastPage: any[], allPages: any[][]) => {
      if (!lastPage || lastPage.length === 0) return undefined;
      if (provider === 'jkanime' && String(filters.search || '').trim()) return undefined;
      if (!hasNewCatalogItems(lastPage, allPages.slice(0, -1))) return undefined;
      return allPages.length + 1;
    },
    staleTime: 2 * 60 * 1000,
  });
}
