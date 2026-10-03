import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { ensureIpcSuccess } from './internal';

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
      mutationFn: async (params: { folderPath: string; slug: string; providerId?: string | null }) =>
        ensureIpcSuccess(
          await window.api.invoke('relink-folder', params.folderPath, params.slug, params.providerId ?? null),
        ),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['library'] });
      },
    }),
  };
}
