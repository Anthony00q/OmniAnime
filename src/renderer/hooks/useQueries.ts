import { useQuery, useInfiniteQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { useAtomValue } from 'jotai';
import { activeProviderAtom } from '../store/atoms';
import type { YtdlpUpdateResult } from '../../types/ytdlp';
import { hasNewCatalogItems } from '../utils/catalogResults';

function ensureIpcSuccess<T>(result: T): T {
  if (result === false) {
    throw new Error('La operación no se pudo completar');
  }

  if (result && typeof result === 'object' && 'success' in result && result.success === false) {
    const error =
      'error' in result && typeof result.error === 'string' ? result.error : 'La operación no se pudo completar';
    throw new Error(error);
  }

  return result;
}

// Datos diferidos: el indicador pinta urgente, las listas confirman despues.
function useDeferredProvider(): string {
  return useDeferredValue(useAtomValue(activeProviderAtom));
}

export function useHomeData() {
  const provider = useDeferredProvider();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const query = useQuery({
    queryKey: ['home', provider],
    queryFn: () => window.api.invoke('get-home-data', { force: false, provider }),
    staleTime: 4 * 60 * 1000,
  });

  const refresh = () => {
    setIsRefreshing(true);
    window.api
      .invoke('get-home-data', { force: true, provider })
      .then((data: any) => {
        queryClient.setQueryData(['home', provider], data);
      })
      .catch(() => {
        queryClient.invalidateQueries({ queryKey: ['home', provider] });
      })
      .finally(() => {
        setIsRefreshing(false);
      });
  };

  return { ...query, refresh, isRefreshing };
}

export function useActiveProvider() {
  return useQuery({
    queryKey: ['active-provider'],
    queryFn: () => window.api.invoke('get-active-provider') as Promise<string>,
    staleTime: Infinity,
  });
}

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

export function useAnimeDetails(slug: string | null) {
  const provider = useDeferredProvider();

  return useQuery({
    queryKey: ['details', provider, slug],
    queryFn: () => window.api.invoke('get-details', { slug, provider }),
    enabled: !!slug,
    staleTime: 30 * 1000,
  });
}

// Sin progreso en vuelo se limpia; en flujo activo se conserva hasta el próximo delta.
// Compartida entre eventos queue-update y refetches (anti-parpadeo al restaurar).
// El pending transitorio al reanudar también conserva la última foto conocida.
function mergeQueueRow(prev: any | undefined, item: any): any {
  const inFlow = (s: unknown): boolean => s === 'downloading' || s === 'pending';
  if (!inFlow(item.status) || !prev || !inFlow((prev as any).status)) {
    if ((item as any).activeEps !== undefined) {
      const rest = { ...(item as any) };
      delete rest.activeEps;
      return rest;
    }
    return item;
  }
  return (prev as any).activeEps !== undefined ? { ...(item as any), activeEps: (prev as any).activeEps } : item;
}

export function useQueue() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['queue'],
    queryFn: async () => {
      const fresh = (await window.api.invoke('get-queue')) as any[];
      // Anti-parpadeo: el refetch (foco/visibilidad) no debe tumbar el
      // progreso en vuelo; se fusiona igual que ante queue-update
      const prev = queryClient.getQueryData(['queue']) as any[] | undefined;
      if (!Array.isArray(prev)) return fresh;
      const prevById = new Map(prev.map((item) => [item.id, item]));
      return fresh.map((item) => mergeQueueRow(prevById.get(item.id), item));
    },
    staleTime: 0,
  });

  useEffect(() => {
    const handler = (enriched: any[]) => {
      queryClient.setQueryData(['queue'], (old: any[] | undefined) => {
        if (!old) return enriched;
        const prevById = new Map(old.map((item) => [item.id, item]));
        return enriched.map((item) => mergeQueueRow(prevById.get(item.id), item));
      });
    };
    const progressHandler = (delta: {
      id: string;
      progress: number;
      currentEp: number | null;
      currentServer?: string;
      status: string;
      activeEps?: Array<{ episode: number; progress: number; server?: string }>;
    }) => {
      queryClient.setQueryData(['queue'], (old: any[] | undefined) => {
        if (!old || old.length === 0) return old;
        let changed = false;
        const updated = old.map((item) => {
          if (item.id !== delta.id) return item;
          const prevActive = JSON.stringify(item.activeEps ?? null);
          const nextActive = JSON.stringify(delta.activeEps ?? null);
          if (
            item.progress === delta.progress &&
            item.currentEp === delta.currentEp &&
            item.currentServer === delta.currentServer &&
            item.status === delta.status &&
            prevActive === nextActive
          ) {
            return item;
          }
          changed = true;
          const next: any = {
            ...item,
            progress: delta.progress,
            currentEp: delta.currentEp,
            ...(delta.currentServer !== undefined ? { currentServer: delta.currentServer } : {}),
            status: delta.status,
          };
          if (delta.activeEps !== undefined) next.activeEps = delta.activeEps;
          else delete next.activeEps;
          return next;
        });
        return changed ? updated : old;
      });
    };
    const reconcileQueue = () => {
      if (document.visibilityState !== 'visible') return;
      void queryClient.refetchQueries({ queryKey: ['queue'], type: 'active' });
    };

    window.api.on('queue-update', handler);
    window.api.on('queue-progress', progressHandler);
    document.addEventListener('visibilitychange', reconcileQueue);
    window.addEventListener('focus', reconcileQueue);

    return () => {
      window.api.removeListener('queue-update', handler);
      window.api.removeListener('queue-progress', progressHandler);
      document.removeEventListener('visibilitychange', reconcileQueue);
      window.removeEventListener('focus', reconcileQueue);
    };
  }, [queryClient]);

  return { ...query, invalidateQueue: () => queryClient.invalidateQueries({ queryKey: ['queue'] }) };
}

