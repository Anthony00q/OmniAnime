import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { ensureIpcSuccess } from './internal';

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

export function useSystemInfo(enabled = true) {
  return useQuery({
    queryKey: ['system-info'],
    queryFn: () => window.api.invoke('get-system-info'),
    enabled,
    staleTime: 30 * 1000,
  });
}

// Señal débil solo para mensajes: enabled la controla cada vista (solo en vacío).
export function useConnectivityStatus(enabled = true) {
  return useQuery({
    queryKey: ['connectivity-status'],
    queryFn: () => window.api.invoke('get-connectivity-status') as Promise<boolean>,
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
