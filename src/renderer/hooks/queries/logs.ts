import { useQuery, useInfiniteQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { unwrap } from './unwrap';

export interface LogPageFilters {
  level: string;
  scope: string;
  query: string;
  sessionOnly: boolean;
}

export function useLogPages(filters: LogPageFilters, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['log-page', filters.sessionOnly, filters.level, filters.scope, filters.query],
    queryFn: async ({ pageParam }: { pageParam: number }) =>
      unwrap(await window.api.invoke('get-log-page', { ...filters, cursor: pageParam, limit: 100 }), { toast: false }),
    initialPageParam: 0,
    getNextPageParam: (lastPage: any) => lastPage?.nextCursor ?? undefined,
    enabled,
    staleTime: 10 * 1000,
    placeholderData: keepPreviousData,
  });
}

export interface LogFileInfo {
  name: string;
  size: number;
  mtimeMs: number;
  isCurrent: boolean;
}

export function useLogFilenames(enabled = true) {
  return useQuery({
    queryKey: ['log-filenames'],
    queryFn: async () =>
      unwrap<{ files: LogFileInfo[]; current: string; sessionStart: string }>(
        await window.api.invoke('get-log-filenames'),
        { toast: false },
      ),
    enabled,
    staleTime: 10 * 1000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });
}

export function useLogFilePage(filename: string | null, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['log-file-page', filename],
    queryFn: async ({ pageParam }: { pageParam: number }) =>
      unwrap(
        await window.api.invoke('get-log-page', {
          level: 'all',
          scope: 'all',
          query: '',
          sessionOnly: false,
          filename,
          cursor: pageParam,
          limit: 200,
        }),
        { toast: false },
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage: any) => lastPage?.nextCursor ?? undefined,
    enabled: enabled && !!filename,
    staleTime: 10 * 1000,
    placeholderData: keepPreviousData,
  });
}

// Copia de la sesión actual: lectura puntual, sin query.
export function fetchLogPageSnapshot(filename: string, limit: number): Promise<any> {
  return window.api
    .invoke('get-log-page', {
      level: 'all',
      scope: 'all',
      query: '',
      sessionOnly: false,
      filename,
      cursor: 0,
      limit,
    })
    .then(unwrap);
}

export function useDeleteLogFiles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (files: string[]): Promise<any> =>
      unwrap(await window.api.invoke('delete-log-files', { files }), { toast: false }),
    onSuccess: (result) => {
      // Solo se refresca la lista cuando el borrado tuvo efecto real.
      if (result?.deleted > 0) queryClient.invalidateQueries({ queryKey: ['log-filenames'] });
    },
  });
}
