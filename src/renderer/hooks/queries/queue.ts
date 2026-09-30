import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ensureIpcSuccess } from './internal';

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
      activeEps?: Array<{
        episode: number;
        progress: number;
        server?: string;
        phase?: 'downloading' | 'assembling';
        speedBps?: number;
        at?: number;
      }>;
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

export function useAddToQueue() {
  return useMutation({
    mutationFn: async (params: Record<string, unknown>) =>
      ensureIpcSuccess(await window.api.invoke('add-to-queue', params)),
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
