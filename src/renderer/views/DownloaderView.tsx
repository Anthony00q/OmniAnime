import {
  Trash2,
  SkipForward,
  XCircle,
  X,
  CheckCircle2,
  Clock,
  PlayCircle,
  Play,
  Pause,
  PauseCircle,
  Folder,
  FolderOpen,
  Server,
  RefreshCw,
  Ban,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import animeav1Icon from '../../../assets/provider-icons/animeav1-32.png';
import jkanimeIcon from '../../../assets/provider-icons/jkanime-32.png';

const PROVIDER_ICONS: Record<string, string> = {
  animeav1: animeav1Icon,
  jkanime: jkanimeIcon,
};
import { useCallback, useEffect, useState, memo, useMemo, useRef, type CSSProperties } from 'react';
import { useSetAtom } from 'jotai';
import { toast } from 'sonner';
import { useQueue, useDownloadActions } from '../hooks/useQueries';
import { PageHeader } from '../components/ui/PageHeader';
import { AppTooltip } from '../components/ui/AppTooltip';
import { PosterImage } from '../components/anime/PosterImage';
import { ProgressBar } from '../components/ui/ProgressBar';
import { StatusBadge } from '../components/ui/StatusBadge';
import { ErrorState } from '../components/ui/ErrorState';
import { Dialog } from '../components/Dialog';
import { QueueSkeleton } from '../components/anime/PosterGridSkeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { navigateToCatalogAtom } from '../store/atoms';
import { buildDetailRows, type DetailRow } from '../utils/downloaderRows';
import {
  DETAIL_DEFAULT_H,
  DETAIL_MIN_H,
  DETAIL_ROW_H,
  detailMaxForRows,
  shouldShowDetailResizer,
  snapDetailHeight,
} from '../utils/detailHeight';

const EMPTY_DETAIL_ROWS: DetailRow[] = [];

interface DownloaderViewProps {
  onSelectAnime?: (slug: string) => void;
  activeProvider?: string;
  isActive?: boolean;
}

function formatEpisodeList(episodes: number[]): string {
  if (!episodes || episodes.length === 0) return '—';

  const sorted = [...episodes].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
      start = sorted[i];
      end = sorted[i];
    }
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`);

  return ranges.join(', ');
}

interface QueueRowProps {
  item: any;
  activeProvider?: string;
  onSelectAnime?: (slug: string) => void;
  onCancel: (id: string) => void;
  onPause: (id: string) => void;
  onSkip: (id: string) => void;
  onRemove: (id: string) => void;
  onResume: (id: string) => void;
  onRetryFailed: (id: string) => void;
  onCancelEpisode: (id: string, episode: number) => void;
  onPauseEpisode: (id: string, episode: number) => void;
  onResumeEpisode: (id: string, episode: number) => void;
  onSkipEpisode: (id: string, episode: number) => void;
  onOpenFolder: (targetPath: string, title: string) => void;
  isRetryPending: boolean;
  pendingEpisodeKeys?: Set<string>;
  isPriority?: boolean;
}

interface EpisodeDetailRowProps {
  row: DetailRow;
  itemId: string;
  animeTitle: string;
  isEpPending: boolean;
  onPauseEpisode: (id: string, episode: number) => void;
  onResumeEpisode: (id: string, episode: number) => void;
  onSkipEpisode: (id: string, episode: number) => void;
  onCancelEpisode: (id: string, episode: number) => void;
}

// Fila memoizada por episodio: solo re-renderiza si cambian sus propios
// campos o su pending, no cuando otro EP de la lista cambia de estado.
const EpisodeDetailRow = memo(
  function EpisodeDetailRow({
    row: e,
    itemId,
    animeTitle,
    isEpPending,
    onPauseEpisode,
    onResumeEpisode,
    onSkipEpisode,
    onCancelEpisode,
  }: EpisodeDetailRowProps) {
    const epPct = Math.round((e.progress ?? 0) * 100);
    const isEpPaused = e.state === 'paused';
    const isEpCancelled = e.state === 'cancelled';
    const isEpQueued = e.state === 'queued';
    const isEpCompleted = e.state === 'completed';
    const isEpFailed = e.state === 'failed';
    const isEpDone = isEpCompleted || isEpFailed;
    const showActions = !isEpCancelled && !isEpDone;
    const showSkip = e.state === 'active' && !!e.server;
    return (
      <div className="episode-list-item flex flex-col justify-center gap-1 py-1" data-ep-state={e.state}>
        <div className="flex items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">EP {e.episode}</span>
          {e.server && !isEpPaused && !isEpCancelled && !isEpDone && !isEpQueued && (
            <span className="min-w-0 flex-1 truncate">{e.server}</span>
          )}
          {isEpPaused && (
            <span className="inline-flex min-w-0 flex-1 items-center gap-1 text-muted-foreground">
              <PauseCircle className="h-3 w-3 shrink-0" />
              <span className="truncate">Pausado{e.server ? ` · ${e.server}` : ''}</span>
            </span>
          )}
          {isEpQueued && (
            <span className="inline-flex min-w-0 flex-1 items-center gap-1 text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" />
              <span className="truncate">En cola</span>
            </span>
          )}
          {isEpCompleted && (
            <span className="inline-flex min-w-0 flex-1 items-center gap-1 text-success">
              <CheckCircle2 className="h-3 w-3 shrink-0" />
              <span className="truncate">Completado</span>
            </span>
          )}
          {isEpFailed && (
            <span className="inline-flex min-w-0 flex-1 items-center gap-1 text-destructive-fg">
              <XCircle className="h-3 w-3 shrink-0" />
              <span className="truncate">Fallido{e.server ? ` · ${e.server}` : ''}</span>
            </span>
          )}
          {isEpCancelled && (
            <span className="inline-flex min-w-0 flex-1 items-center gap-1 text-muted-foreground">
              <Ban className="h-3 w-3 shrink-0" />
              <span className="truncate">Cancelado</span>
            </span>
          )}
          {!isEpCancelled && <span className="ml-auto shrink-0">{epPct}%</span>}
          {isEpCancelled && <span className="ml-auto shrink-0">—</span>}
          {showActions && (
            <span className="flex shrink-0 items-center gap-0.5">
              {isEpPaused ? (
                <AppTooltip content={`Reanudar EP ${e.episode}`}>
                  <button
                    type="button"
                    onClick={() => onResumeEpisode(itemId, e.episode)}
                    disabled={isEpPending}
                    aria-label={`Reanudar EP ${e.episode}`}
                    className="relative flex h-7 w-7 items-center justify-center rounded-md text-primary transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    <Play className="h-3 w-3" />
                  </button>
                </AppTooltip>
              ) : (
                <AppTooltip content={`Pausar EP ${e.episode}`}>
                  <button
                    type="button"
                    onClick={() => onPauseEpisode(itemId, e.episode)}
                    disabled={isEpPending}
                    aria-label={`Pausar EP ${e.episode}`}
                    className="relative flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    <Pause className="h-3 w-3" />
                  </button>
                </AppTooltip>
              )}
              {showSkip && (
                <AppTooltip content={`Saltar servidor EP ${e.episode}`}>
                  <button
                    type="button"
                    onClick={() => onSkipEpisode(itemId, e.episode)}
                    disabled={isEpPending}
                    aria-label={`Saltar servidor EP ${e.episode}`}
                    className="relative flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    <SkipForward className="h-3 w-3" />
                  </button>
                </AppTooltip>
              )}
              <AppTooltip content={`Cancelar EP ${e.episode}`}>
                <button
                  type="button"
                  onClick={() => onCancelEpisode(itemId, e.episode)}
                  disabled={isEpPending}
                  aria-label={`Cancelar EP ${e.episode}`}
                  className="relative flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-destructive/10 hover:text-destructive-fg disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/60"
                >
                  <X className="h-3 w-3" />
                </button>
              </AppTooltip>
            </span>
          )}
        </div>
        {!isEpCancelled && (
          <ProgressBar
            value={epPct}
            variant={isEpCompleted ? 'success' : isEpFailed ? 'danger' : undefined}
            label={`${animeTitle} — EP ${e.episode} ${epPct}%${isEpPaused ? ' (pausado)' : ''}${isEpQueued ? ' (en cola)' : ''}${isEpCompleted ? ' (completado)' : ''}${isEpFailed ? ' (fallido)' : ''}`}
            showValue={false}
            aria-valuetext={`EP ${e.episode} ${epPct}%${e.server ? ` desde ${e.server}` : ''}${isEpPaused ? ', pausado' : ''}${isEpQueued ? ', en cola' : ''}${isEpCompleted ? ', completado' : ''}${isEpFailed ? ', fallido' : ''}`}
          />
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.row.episode === next.row.episode &&
    prev.row.progress === next.row.progress &&
    prev.row.server === next.row.server &&
    prev.row.state === next.row.state &&
    prev.itemId === next.itemId &&
    prev.animeTitle === next.animeTitle &&
    prev.isEpPending === next.isEpPending &&
    prev.onPauseEpisode === next.onPauseEpisode &&
    prev.onResumeEpisode === next.onResumeEpisode &&
    prev.onSkipEpisode === next.onSkipEpisode &&
    prev.onCancelEpisode === next.onCancelEpisode,
);

const QueueItemRow = memo(
  function QueueItemRow({
    item,
    activeProvider,
    onSelectAnime,
    onCancel,
    onPause,
    onSkip,
    onRemove,
    onResume,
    onRetryFailed,
    onCancelEpisode,
    onPauseEpisode,
    onResumeEpisode,
    onSkipEpisode,
    onOpenFolder,
    isRetryPending,
    pendingEpisodeKeys,
    isPriority = false,
  }: QueueRowProps) {
    const pct = useMemo(() => {
      if (item.status === 'downloading' || item.status === 'paused' || item.status === 'pending')
        return Math.round((item.progress ?? 0) * 100);
      // Done limpio siempre 100; con fallidos muestra el % real agregado
      // para no pintar barra llena con descargas parciales.
      if (item.status === 'done' && !(item.failedEps?.length > 0)) return 100;
      if (item.status === 'failed' || item.status === 'done') return Math.round((item.progress ?? 0) * 100);
      return 0;
    }, [item.status, item.progress, item.failedEps]);
    const episodesLabel = useMemo(() => formatEpisodeList(item.episodes), [item.episodes]);
    const hasFailedEpisodes = (item.failedEps?.length || 0) > 0;
    const isDone = item.status === 'done' && !hasFailedEpisodes;
    const isFailed = item.status === 'failed' || (item.status === 'done' && hasFailedEpisodes);
    const isCancelled = item.status === 'cancelled';
    const isDownloading = item.status === 'downloading';
    const isPaused = item.status === 'paused';
    const activeEps = useMemo(
      () =>
        isDownloading && Array.isArray(item.activeEps)
          ? (item.activeEps as Array<{ episode: number; progress: number; server?: string }>)
              .filter((e) => typeof e?.episode === 'number')
              .slice(0, 3)
          : [],
      [isDownloading, item.activeEps],
    );
    const isParallel = isDownloading && activeEps.length > 1;
    const isCardActive = isDownloading || isPaused || item.status === 'pending';
    const detailRows = useMemo(() => {
      // Terminales nunca muestran detalle: evita el build en cada update.
      if (!isDownloading && !isPaused && item.status !== 'pending') return EMPTY_DETAIL_ROWS;
      return buildDetailRows({
        activeEps,
        pausedEps: item.pausedEps,
        cancelledEps: item.cancelledEps,
        snapshot: item.pausedEpSnapshot,
        completedEps: item.completedEps,
        failedEps: item.failedEps,
        episodes: item.episodes,
        itemStatus: item.status,
      });
    }, [
      isDownloading,
      isPaused,
      activeEps,
      item.pausedEps,
      item.cancelledEps,
      item.pausedEpSnapshot,
      item.completedEps,
      item.failedEps,
      item.episodes,
      item.status,
    ]);
    const hasDetail = isCardActive && detailRows.length > 1;
    // Tope de arrastre por descarga: contenido real acotado a 7 filas.
    const detailMax = detailMaxForRows(detailRows.length);
    const isTerminal = isDone || isFailed || isCancelled;
    const firstFailedEpisode = item.failedEps?.[0];
    const firstFailureReason = firstFailedEpisode ? item.failureReasons?.[String(firstFailedEpisode)] : undefined;
    const [showFullError, setShowFullError] = useState(false);
    const toggleErrorClick = useCallback(() => setShowFullError((v) => !v), []);
    const [showParallel, setShowParallel] = useState(false);
    const toggleParallelClick = useCallback(() => setShowParallel((v) => !v), []);
    useEffect(() => {
      setShowFullError(false);
    }, [item.id, item.status]);
    // El detalle abierto sobrevive entre descargando<->pausa (mismo item activo),
    // incluido el pending transitorio al reanudar; solo se colapsa al terminar/quitar
    useEffect(() => {
      if (item.status !== 'downloading' && item.status !== 'paused' && item.status !== 'pending')
        setShowParallel(false);
    }, [item.id, item.status]);
    // Altura del Detalle por descarga (solo sesión): el keep-alive la conserva
    // mientras la app está abierta; los deltas de progreso no la tocan.
    const [detailHeight, setDetailHeight] = useState(DETAIL_DEFAULT_H);
    const [isResizingDetail, setIsResizingDetail] = useState(false);
    const detailDragRef = useRef<{ startY: number; startH: number; pointerId: number; el: HTMLDivElement } | null>(
      null,
    );
    const detailScrollRef = useRef<HTMLDivElement | null>(null);
    const detailHeightRef = useRef(detailHeight);
    detailHeightRef.current = detailHeight;
    const detailMaxRef = useRef(detailMax);
    detailMaxRef.current = detailMax;
    // Movimiento a nivel de ventana: el gesto sobrevive aunque el puntero
    // salga del grip (con PointerCapture como primera vía y esto de red).
    const handleDetailResizeMoveWindow = useCallback((e: PointerEvent) => {
      const drag = detailDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      setDetailHeight(snapDetailHeight(drag.startH + (e.clientY - drag.startY), detailMaxRef.current));
    }, []);
    const endDetailResize = useCallback(() => {
      const drag = detailDragRef.current;
      if (drag) {
        try {
          drag.el.releasePointerCapture(drag.pointerId);
        } catch {}
      }
      detailDragRef.current = null;
      setIsResizingDetail(false);
      window.removeEventListener('pointermove', handleDetailResizeMoveWindow);
      window.removeEventListener('pointerup', endDetailResize);
      window.removeEventListener('pointercancel', endDetailResize);
      window.removeEventListener('blur', endDetailResize);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }, [handleDetailResizeMoveWindow]);
    const handleDetailResizeStart = useCallback(
      (e: React.PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        e.preventDefault();
        detailDragRef.current = {
          startY: e.clientY,
          startH: detailHeightRef.current,
          pointerId: e.pointerId,
          el: e.currentTarget,
        };
        setIsResizingDetail(true);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {}
        window.addEventListener('pointermove', handleDetailResizeMoveWindow);
        window.addEventListener('pointerup', endDetailResize);
        window.addEventListener('pointercancel', endDetailResize);
        window.addEventListener('blur', endDetailResize);
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
      },
      [endDetailResize, handleDetailResizeMoveWindow],
    );
    const handleDetailResizeMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
      const drag = detailDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      setDetailHeight(snapDetailHeight(drag.startH + (e.clientY - drag.startY), detailMaxRef.current));
    }, []);
    const handleDetailResizeKey = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const d = e.key === 'ArrowDown' ? DETAIL_ROW_H : -DETAIL_ROW_H;
          setDetailHeight(snapDetailHeight(detailHeight + d, detailMax));
        } else if (e.key === 'Home') {
          e.preventDefault();
          setDetailHeight(DETAIL_MIN_H);
        } else if (e.key === 'End') {
          e.preventDefault();
          setDetailHeight(detailMax);
        } else if (e.key === 'Escape' && detailDragRef.current) {
          e.preventDefault();
          setDetailHeight(snapDetailHeight(detailDragRef.current.startH, detailMax));
          endDetailResize();
        }
      },
      [detailHeight, detailMax, endDetailResize],
    );
    const handleDetailResizeReset = useCallback(
      () => setDetailHeight(snapDetailHeight(DETAIL_DEFAULT_H, detailMax)),
      [detailMax],
    );
    const prevShowParallelRef = useRef(showParallel);
    const prevDetailRowsRef = useRef(detailRows.length);
    // Al abrir: viewport de 3 filas como máximo (exacto si hay menos).
    // Se re-ejecuta si cambia el nº de filas con el Detalle abierto para
    // auto-curar alturas rancias (p. ej. estado previo al tope). Solo en
    // esos casos; el resize manual posterior y los deltas de progreso
    // (que no cambian el conteo) no la tocan.
    useEffect(() => {
      const was = prevShowParallelRef.current;
      const prevLen = prevDetailRowsRef.current;
      prevShowParallelRef.current = showParallel;
      prevDetailRowsRef.current = detailRows.length;
      if (showParallel && (!was || prevLen !== detailRows.length)) {
        setDetailHeight(snapDetailHeight(DETAIL_DEFAULT_H, detailMaxForRows(detailRows.length)));
      }
    }, [showParallel, detailRows.length]);
    // Al abrir: un solo scroll al primer EP en vuelo para no mostrar solo
    // completados. Sin seguimiento posterior (evita jank en cada progreso).
    useEffect(() => {
      if (!showParallel) return;
      const frame = requestAnimationFrame(() => {
        const root = detailScrollRef.current;
        const target = root?.querySelector('[data-ep-state="active"]');
        if (target && root) {
          const reduced =
            typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          target.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
        }
      });
      return () => cancelAnimationFrame(frame);
    }, [showParallel]);
    // Limpieza si se desmonta en pleno gesto: quita listeners y devuelve
    // estado y cursor globales a reposo para no dejar azul/cursor pegados.
    useEffect(
      () => () => {
        window.removeEventListener('pointermove', handleDetailResizeMoveWindow);
        window.removeEventListener('pointerup', endDetailResize);
        window.removeEventListener('pointercancel', endDetailResize);
        window.removeEventListener('blur', endDetailResize);
        setIsResizingDetail(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      },
      [endDetailResize, handleDetailResizeMoveWindow],
    );

    const isProviderMatch = !item.providerId || item.providerId === activeProvider;
    const providerName =
      item.providerId === 'jkanime' ? 'JkAnime' : item.providerId === 'animeav1' ? 'AnimeAV1' : 'Proveedor original';
    const sourceLabel = item.providerId ? providerName : 'Fuente no disponible';
    const canOpenDetails = !!item.slug && !!onSelectAnime && isProviderMatch;

    const handleClickDetails = useCallback(() => {
      if (!item.slug) return;
      if (isProviderMatch) {
        onSelectAnime?.(item.slug);
      } else {
        toast.info(`Cambia al proveedor ${providerName} en el panel izquierdo para ver la información de este anime.`);
      }
    }, [item.slug, isProviderMatch, onSelectAnime, providerName]);

    const handleCancelClick = useCallback(() => onCancel(item.id), [onCancel, item.id]);
    const handlePauseClick = useCallback(() => onPause(item.id), [onPause, item.id]);
    const handleSkipClick = useCallback(() => onSkip(item.id), [onSkip, item.id]);
    const handleRemoveClick = useCallback(() => onRemove(item.id), [onRemove, item.id]);
    const handleResumeClick = useCallback(() => onResume(item.id), [onResume, item.id]);
    const handleRetryClick = useCallback(() => onRetryFailed(item.id), [onRetryFailed, item.id]);
    // Ruta exacta del item: con varios destinos, buscar por título podía abrir la carpeta del otro destino
    const handleOpenFolderClick = useCallback(
      () => onOpenFolder(item.targetPath || item.dirFullPath || '', item.animeTitle),
      [onOpenFolder, item.targetPath, item.dirFullPath, item.animeTitle],
    );

    return (
      <div
        key={item.id}
        className={`downloader-card bg-card border rounded-xl overflow-hidden shadow-sm transition-colors ${
          isDone
            ? 'border-success/20 bg-success/[0.06]'
            : isFailed
              ? 'border-destructive/20'
              : isCancelled
                ? 'border-border/60'
                : isPaused
                  ? 'border-border/60'
                  : 'border-border/50'
        }`}
      >
        <div className="flex min-w-0 flex-row">
          {canOpenDetails ? (
            <button
              type="button"
              onClick={handleClickDetails}
              aria-label={`Ver detalles de ${item.animeTitle}`}
              className="group relative w-16 shrink-0 self-stretch overflow-hidden bg-secondary/30 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-inset sm:w-[72px]"
            >
              <PosterImage
                src={item.poster}
                alt={item.animeTitle}
                fallbackLabel={item.animeTitle}
                priority={!!isPriority}
                className="h-full min-h-[108px] w-full object-cover transition-transform duration-200 ease-out group-hover:scale-105 sm:min-h-[112px]"
              />
              <span
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100 group-focus-visible:opacity-100"
              />
              <span
                aria-hidden="true"
                className="absolute inset-0 flex scale-95 items-center justify-center opacity-0 transition-[opacity,scale] duration-200 ease-out group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100"
              >
                <span className="rounded-full bg-background/80 p-1.5 backdrop-blur-sm">
                  <ChevronRight className="h-4 w-4 text-foreground" />
                </span>
              </span>
            </button>
          ) : (
            <div className="w-16 shrink-0 self-stretch overflow-hidden bg-secondary/30 sm:w-[72px]">
              <PosterImage
                src={item.poster}
                alt={item.animeTitle}
                fallbackLabel={item.animeTitle}
                priority={!!isPriority}
                className="h-full min-h-[108px] w-full object-cover sm:min-h-[112px]"
              />
            </div>
          )}

          <div className="min-w-0 flex-1 p-3">
            <div className="mb-2 flex flex-row items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="truncate text-[15px] font-semibold leading-snug text-foreground">
                  {canOpenDetails ? (
                    <button
                      type="button"
                      onClick={handleClickDetails}
                      aria-label={`Ver detalles de ${item.animeTitle}`}
                      className="truncate text-left transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    >
                      {item.animeTitle}
                    </button>
                  ) : (
                    <span className="truncate">{item.animeTitle}</span>
                  )}
                </h3>
                {!isProviderMatch && item.slug && onSelectAnime && (
                  <p
                    id={`provider-hint-${item.id}`}
                    className="mt-1 inline-flex items-center gap-1 rounded-md border border-border/40 bg-secondary/60 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
                  >
                    {item.providerId && PROVIDER_ICONS[item.providerId] && (
                      <img
                        src={PROVIDER_ICONS[item.providerId]}
                        alt=""
                        aria-hidden="true"
                        className="h-3 w-3 rounded-[3px] shrink-0"
                        draggable={false}
                      />
                    )}
                    Cambia a {providerName} para ver detalles
                  </p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <AppTooltip content={episodesLabel !== '—' ? `Episodios: ${episodesLabel}` : ''}>
                    <span
                      className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-secondary px-1.5 py-0.5"
                      aria-label={
                        episodesLabel !== '—' ? `${item.episodes?.length || 0} episodios: ${episodesLabel}` : undefined
                      }
                    >
                      <span className="text-[11px] font-bold tabular-nums text-foreground">
                        {item.episodes?.length || 0} {(item.episodes?.length || 0) === 1 ? 'ep' : 'eps'}
                      </span>
                      {episodesLabel !== '—' && (
                        <span className="max-w-[140px] truncate text-[11px] font-medium tabular-nums text-muted-foreground">
                          · {episodesLabel}
                        </span>
                      )}
                    </span>
                  </AppTooltip>
                  {item.dirLabel && (
                    <AppTooltip content={`Destino: ${item.dirFullPath}`}>
                      <span className="inline-flex max-w-[160px] items-center gap-1 rounded-md border border-border/40 bg-secondary/60 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                        <Folder className="h-3 w-3 shrink-0" />
                        <span className="truncate">{item.dirLabel}</span>
                      </span>
                    </AppTooltip>
                  )}
                  <AppTooltip content={`Proveedor de origen: ${sourceLabel}`}>
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border/40 bg-secondary/60 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {item.providerId && PROVIDER_ICONS[item.providerId] && (
                        <img
                          src={PROVIDER_ICONS[item.providerId]}
                          alt=""
                          aria-hidden="true"
                          className="h-3 w-3 rounded-[3px] shrink-0"
                          draggable={false}
                        />
                      )}
                      {sourceLabel}
                    </span>
                  </AppTooltip>
                </div>
              </div>
              <div className="flex shrink-0 items-center justify-end gap-1">
                {isDownloading && (
                  <AppTooltip content="Pausar descarga">
                    <button
                      type="button"
                      onClick={handlePauseClick}
                      aria-label="Pausar descarga"
                      className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-foreground transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    >
                      <Pause className="w-3.5 h-3.5" />
                    </button>
                  </AppTooltip>
                )}
                {isDownloading && (
                  <AppTooltip content="Saltar servidor">
                    <button
                      type="button"
                      onClick={handleSkipClick}
                      aria-label="Saltar servidor"
                      className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-foreground transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    >
                      <SkipForward className="w-3.5 h-3.5" />
                    </button>
                  </AppTooltip>
                )}
                {isPaused && (
                  <AppTooltip content="Reanudar descarga">
                    <button
                      type="button"
                      onClick={handleResumeClick}
                      aria-label="Reanudar descarga"
                      className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </button>
                  </AppTooltip>
                )}
                {isTerminal ? (
                  <>
                    {isFailed && item.failedEps?.length > 0 && (
                      <AppTooltip content="Reintentar fallidos">
                        <button
                          type="button"
                          onClick={handleRetryClick}
                          disabled={isRetryPending}
                          aria-label="Reintentar fallidos"
                          className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                      </AppTooltip>
                    )}
                    <AppTooltip content="Abrir carpeta">
                      <button
                        type="button"
                        onClick={handleOpenFolderClick}
                        aria-label="Abrir carpeta"
                        className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-foreground transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                      </button>
                    </AppTooltip>
                    <AppTooltip content="Quitar de la cola">
                      <button
                        type="button"
                        onClick={handleRemoveClick}
                        aria-label="Quitar de la cola"
                        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/60"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </AppTooltip>
                  </>
                ) : (
                  !isPaused && (
                    <AppTooltip content="Cancelar descarga">
                      <button
                        type="button"
                        onClick={handleCancelClick}
                        aria-label="Cancelar descarga"
                        className="flex h-9 w-9 items-center justify-center rounded-md bg-destructive/10 text-destructive-fg transition-colors hover:bg-destructive/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/60"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                      </button>
                    </AppTooltip>
                  )
                )}
                {isPaused && (
                  <AppTooltip content="Quitar de la cola">
                    <button
                      type="button"
                      onClick={handleRemoveClick}
                      aria-label="Quitar de la cola"
                      className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/60"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </AppTooltip>
                )}
              </div>
            </div>

            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                {isDone ? (
                  <StatusBadge
                    variant="success"
                    label="Finalizado"
                    icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                    className="px-2 py-0.5 text-[11px]"
                  />
                ) : isFailed ? (
                  <StatusBadge
                    variant="danger"
                    label="Con errores"
                    icon={<XCircle className="h-3.5 w-3.5" />}
                    className="px-2 py-0.5 text-[11px]"
                  />
                ) : isCancelled ? (
                  <StatusBadge
                    variant="cancelled"
                    label="Cancelado"
                    icon={<Ban className="h-3.5 w-3.5" />}
                    className="px-2 py-0.5 text-[11px]"
                  />
                ) : isPaused ? (
                  <StatusBadge
                    variant="neutral"
                    label="Pausada"
                    icon={<PauseCircle className="h-3.5 w-3.5" />}
                    className="px-2 py-0.5 text-[11px]"
                  />
                ) : isDownloading ? (
                  <StatusBadge
                    variant="info"
                    label="Descargando"
                    icon={<PlayCircle className="h-3.5 w-3.5" />}
                    className="px-2 py-0.5 text-[11px]"
                  />
                ) : (
                  <StatusBadge
                    variant="neutral"
                    label="En Cola"
                    icon={<Clock className="h-3.5 w-3.5" />}
                    className="px-2 py-0.5 text-[11px]"
                  />
                )}
              </div>

              <div className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
                {isCardActive ? `${detailRows.length > 1 ? 'Total ' : ''}${pct}% · ` : ''}
                {item.completedEps?.length || 0}/{item.episodes?.length || 0}{' '}
                {(item.episodes?.length || 0) === 1 ? 'ep' : 'eps'}
                {item.failedEps?.length > 0 && (
                  <span className="ml-1 text-destructive-fg">({item.failedEps.length} fallidos)</span>
                )}
                {isCardActive && (item.pausedEps?.length || 0) > 0 && (
                  <span className="ml-1 text-muted-foreground">({item.pausedEps.length} pausados)</span>
                )}
                {isCardActive && (item.cancelledEps?.length || 0) > 0 && (
                  <span className="ml-1">({item.cancelledEps.length} cancelados)</span>
                )}
              </div>
            </div>

            <div className="downloader-card-slot-progress" data-state="open">
              <div className="downloader-card-slot-progress-content">
                {isDownloading ? (
                  <div className="flex flex-col justify-center gap-1">
                    <ProgressBar
                      value={pct}
                      indeterminate={pct === 0}
                      label={
                        isParallel
                          ? `${item.animeTitle} — progreso total ${pct}%`
                          : `${item.animeTitle} — progreso ${pct}%`
                      }
                      showValue={false}
                      aria-valuetext={`${pct}% • ${item.completedEps?.length || 0}/${item.episodes?.length || 0} episodios`}
                    />
                    <div className="flex min-h-[18px] items-center gap-1.5 text-[11px] text-muted-foreground">
                      {pct === 0 ? (
                        <span className="font-medium">Conectando...</span>
                      ) : item.currentServer ? (
                        <span className="inline-flex min-w-0 max-w-full items-center gap-1">
                          <Server className="h-3 w-3 shrink-0" />
                          <span className="truncate font-medium">{item.currentServer}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground/70">Preparando servidor…</span>
                      )}
                      {hasDetail && (
                        <button
                          type="button"
                          onClick={toggleParallelClick}
                          aria-expanded={showParallel}
                          aria-label={showParallel ? 'Ocultar progreso por episodio' : 'Ver progreso por episodio'}
                          className="ml-auto inline-flex shrink-0 items-center gap-1 rounded font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                        >
                          Detalle ({detailRows.length})
                          <ChevronDown
                            className={`h-3.5 w-3.5 transition-transform duration-200 ${showParallel ? 'rotate-180' : ''}`}
                          />
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col justify-center gap-1">
                    <ProgressBar
                      value={isPaused ? pct : isDone ? 100 : isFailed ? pct : 0}
                      variant={isDone ? 'success' : isFailed ? 'danger' : isPaused ? 'neutral' : 'primary'}
                      label={`${item.animeTitle} — ${isDone ? 'completado' : isFailed ? 'con errores' : isPaused ? `pausado ${pct}%` : isCancelled ? 'cancelado' : 'en espera'}`}
                      showValue={false}
                      aria-valuetext={
                        isPaused
                          ? `${pct}% • ${item.completedEps?.length || 0}/${item.episodes?.length || 0} episodios`
                          : undefined
                      }
                    />
                    <div className="flex min-h-[18px] items-center gap-1.5 text-[11px]">
                      {isFailed ? (
                        <span className="inline-flex min-w-0 max-w-full items-center gap-1 text-destructive-fg">
                          <span className="shrink-0 font-semibold">EP {firstFailedEpisode ?? '?'}:</span>
                          <span className="truncate">
                            {firstFailureReason || 'No se pudo completar la descarga.'}
                            {!showFullError && (item.failedEps?.length || 0) > 1
                              ? ` (+${(item.failedEps?.length || 0) - 1} más)`
                              : ''}
                          </span>
                          <button
                            type="button"
                            onClick={toggleErrorClick}
                            aria-expanded={showFullError}
                            className="shrink-0 rounded font-semibold text-destructive-fg/80 transition-colors hover:text-destructive-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/60"
                          >
                            {showFullError ? 'Ver menos' : 'Ver más'}
                          </button>
                        </span>
                      ) : isDone ? (
                        <span className="truncate text-muted-foreground">
                          {item.dirLabel ? `Guardado en ${item.dirLabel}` : 'Descarga completada'}
                        </span>
                      ) : isPaused ? (
                        <span className="inline-flex min-w-0 flex-1 items-center gap-1 text-muted-foreground">
                          <PauseCircle className="h-3 w-3 shrink-0" />
                          <span className="truncate">Descarga pausada</span>
                        </span>
                      ) : isCancelled ? (
                        <span className="text-muted-foreground">Descarga cancelada</span>
                      ) : (
                        <span className="text-muted-foreground/70">En espera…</span>
                      )}
                      {(isPaused || item.status === 'pending') && hasDetail && (
                        <button
                          type="button"
                          onClick={toggleParallelClick}
                          aria-expanded={showParallel}
                          aria-label={showParallel ? 'Ocultar progreso por episodio' : 'Ver progreso por episodio'}
                          className="ml-auto inline-flex shrink-0 items-center gap-1 rounded font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                        >
                          Detalle ({detailRows.length})
                          <ChevronDown
                            className={`h-3.5 w-3.5 transition-transform duration-200 ${showParallel ? 'rotate-180' : ''}`}
                          />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div
              className="downloader-card-slot-parallel"
              data-state={isCardActive && hasDetail && showParallel ? 'open' : 'closed'}
              aria-hidden={!isCardActive || !hasDetail || !showParallel}
              inert={!isCardActive || !hasDetail || !showParallel ? true : undefined}
            >
              <div
                className="downloader-card-slot-parallel-content"
                style={{ '--detail-h': `${detailHeight}px` } as CSSProperties}
              >
                <div ref={detailScrollRef} className="downloader-detail-scroll">
                  {isCardActive &&
                    hasDetail &&
                    detailRows.map((e) => (
                      <EpisodeDetailRow
                        key={e.episode}
                        row={e}
                        itemId={item.id}
                        animeTitle={item.animeTitle}
                        isEpPending={pendingEpisodeKeys?.has(`${item.id}:${e.episode}`) ?? false}
                        onPauseEpisode={onPauseEpisode}
                        onResumeEpisode={onResumeEpisode}
                        onSkipEpisode={onSkipEpisode}
                        onCancelEpisode={onCancelEpisode}
                      />
                    ))}
                </div>
                {isCardActive &&
                  hasDetail &&
                  shouldShowDetailResizer(detailRows.length, detailHeight, isResizingDetail) && (
                    <div
                      role="separator"
                      aria-orientation="horizontal"
                      aria-label={`Altura del detalle (${detailRows.length} episodios). Arrastra para ver más o menos episodios, doble clic para restablecer.`}
                      aria-valuemin={DETAIL_MIN_H}
                      aria-valuemax={detailMax}
                      aria-valuenow={detailHeight}
                      aria-valuetext={`${Math.min(
                        detailRows.length,
                        Math.max(1, Math.round(detailHeight / DETAIL_ROW_H)),
                      )} de ${detailRows.length} episodios visibles`}
                      tabIndex={0}
                      data-resizing={isResizingDetail || undefined}
                      className="downloader-detail-resizer"
                      onPointerDown={handleDetailResizeStart}
                      onPointerMove={handleDetailResizeMove}
                      onPointerUp={endDetailResize}
                      onPointerCancel={endDetailResize}
                      onLostPointerCapture={endDetailResize}
                      onKeyDown={handleDetailResizeKey}
                      onDoubleClick={handleDetailResizeReset}
                    >
                      <span aria-hidden="true" className="downloader-detail-resizer-grip" />
                    </div>
                  )}
              </div>
            </div>

            <div
              className="downloader-card-slot-error"
              data-state={isFailed && showFullError ? 'open' : 'closed'}
              aria-hidden={!isFailed || !showFullError}
              inert={!isFailed || !showFullError ? true : undefined}
            >
              <div className="downloader-card-slot-error-content">
                <div className="mt-2 max-h-28 overflow-y-auto rounded-lg border border-destructive/20 bg-destructive/5 px-2.5 py-1.5 text-xs leading-relaxed text-muted-foreground select-text">
                  <span className="font-semibold text-destructive-fg">EP {firstFailedEpisode ?? '?'}: </span>
                  <span className="break-words">{firstFailureReason || 'No se pudo completar la descarga.'}</span>
                  {(item.failedEps?.length || 0) > 1 && (
                    <div className="mt-1 text-[11px] font-medium text-destructive-fg/80">
                      +{(item.failedEps?.length || 0) - 1} episodio(s) más con error
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  },
  (prev, next) => {
    if (
      prev.item !== next.item ||
      prev.activeProvider !== next.activeProvider ||
      prev.isRetryPending !== next.isRetryPending ||
      prev.isPriority !== next.isPriority
    ) {
      return false;
    }
    // El Set cambia de identidad por cada click: comparar solo las claves
    // propias del item para no re-renderizar toda la cola.
    const eps: number[] = Array.isArray(next.item?.episodes) ? next.item.episodes : [];
    const id: string = next.item?.id;
    if (!eps.length || !id) return prev.pendingEpisodeKeys === next.pendingEpisodeKeys;
    for (const ep of eps) {
      const key = `${id}:${ep}`;
      if (prev.pendingEpisodeKeys?.has(key) !== next.pendingEpisodeKeys?.has(key)) return false;
    }
    return true;
  },
);

export function DownloaderView({ onSelectAnime, activeProvider, isActive = true }: DownloaderViewProps) {
  const { data: queue = [], isLoading, isError, refetch } = useQueue();
  const actions = useDownloadActions();
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [pendingRetryIds, setPendingRetryIds] = useState<Set<string>>(new Set());
  const navigateToCatalog = useSetAtom(navigateToCatalogAtom);

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
        onError: () => toast.error('No se pudo pausar la descarga'),
      }),
    [actions],
  );
  const handleSkip = useCallback(
    (id: string) =>
      actions.skipServer.mutate(id, {
        onError: () => toast.error('No se pudo saltar el servidor'),
      }),
    [actions],
  );
  const handleRemoveItem = useCallback((id: string) => actions.removeFromQueue.mutate(id), [actions]);
  const handleResume = useCallback(
    (id: string) =>
      actions.resumeDownload.mutate(id, {
        onError: () => toast.error('No se pudo reanudar la descarga'),
      }),
    [actions],
  );
  const [pendingEpisodeKeys, setPendingEpisodeKeys] = useState<Set<string>>(new Set());
  const markEpisodePending = useCallback((id: string, episode: number, pending: boolean) => {
    const key = `${id}:${episode}`;
    setPendingEpisodeKeys((prev) => {
      const next = new Set(prev);
      if (pending) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  const handleCancelEpisode = useCallback(
    (id: string, episode: number) => {
      markEpisodePending(id, episode, true);
      actions.cancelEpisode.mutate(
        { id, episode },
        {
          onError: () => toast.error(`No se pudo cancelar EP ${episode}`),
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
          onError: () => toast.error(`No se pudo pausar EP ${episode}`),
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
          onError: () => toast.error(`No se pudo reanudar EP ${episode}`),
          onSettled: () => markEpisodePending(id, episode, false),
        },
      );
    },
    [actions, markEpisodePending],
  );
  const handleSkipEpisode = useCallback(
    (id: string, episode: number) => {
      markEpisodePending(id, episode, true);
      actions.skipEpisode.mutate(
        { id, episode },
        {
          onError: () => toast.error(`No se pudo saltar servidor de EP ${episode}`),
          onSettled: () => markEpisodePending(id, episode, false),
        },
      );
    },
    [actions, markEpisodePending],
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
          toast.error(error instanceof Error ? error.message : 'No se pudo reintentar la descarga');
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
        const exact = await window.api.invoke('open-folder', targetPath);
        if (exact?.success !== false) return;
      }
    } catch {}
    try {
      const ok = await window.api.invoke('open-anime-folder', animeTitle);
      if (!ok) toast.error('No se pudo encontrar la carpeta de descarga');
    } catch {
      toast.error('Error al abrir la carpeta');
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

      <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
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
