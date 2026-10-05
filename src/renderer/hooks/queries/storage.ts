import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { unwrap } from './unwrap';

export function useStorageStats(enabled = true, dirs?: string[]) {
  const key = dirs && dirs.length > 0 ? dirs.join('|') : 'no-dirs';
  return useQuery({
    queryKey: ['storage-stats', key],
    queryFn: async () => unwrap(await window.api.invoke('get-storage-stats')),
    enabled,
    staleTime: 30 * 1000,
    placeholderData: keepPreviousData,
  });
}

export function useSystemInfo(enabled = true) {
  return useQuery({
    queryKey: ['system-info'],
    queryFn: async () => unwrap(await window.api.invoke('get-system-info')),
    enabled,
    staleTime: 30 * 1000,
  });
}

// Señal débil solo para mensajes: enabled la controla cada vista (solo en vacío).
export function useConnectivityStatus(enabled = true) {
  return useQuery({
    queryKey: ['connectivity-status'],
    queryFn: async () => unwrap(await window.api.invoke('get-connectivity-status')) as boolean,
    enabled,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useStorageActions() {
  const queryClient = useQueryClient();
  return {
    cleanCache: useMutation({
      mutationFn: async () => unwrap(await window.api.invoke('clean-cache'), { toast: false }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['storage-stats'] });
        queryClient.invalidateQueries({ queryKey: ['library'] });
      },
    }),
    cleanThumbnails: useMutation({
      mutationFn: async (mode: 'expired' | 'all' = 'expired') =>
        unwrap(await window.api.invoke('clean-thumbnails', mode), { toast: false }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['storage-stats'] });
      },
    }),
    openAppPath: useMutation({
      mutationFn: async (kind: string) => unwrap(await window.api.invoke('open-app-path', kind)),
    }),
    exportSettings: useMutation({
      mutationFn: async () => unwrap(await window.api.invoke('export-settings')),
    }),
    importSettings: useMutation({
      mutationFn: async () => unwrap(await window.api.invoke('import-settings')),
      onSuccess: (settings) => {
        if (settings) {
          queryClient.setQueryData(['settings'], settings);
          queryClient.invalidateQueries({ queryKey: ['settings'] });
        }
      },
    }),
  };
}