export function useHistory(isActive: boolean) {
  const queryClient = useQueryClient();
  const previousActive = useRef(isActive);

  const query = useQuery({
    queryKey: ['history'],
    queryFn: () => window.api.invoke('get-download-history'),
    enabled: isActive,
    staleTime: 10 * 1000,
  });

  useEffect(() => {
    const handleHistoryUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: ['history'], refetchType: 'active' });
    };

    window.api.on('history-updated', handleHistoryUpdated);
    return () => {
      window.api.removeListener('history-updated', handleHistoryUpdated);
    };
  }, [queryClient]);

  useEffect(() => {
    const becameActive = isActive && !previousActive.current;
    previousActive.current = isActive;
    if (!becameActive) return;

    void queryClient.refetchQueries({ queryKey: ['history'], type: 'active' }, { cancelRefetch: false });
  }, [isActive, queryClient]);

  return { ...query, invalidateHistory: () => queryClient.invalidateQueries({ queryKey: ['history'] }) };
}

export function useLibrary(dirs: string[]) {
  return useQuery({
    queryKey: ['library', dirs],
    queryFn: async () => {
      const scannedRows = await Promise.all(
        dirs.map(async (dir, sourceDirIndex) => {
          if (!dir) return [];
          const rows = await window.api.invoke('scan-downloads', dir);
          return rows ? rows.map((row: any) => ({ ...row, sourceDir: dir, sourceDirIndex })) : [];
        }),
      );
      const allRows = scannedRows.flat();
      const seen = new Set<string>();
      return allRows.filter((r: any) => {
        if (seen.has(r.path)) return false;
        seen.add(r.path);
        return true;
      });
    },
    enabled: dirs.length > 0 && dirs.some((d) => !!d),
    staleTime: 30 * 1000,
  });
}

export function useEpisodes(animePath: string | null) {
  return useQuery({
    queryKey: ['episodes', animePath],
    queryFn: () => window.api.invoke('scan-episodes', animePath),
    enabled: !!animePath,
    staleTime: 10 * 1000,
  });
}

export function useLoadSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => window.api.invoke('get-settings'),
    staleTime: Infinity,
  });
}

export function useAddToQueue() {
  return useMutation({
    mutationFn: async (params: Record<string, unknown>) =>
      ensureIpcSuccess(await window.api.invoke('add-to-queue', params)),
  });
}

