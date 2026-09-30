import { useQuery, useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';

export interface LogPageFilters {
  level: string;
  scope: string;
  query: string;
  sessionOnly: boolean;
}

export function useLogPages(filters: LogPageFilters, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['log-page', filters.sessionOnly, filters.level, filters.scope, filters.query],
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const res: any = await window.api.invoke('get-log-page', { ...filters, cursor: pageParam, limit: 100 });
      if (res?.ok !== true) throw new Error('No se pudo leer el registro');
      return res;
    },
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
    queryFn: async () => {
      const res: any = await window.api.invoke('get-log-filenames');
      if (res?.ok !== true) throw new Error('No se pudo leer el registro');
      return res as { ok: true; files: LogFileInfo[]; current: string; sessionStart: string };
    },
    enabled,
    staleTime: 10 * 1000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
  });
}

export function useLogFilePage(filename: string | null, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['log-file-page', filename],
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const res: any = await window.api.invoke('get-log-page', {
        level: 'all',
        scope: 'all',
        query: '',
        sessionOnly: false,
        filename,
        cursor: pageParam,
        limit: 200,
      });
      if (res?.ok !== true) throw new Error('No se pudo leer el registro');
      return res;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage: any) => lastPage?.nextCursor ?? undefined,
    enabled: enabled && !!filename,
    staleTime: 10 * 1000,
    placeholderData: keepPreviousData,
  });
}
