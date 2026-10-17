import { useQuery, useMutation, useQueryClient, useIsMutating, keepPreviousData } from '@tanstack/react-query';
import { unwrap } from './unwrap';
import { useEffect, useRef, useState } from 'react';
import type { ThumbnailCommand, ThumbnailPriority, ThumbnailRequest } from '@/types/thumbnails';
import { reportRendererError } from '@/renderer/utils/rendererErrorReporting';
import { useSetAtom } from 'jotai';
import { selectedLibraryFolderAtom } from '@/renderer/store/atoms';

export function requestVideoThumbnail(
  videoPath: string,
  priority: ThumbnailPriority,
  refresh = false,
): ThumbnailRequest {
  const requestId = crypto.randomUUID();
  let settled = false;
  let released = false;
  const command: ThumbnailCommand = { operation: 'request', requestId, videoPath, priority, refresh };
  const promise = window.api
    .invoke('get-video-thumbnail', command)
    .then((response) => unwrap<string | null>(response, { toast: false }))
    .finally(() => {
      settled = true;
    });
  const control = (payload: ThumbnailCommand) => {
    void window.api
      .invoke('get-video-thumbnail', payload)
      .then((response) => unwrap(response, { toast: false }))
      .catch((error) => reportRendererError('ui:thumbnail', error));
  };
  return {
    promise,
    release: () => {
      if (released || settled) return;
      released = true;
      control({ operation: 'release', requestId });
    },
    setPriority: (value) => {
      if (released || settled || priority === value) return;
      priority = value;
      control({ operation: 'priority', requestId, priority });
    },
  };
}

export function useVideoThumbnail(videoPath: string, thumbToken: number) {
  const elementRef = useRef<HTMLDivElement>(null);
  const retryRef = useRef<((src: string | null) => void) | null>(null);
  const [image, setImage] = useState<{ path: string; token: number; src: string | null } | null>(null);
  const src = image?.path === videoPath && image.token === thumbToken ? image.src : null;

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    let disposed = false;
    let nearby = false;
    let visible = false;
    let complete = false;
    let failures = 0;
    let refresh = false;
    let currentSource: string | null = null;
    let request: ThumbnailRequest | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const stop = () => {
      request?.release();
      request = null;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
    };
    const retry = () => {
      if (!disposed && visible && nearby && failures < 2 && !retryTimer) {
        retryTimer = setTimeout(() => {
          retryTimer = null;
          if (visible) start();
        }, 350);
      }
    };
    const start = () => {
      if (disposed || !nearby || complete || request || failures >= 2) return;
      const current = requestVideoThumbnail(videoPath, visible ? 'visible' : 'prefetch', refresh);
      request = current;
      void current.promise
        .then((result) => {
          if (disposed || request !== current) return;
          request = null;
          if (result) {
            complete = true;
            currentSource = result;
            setImage({ path: videoPath, token: thumbToken, src: result });
          } else {
            failures++;
            retry();
          }
        })
        .catch((error) => {
          if (disposed || request !== current) return;
          request = null;
          reportRendererError('ui:thumbnail', error);
          failures++;
          retry();
        });
    };
    retryRef.current = (failedSource) => {
      if (!failedSource || failedSource !== currentSource || disposed) return;
      complete = false;
      currentSource = null;
      refresh = true;
      failures++;
      setImage({ path: videoPath, token: thumbToken, src: null });
      retry();
    };
    const nearObserver = new IntersectionObserver(
      ([entry]) => {
        nearby = entry.isIntersecting;
        if (nearby) start();
        else stop();
      },
      { rootMargin: '50px' },
    );
    const visibleObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      request?.setPriority(visible ? 'visible' : 'prefetch');
      if (visible) {
        nearby = true;
        start();
      }
    });
    nearObserver.observe(element);
    visibleObserver.observe(element);
    return () => {
      disposed = true;
      retryRef.current = null;
      nearObserver.disconnect();
      visibleObserver.disconnect();
      stop();
    };
  }, [videoPath, thumbToken]);

  return { elementRef, src, onImageError: () => retryRef.current?.(src) };
}