export function useSaveSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: Record<string, unknown>) =>
      ensureIpcSuccess(await window.api.invoke('save-settings', settings)),
    onSuccess: (_result, settings) => {
      queryClient.setQueryData(['settings'], settings);
      queryClient.invalidateQueries({ queryKey: ['storage-stats'] });
      queryClient.invalidateQueries({ queryKey: ['app-paths'] });
    },
  });
}

export function useUpdateYtdlp() {
  return useMutation<YtdlpUpdateResult, Error, void>({
    mutationFn: () => window.api.invoke('update-ytdlp') as Promise<YtdlpUpdateResult>,
  });
}

export function useDownloadActions() {
  const queryClient = useQueryClient();

  const invalidateQueue = () => queryClient.invalidateQueries({ queryKey: ['queue'] });

  // Sin invalidate: el main emite queue-update push tras cada acción y el
  // refetch al foco/visibilidad cubre la ventana oculta. Invalidar aquí
  // duplicaba get-queue (push + refetch con el mismo dato).
  return {
    cancelDownload: useMutation({
      mutationFn: async (id: string) => ensureIpcSuccess(await window.api.invoke('cancel-download', id)),
    }),
    pauseDownload: useMutation({
      mutationFn: async (id: string) => ensureIpcSuccess(await window.api.invoke('pause-download', id)),
    }),
    skipServer: useMutation({
      mutationFn: async (id: string) => ensureIpcSuccess(await window.api.invoke('skip-server', id)),
    }),
    skipEpisode: useMutation({
      mutationFn: async (params: { id: string; episode: number }) =>
        ensureIpcSuccess(await window.api.invoke('skip-episode', params.id, params.episode)),
    }),
    cancelEpisode: useMutation({
      mutationFn: async (params: { id: string; episode: number }) =>
        ensureIpcSuccess(await window.api.invoke('cancel-episode', params.id, params.episode)),
    }),
    pauseEpisode: useMutation({
      mutationFn: async (params: { id: string; episode: number }) =>
        ensureIpcSuccess(await window.api.invoke('pause-episode', params.id, params.episode)),
    }),
    resumeEpisode: useMutation({
      mutationFn: async (params: { id: string; episode: number }) =>
        ensureIpcSuccess(await window.api.invoke('resume-episode', params.id, params.episode)),
    }),
    removeFromQueue: useMutation({
      mutationFn: async (id: string) => ensureIpcSuccess(await window.api.invoke('remove-from-queue', id)),
    }),
    resumeDownload: useMutation({
      mutationFn: async (id: string) => ensureIpcSuccess(await window.api.invoke('resume-download', id)),
    }),
    retryFailed: useMutation({
      mutationFn: async (id: string) => ensureIpcSuccess(await window.api.invoke('retry-failed-download', id)),
    }),
    clearQueue: useMutation({
      mutationFn: async () => ensureIpcSuccess(await window.api.invoke('clear-queue')),
    }),
    invalidateQueue,
  };
}

export function useHistoryActions() {
  const queryClient = useQueryClient();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['history'] });

  return {
    clearHistory: useMutation({
      mutationFn: async () => ensureIpcSuccess(await window.api.invoke('clear-download-history')),
      onSuccess: invalidate,
    }),
    removeHistoryEntries: useMutation({
      mutationFn: async (payload: { indices: number[]; expectedIds?: number[] }) =>
        ensureIpcSuccess(await window.api.invoke('remove-history-entries', payload.indices, payload.expectedIds)),
      onSuccess: invalidate,
    }),
    invalidateHistory: invalidate,
  };
}

