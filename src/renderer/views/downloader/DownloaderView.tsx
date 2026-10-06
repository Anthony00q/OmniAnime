import { Trash2, Clock } from 'lucide-react';
import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { toast } from 'sonner';

import { useQueue, useDownloadActions } from '@/renderer/hooks/useQueries';
import { isIpcFailError, unwrap } from '@/renderer/hooks/queries/unwrap';
import { PageHeader } from '@/renderer/components/ui/PageHeader';
import { ErrorState } from '@/renderer/components/ui/ErrorState';
import { Dialog } from '@/renderer/components/Dialog';
import { QueueSkeleton } from '@/renderer/components/anime/PosterGridSkeleton';
import { EmptyState } from '@/renderer/components/ui/EmptyState';
import { useAppNavigation } from '@/renderer/hooks/useAppNavigation';
import {
  activeServersOf,
  epProgressOf,
  epServerOf,
  shouldClearSwitch,
  type SwitchSnapshot,
} from '@/renderer/utils/switchPending';
import { QueueItemRow } from './components/QueueItemRow';

interface DownloaderViewProps {
  onSelectAnime?: (slug: string) => void;
  activeProvider?: string;
  isActive?: boolean;
}

export function DownloaderView({ onSelectAnime, activeProvider, isActive = true }: DownloaderViewProps) {
  const { data: queue = [], isLoading, isError, refetch } = useQueue();
  const actions = useDownloadActions();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [pendingRetryIds, setPendingRetryIds] = useState<Set<string>>(new Set());
  const { navigateToCatalog } = useAppNavigation();

  useEffect(() => {
    if (!isActive) setShowClearConfirm(false);
  }, [isActive]);

  const handleClear = useCallback(() => setShowClearConfirm(true), []);
  const confirmClear = useCallback(() => {
    actions.clearQueue.mutate(undefined, {
      onSuccess: () => toast.success('Cola limpiada'),
      onError: () => toast.error('No se pudo limpiar la cola'),
    });
  }, [actions]);

  const handleCancel = useCallback((id: string) => actions.cancelDownload.mutate(id), [actions]);
  const handlePause = useCallback(
    (id: string) =>
      actions.pauseDownload.mutate(id, {
        onError: (error) => {
          if (!isIpcFailError(error)) toast.error('No se pudo pausar la descarga');
        },
      }),
    [actions],
  );
  const [pendingSwitchIds, setPendingSwitchIds] = useState<Set<string>>(new Set());
  const [pendingSkipEpKeys, setPendingSkipEpKeys] = useState<Set<string>>(new Set());
  const [pendingEpisodeKeys, setPendingEpisodeKeys] = useState<Set<string>>(new Set());
  const switchFromRef = useRef(new Map<string, SwitchSnapshot>());
  const skipEpFromRef = useRef(new Map<string, SwitchSnapshot>());
  const switchTimeoutRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const skipEpTimeoutRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const markEpisodePending = useCallback((id: string, episode: number, pending: boolean) => {
    const key = `${id}:${episode}`;
    setPendingEpisodeKeys((prev) => {
      const next = new Set(prev);
      if (pending) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const clearSwitchPending = useCallback((id: string) => {
    setPendingSwitchIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    switchFromRef.current.delete(id);
    const t = switchTimeoutRef.current.get(id);
    if (t) {
      clearTimeout(t);
      switchTimeoutRef.current.delete(id);
    }
  }, []);

  const clearSkipEpPending = useCallback((key: string) => {
    setPendingSkipEpKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    // Suelta también el pending genérico del EP.
    setPendingEpisodeKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    skipEpFromRef.current.delete(key);
    const t = skipEpTimeoutRef.current.get(key);
    if (t) {
      clearTimeout(t);
      skipEpTimeoutRef.current.delete(key);
    }
  }, []);

  // El pending del salto se apaga con progreso del servidor nuevo,
  // al salir de vuelo o a los 10s. El anuncio solo aún trae el % viejo.
  useEffect(() => {
    if (pendingSwitchIds.size === 0 && pendingSkipEpKeys.size === 0) return;
    const byId = new Map((queue as any[]).map((item: any) => [item.id, item]));
    for (const id of Array.from(pendingSwitchIds)) {
      const item = byId.get(id);
      if (
        shouldClearSwitch({
          from: switchFromRef.current.get(id),
          status: item?.status,
          currentServer: item?.currentServer,
          currentProgress: item?.progress,
          activeServers: activeServersOf(item?.activeEps),
        })
      ) {
        clearSwitchPending(id);
      }
    }
    for (const key of Array.from(pendingSkipEpKeys)) {
      const sep = key.lastIndexOf(':');
      const id = key.slice(0, sep);
      const ep = Number(key.slice(sep + 1));
      const item = byId.get(id);
      if (!Number.isInteger(ep)) {
        clearSkipEpPending(key);
        continue;
      }
      if (
        shouldClearSwitch({
          from: skipEpFromRef.current.get(key),
          status: item?.status,
          currentServer: epServerOf(item, ep),
          currentProgress: epProgressOf(item, ep),
          activeServers: activeServersOf(item?.activeEps),
        })
      ) {
        clearSkipEpPending(key);
      }
    }
  }, [queue, pendingSwitchIds, pendingSkipEpKeys, clearSwitchPending, clearSkipEpPending]);

  useEffect(
    () => () => {
      for (const t of switchTimeoutRef.current.values()) clearTimeout(t);
      for (const t of skipEpTimeoutRef.current.values()) clearTimeout(t);
      switchTimeoutRef.current.clear();
      skipEpTimeoutRef.current.clear();
    },
    [],
  );

  const handleSkip = useCallback(
    (id: string) => {
      const item = (queue as any[]).find((entry: any) => entry.id === id);
      const server = item?.currentServer as string | undefined;
      const progress = typeof item?.progress === 'number' ? (item.progress as number) : undefined;
      switchFromRef.current.set(id, { server, progress });
      setPendingSwitchIds((prev) => new Set(prev).add(id));
      const prevTimeout = switchTimeoutRef.current.get(id);
      if (prevTimeout) clearTimeout(prevTimeout);
      switchTimeoutRef.current.set(
        id,
        setTimeout(() => clearSwitchPending(id), 10_000),
      );
      actions.skipServer.mutate(id, {
        onError: (error) => {
          clearSwitchPending(id);
          if (!isIpcFailError(error)) toast.error('No se pudo saltar el servidor');
        },
      });
    },
    [actions, queue, clearSwitchPending],
  );
  const handleRemoveItem = useCallback((id: string) => actions.removeFromQueue.mutate(id), [actions]);
  const handleResume = useCallback(
    (id: string) =>
      actions.resumeDownload.mutate(id, {
        onError: (error) => {
          if (!isIpcFailError(error)) toast.error('No se pudo reanudar la descarga');
        },
      }),
    [actions],
  );
  const handleCancelEpisode = useCallback(
    (id: string, episode: number) => {
      markEpisodePending(id, episode, true);
      actions.cancelEpisode.mutate(
        { id, episode },
        {
          onError: (error) => {
            if (!isIpcFailError(error)) toast.error(`No se pudo cancelar EP ${episode}`);
          },
          onSettled: () => markEpisodePending(id, episode, false),
        },
      );
    },
    [actions, markEpisodePending],
  );
  const handlePauseEpisode = useCallback(
    (id: string, episode: number) => {
      markEpisodePending(id, episode, true);
      actions.pauseEpisode.mutate(
        { id, episode },
        {
          onError: (error) => {
            if (!isIpcFailError(error)) toast.error(`No se pudo pausar EP ${episode}`);
          },
          onSettled: () => markEpisodePending(id, episode, false),
        },
      );
    },
    [actions, markEpisodePending],
  );
  const handleResumeEpisode = useCallback(
    (id: string, episode: number) => {
      markEpisodePending(id, episode, true);
      actions.resumeEpisode.mutate(
        { id, episode },
        {
          onError: (error) => {
            if (!isIpcFailError(error)) toast.error(`No se pudo reanudar EP ${episode}`);
          },
          onSettled: () => markEpisodePending(id, episode, false),
        },
      );
    },
    [actions, markEpisodePending],
  );
  const handleSkipEpisode = useCallback(
    (id: string, episode: number) => {
      const key = `${id}:${episode}`;
      const item = (queue as any[]).find((entry: any) => entry.id === id);
      skipEpFromRef.current.set(key, { server: epServerOf(item, episode), progress: epProgressOf(item, episode) });
      markEpisodePending(id, episode, true);
      setPendingSkipEpKeys((prev) => new Set(prev).add(key));
      const prevTimeout = skipEpTimeoutRef.current.get(key);
      if (prevTimeout) clearTimeout(prevTimeout);
      skipEpTimeoutRef.current.set(
        key,
        setTimeout(() => clearSkipEpPending(key), 10_000),
      );
      actions.skipEpisode.mutate(
        { id, episode },
        {
          onError: (error) => {
            clearSkipEpPending(key);
            if (!isIpcFailError(error)) toast.error(`No se pudo saltar servidor de EP ${episode}`);
          },
        },
      );
    },
    [actions, queue, markEpisodePending, clearSkipEpPending],
  );
  const handleRetryFailed = useCallback(
    (id: string) => {
      setPendingRetryIds((prev) => new Set(prev).add(id));
      actions.retryFailed.mutate(id, {
        onSuccess: () => {
          toast.success('Episodios fallidos reencolados');
          setPendingRetryIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        },
        onError: (error) => {
          if (!isIpcFailError(error)) {
            toast.error(error instanceof Error ? error.message : 'No se pudo reintentar la descarga');
          }
          setPendingRetryIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        },
      });
    },
    [actions],
  );
  const handleOpenAnimeFolder = useCallback(async (targetPath: string, animeTitle: string) => {
    try {
      if (targetPath) {
        // Sin aviso: si la ruta exacta falla, informa la búsqueda difusa.
        unwrap(await window.api.invoke('open-folder', targetPath), { toast: false });
        return;
      }
    } catch {}
    try {
      unwrap(await window.api.invoke('open-anime-folder', animeTitle));
    } catch (error) {
      if (!isIpcFailError(error)) toast.error('Error al abrir la carpeta');
    }
  }, []);

  const hasCompleted = useMemo(
    () => queue.some((i: any) => i.status === 'done' || i.status === 'failed' || i.status === 'cancelled'),
    [queue],
  );

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <PageHeader
        title="Descargas"
        description="Gestiona tu cola de descargas activas"
        actions={
          <button
            type="button"
            onClick={handleClear}
            disabled={!hasCompleted || actions.clearQueue.isPending}
            className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive-fg transition-colors hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/60"
          >
            <Trash2 className="h-4 w-4" />
            <span>Limpiar Finalizadas</span>
          </button>
        }
      />

      <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6 [scrollbar-gutter:stable]">
        {isLoading ? (
          <QueueSkeleton count={3} />
        ) : isError ? (
          <ErrorState
            title="No se pudo cargar la cola"
            description="No pudimos leer las descargas guardadas."
            onRetry={() => refetch()}
          />
        ) : queue.length === 0 ? (
          <EmptyState
            icon={<Clock className="h-10 w-10" aria-hidden="true" />}
            title="No hay descargas activas"
            description="Tu cola está vacía. Agrega anime desde el catálogo para comenzar a descargar."
            actionLabel="Explorar catálogo"
            onAction={() => navigateToCatalog()}
          />
        ) : (
          <div className="mx-auto w-full max-w-4xl space-y-2.5 xl:max-w-6xl 2xl:max-w-7xl">
            {queue.map((item: any, idx: number) => (
              <QueueItemRow
                key={item.id}
                item={item}
                activeProvider={activeProvider}
                onSelectAnime={onSelectAnime}
                onCancel={handleCancel}
                onPause={handlePause}
                onSkip={handleSkip}
                onRemove={handleRemoveItem}
                onResume={handleResume}
                onRetryFailed={handleRetryFailed}
                onCancelEpisode={handleCancelEpisode}
                onPauseEpisode={handlePauseEpisode}
                onResumeEpisode={handleResumeEpisode}
                onSkipEpisode={handleSkipEpisode}
                onOpenFolder={handleOpenAnimeFolder}
                isRetryPending={pendingRetryIds.has(item.id)}
                pendingEpisodeKeys={pendingEpisodeKeys}
                pendingSkipEpKeys={pendingSkipEpKeys}
                isSwitchPending={pendingSwitchIds.has(item.id)}
                isPriority={idx < 3}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={showClearConfirm}
        onOpenChange={setShowClearConfirm}
        title="Limpiar descargas finalizadas"
        message="Se quitarán de esta cola las descargas completadas, fallidas y canceladas. Los archivos de vídeo no se eliminarán."
        confirmLabel="Limpiar cola"
        danger
        onConfirm={confirmClear}
      />
    </div>
  );
}