export function useLibrary(dirs: string[]) {
  return useQuery({
    queryKey: ['library', dirs],
    queryFn: async () => {
      const scannedRows = await Promise.all(
        dirs.map(async (dir, sourceDirIndex) => {
          if (!dir) return [];
          const rows = unwrap(await window.api.invoke('scan-downloads', dir));
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
    queryFn: async () => unwrap(await window.api.invoke('scan-episodes', animePath)),
    enabled: !!animePath,
    staleTime: 10 * 1000,
  });
}

export function usePreviewRename(animePath: string | null, style: 'minimal' | 'descriptive', enabled: boolean) {
  return useQuery({
    queryKey: ['preview-rename', animePath, style],
    queryFn: async () =>
      unwrap(await window.api.invoke('preview-rename-anime-files', { animePath, style }), { toast: false }),
    enabled: enabled && !!animePath,
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}

export function usePreviewReorder(folderPath: string | null, startNumber: number, enabled: boolean) {
  return useQuery({
    queryKey: ['preview-reorder', folderPath, startNumber],
    queryFn: async () =>
      unwrap(await window.api.invoke('preview-reorder-episodes', { folderPath, startNumber }), { toast: false }),
    enabled: enabled && !!folderPath && Number.isFinite(startNumber),
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}

export function useLibraryActions() {
  const queryClient = useQueryClient();
  const setSelectedFolder = useSetAtom(selectedLibraryFolderAtom);
  const isMutating = useIsMutating({ mutationKey: ['library-files'] }) > 0;
  const prepare = async () => {
    await Promise.all(
      ['library', 'episodes', 'preview-rename', 'preview-reorder'].map((key) =>
        queryClient.cancelQueries({ queryKey: [key] }),
      ),
    );
  };
  const refresh = async () => {
    await Promise.all(
      ['library', 'preview-rename', 'preview-reorder'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
  };

  return {
    isMutating,
    openFolder: useMutation({
      mutationFn: async (folderPath: string) => unwrap(await window.api.invoke('open-folder', folderPath)),
    }),
    playVideo: useMutation({
      mutationFn: async (videoPath: string) => unwrap(await window.api.invoke('play-video', videoPath)),
    }),
    deleteVideo: useMutation({
      mutationKey: ['library-files', 'delete'],
      onMutate: prepare,
      mutationFn: async (videoPath: string) => unwrap(await window.api.invoke('delete-video', videoPath)),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['episodes'] });
        queryClient.invalidateQueries({ queryKey: ['library'] });
      },
    }),
    renameFiles: useMutation({
      mutationKey: ['library-files', 'rename'],
      onMutate: prepare,
      mutationFn: async (params: { animePath: string; style: string; expectedRevision?: string }) =>
        unwrap(await window.api.invoke('rename-anime-files', params), { toast: false }),
      onSuccess: (data, params) => {
        if (Array.isArray(data?.episodes)) queryClient.setQueryData(['episodes', params.animePath], data.episodes);
      },
      onError: async (_error, params) => {
        await queryClient.invalidateQueries({ queryKey: ['episodes', params.animePath] });
      },
      onSettled: refresh,
    }),
    reorderEpisodes: useMutation({
      mutationKey: ['library-files', 'reorder'],
      onMutate: prepare,
      mutationFn: async (params: { folderPath: string; startNumber: number; expectedRevision?: string }) =>
        unwrap(await window.api.invoke('reorder-episodes', params), { toast: false }),
      onSuccess: (data, params) => {
        if (Array.isArray(data?.episodes)) queryClient.setQueryData(['episodes', params.folderPath], data.episodes);
      },
      onError: async (_error, params) => {
        await queryClient.invalidateQueries({ queryKey: ['episodes', params.folderPath] });
      },
      onSettled: refresh,
    }),
    renameFolder: useMutation({
      mutationKey: ['library-files', 'folder'],
      onMutate: prepare,
      mutationFn: async (params: { oldPath: string; newName: string }) =>
        unwrap<{ newPath: string; name: string; posterLocal: string | null; bannerLocal: string | null }>(
          await window.api.invoke('rename-folder', params),
          { toast: false },
        ),
      onSuccess: (data, params) => {
        queryClient.setQueriesData({ queryKey: ['library'] }, (rows: any) =>
          Array.isArray(rows)
            ? rows.map((row: any) =>
                row.path === params.oldPath
                  ? {
                      ...row,
                      path: data.newPath,
                      name: data.name,
                      posterLocal: data.posterLocal,
                      bannerLocal: data.bannerLocal,
                    }
                  : row,
              )
            : rows,
        );
        const episodes = queryClient.getQueryData<any[]>(['episodes', params.oldPath]);
        if (episodes)
          queryClient.setQueryData(
            ['episodes', data.newPath],
            episodes.map((episode) => ({ ...episode, path: data.newPath + episode.path.slice(params.oldPath.length) })),
          );
        setSelectedFolder((current) => (current === params.oldPath ? data.newPath : current));
      },
      onSettled: refresh,
    }),
    relinkFolder: useMutation({
      mutationFn: async (params: { folderPath: string; slug: string; providerId?: string | null }) =>
        unwrap(await window.api.invoke('relink-folder', params.folderPath, params.slug, params.providerId ?? null)),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['library'] });
      },
    }),
  };
}