export function usePreviewRename(animePath: string | null, style: 'minimal' | 'descriptive', enabled: boolean) {
  return useQuery({
    queryKey: ['preview-rename', animePath, style],
    queryFn: () => window.api.invoke('preview-rename-anime-files', { animePath, style }) as Promise<any>,
    enabled: enabled && !!animePath,
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}

export function usePreviewReorder(folderPath: string | null, startNumber: number, enabled: boolean) {
  return useQuery({
    queryKey: ['preview-reorder', folderPath, startNumber],
    queryFn: () => window.api.invoke('preview-reorder-episodes', { folderPath, startNumber }) as Promise<any>,
    enabled: enabled && !!folderPath && Number.isFinite(startNumber),
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}

export function useLibraryActions() {
  const queryClient = useQueryClient();

  return {
    openFolder: useMutation({
      mutationFn: async (folderPath: string) => ensureIpcSuccess(await window.api.invoke('open-folder', folderPath)),
    }),
    playVideo: useMutation({
      mutationFn: async (videoPath: string) => ensureIpcSuccess(await window.api.invoke('play-video', videoPath)),
    }),
    deleteVideo: useMutation({
      mutationFn: async (videoPath: string) => ensureIpcSuccess(await window.api.invoke('delete-video', videoPath)),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['episodes'] });
        queryClient.invalidateQueries({ queryKey: ['library'] });
      },
    }),
    renameFiles: useMutation({
      mutationFn: async (params: { animePath: string; style: string }) =>
        ensureIpcSuccess(await window.api.invoke('rename-anime-files', params)),
      onSuccess: (_data, params) => {
        queryClient.invalidateQueries({ queryKey: ['episodes', params.animePath] });
        queryClient.invalidateQueries({ queryKey: ['library'] });
        queryClient.invalidateQueries({ queryKey: ['preview-rename', params.animePath] });
      },
    }),
    reorderEpisodes: useMutation({
      mutationFn: async (params: { folderPath: string; startNumber: number }) =>
        ensureIpcSuccess(await window.api.invoke('reorder-episodes', params)),
      onSuccess: (_data, params) => {
        queryClient.invalidateQueries({ queryKey: ['episodes', params.folderPath] });
        queryClient.invalidateQueries({ queryKey: ['library'] });
        queryClient.invalidateQueries({ queryKey: ['preview-reorder', params.folderPath] });
      },
    }),
    relinkFolder: useMutation({
      mutationFn: async (params: { folderPath: string; slug: string }) =>
        ensureIpcSuccess(await window.api.invoke('relink-folder', params.folderPath, params.slug)),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['library'] });
      },
    }),
  };
}

export function useStorageStats(enabled = true, dirs?: string[]) {
  const key = dirs && dirs.length > 0 ? dirs.join('|') : 'no-dirs';
  return useQuery({
    queryKey: ['storage-stats', key],
    queryFn: () => window.api.invoke('get-storage-stats'),
    enabled,
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
  });
}

export function useAppPaths(enabled = true) {
  return useQuery({
    queryKey: ['app-paths'],
    queryFn: () => window.api.invoke('get-app-paths'),
    enabled,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

export function useSystemInfo(enabled = true) {
  return useQuery({
    queryKey: ['system-info'],
    queryFn: () => window.api.invoke('get-system-info'),
    enabled,
    staleTime: 30 * 1000,
  });
}

export function useStorageActions() {
  const queryClient = useQueryClient();
  return {
    cleanCache: useMutation({
      mutationFn: async () =>
        window.api.invoke('clean-cache') as Promise<{ cleaned: number; freed: number; errors: string[] }>,
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['storage-stats'] });
        queryClient.invalidateQueries({ queryKey: ['library'] });
      },
    }),
    cleanThumbnails: useMutation({
      mutationFn: async (mode: 'expired' | 'all' = 'expired') =>
        window.api.invoke('clean-thumbnails', mode) as Promise<{ cleaned: number; freed: number; errors: string[] }>,
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['storage-stats'] });
      },
    }),
    openAppPath: useMutation({
      mutationFn: async (kind: string) => ensureIpcSuccess(await window.api.invoke('open-app-path', kind)),
    }),
    exportSettings: useMutation({
      mutationFn: async () =>
        window.api.invoke('export-settings') as Promise<{
          success: boolean;
          path?: string;
          error?: string;
          canceled?: boolean;
        }>,
    }),
    importSettings: useMutation({
      mutationFn: async () =>
        window.api.invoke('import-settings') as Promise<{
          success: boolean;
          settings?: Record<string, unknown>;
          error?: string;
          canceled?: boolean;
        }>,
      onSuccess: (res) => {
        if (res?.success && res.settings) {
          queryClient.setQueryData(['settings'], res.settings);
          queryClient.invalidateQueries({ queryKey: ['settings'] });
        }
      },
    }),
  };
}
