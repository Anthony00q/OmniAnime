import { Loader2, Folder, Server, ChevronDown, ChevronRight, XCircle, X } from 'lucide-react';
import { useCallback, useEffect, useState, memo, useMemo, useId, useRef } from 'react';
import { toast } from 'sonner';
import { AppTooltip } from '@/renderer/components/ui/AppTooltip';
import { PosterImage } from '@/renderer/components/anime/PosterImage';
import { ProgressBar } from '@/renderer/components/ui/ProgressBar';
import { buildDetailRows } from '@/renderer/utils/downloaderRows';
import { formatSpeedBps, totalSpeedBps } from '@/renderer/utils/formatSpeed';
import { useIsTitleTruncated } from '@/renderer/views/downloader/hooks/useIsTitleTruncated';
import {
  EMPTY_DETAIL_ROWS,
  formatEpisodeList,
  buildQueueFailures,
} from '@/renderer/views/downloader/model/downloaderModel';
import { QueueEpisodeDetails } from './QueueEpisodeDetails';
import { QueueItemActions } from './QueueItemActions';
import { QueueStatusBadge, type QueueBadgeKind } from './QueueStatusBadge';

import animeav1Icon from '@assets/provider-icons/animeav1-32.png';
import jkanimeIcon from '@assets/provider-icons/jkanime-32.png';

const PROVIDER_ICONS: Record<string, string> = {
  animeav1: animeav1Icon,
  jkanime: jkanimeIcon,
};

const pctFormat = (value: number) => `${Math.round(value)}%`;

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
  pendingSkipEpKeys?: Set<string>;
  isSwitchPending?: boolean;
  isPriority?: boolean;
}

export const QueueItemRow = memo(
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
    pendingSkipEpKeys,
    isSwitchPending = false,
    isPriority = false,
  }: QueueRowProps) {
    const { titleRef, isTruncated } = useIsTitleTruncated(item.animeTitle ?? '');
    const rawPct = useMemo(() => {
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
    const completedCount = item.completedEps?.length || 0;
    const episodesCount = item.episodes?.length || 0;
    const activeEps = useMemo(
      () =>
        isDownloading && Array.isArray(item.activeEps)
          ? (
              item.activeEps as Array<{
                episode: number;
                progress: number;
                server?: string;
                phase?: 'downloading' | 'assembling';
              }>
            )
              .filter((e) => typeof e?.episode === 'number')
              .slice(0, 3)
          : [],
      [isDownloading, item.activeEps],
    );
    const preparingCount = activeEps.filter((entry) => entry.phase === 'assembling').length;
    const isPreparing = preparingCount > 0 && preparingCount === activeEps.length && !isSwitchPending;
    const pct = preparingCount > 0 ? Math.min(99, rawPct) : rawPct;
    const badgeKind: QueueBadgeKind = isDone
      ? 'done'
      : isFailed
        ? 'failed'
        : isCancelled
          ? 'cancelled'
          : isPaused
            ? 'paused'
            : isPreparing
              ? 'preparing'
              : isDownloading
                ? 'downloading'
                : 'queued';
    const isCardActive = isDownloading || isPaused || item.status === 'pending';
    const speedText = useMemo(
      () =>
        isDownloading && !isSwitchPending
          ? formatSpeedBps(totalSpeedBps(activeEps.filter((entry) => entry.phase !== 'assembling')))
          : '',
      [isDownloading, isSwitchPending, activeEps],
    );
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
    const detailId = useId();
    const errorId = useId();
    const detailToggleRef = useRef<HTMLButtonElement>(null);
    const errorToggleRef = useRef<HTMLButtonElement>(null);
    const isTerminal = isDone || isFailed || isCancelled;
    const failures = useMemo(
      () => buildQueueFailures(item.failedEps, item.failureReasons, isFailed),
      [item.failedEps, item.failureReasons, isFailed],
    );
    const hasErrors = failures.length > 0;
    const errorLabel =
      failures.length > 1
        ? `errores (${failures.length})`
        : failures[0]?.episode != null
          ? `error del episodio ${failures[0].episode}`
          : 'error';
    const [showFullError, setShowFullError] = useState(false);
    const toggleErrorClick = useCallback(() => setShowFullError((v) => !v), []);
    const [showParallel, setShowParallel] = useState(false);
    const toggleParallelClick = useCallback(() => setShowParallel((v) => !v), []);
    const closeError = useCallback(() => {
      setShowFullError(false);
      errorToggleRef.current?.focus({ preventScroll: true });
    }, []);
    const closeParallel = useCallback(() => {
      setShowParallel(false);
      detailToggleRef.current?.focus({ preventScroll: true });
    }, []);
    useEffect(() => {
      setShowFullError(false);
    }, [item.id, hasErrors]);
    // El detalle abierto sobrevive entre descargando<->pausa (mismo item activo),
    // incluido el pending transitorio al reanudar; solo se colapsa al terminar/quitar
    useEffect(() => {
      if (item.status !== 'downloading' && item.status !== 'paused' && item.status !== 'pending')
        setShowParallel(false);
    }, [item.id, item.status]);

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
        className={`downloader-card bg-card border rounded-xl overflow-hidden transition-colors ${
          isDone
            ? 'border-border/50'
            : isFailed
              ? 'border-destructive/20'
              : isCancelled
                ? 'border-border/60'
                : isPaused
                  ? 'border-border/60'
                  : 'border-border/50'
        }`}
      >
        <div
          data-queue-summary
          className={`flex min-w-0 items-start gap-3 px-3 pt-3 sm:gap-4 sm:px-4 sm:pt-4 ${hasErrors ? 'pb-2' : 'pb-3 sm:pb-4'}`}
        >
          {canOpenDetails ? (
            <button
              type="button"
              onClick={handleClickDetails}
              aria-label={`Ver detalles de ${item.animeTitle}`}
              className="group relative aspect-[2/3] w-16 shrink-0 overflow-hidden rounded-lg bg-secondary/30 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-inset sm:w-[72px]"
            >
              <PosterImage
                src={item.poster}
                alt={item.animeTitle}
                fallbackLabel={item.animeTitle}
                priority={!!isPriority}
                className="h-full w-full object-cover transition-transform duration-200 ease-out group-hover:scale-105"
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
            <div className="aspect-[2/3] w-16 shrink-0 overflow-hidden rounded-lg bg-secondary/30 sm:w-[72px]">
              <PosterImage
                src={item.poster}
                alt={item.animeTitle}
                fallbackLabel={item.animeTitle}
                priority={!!isPriority}
                className="h-full w-full object-cover"
              />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
              <div className="min-w-0 flex-[1_1_220px]">
                <h3 className="min-w-0 overflow-hidden text-[15px] font-semibold leading-snug text-foreground">
                  {canOpenDetails ? (
                    <button
                      type="button"
                      onClick={handleClickDetails}
                      aria-label={`Ver detalles de ${item.animeTitle}`}
                      className="block w-fit min-w-0 max-w-full text-left transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                    >
                      <span ref={titleRef} data-truncated={isTruncated || undefined} className="title-fade">
                        {item.animeTitle}
                      </span>
                    </button>
                  ) : (
                    <span ref={titleRef} data-truncated={isTruncated || undefined} className="title-fade">
                      {item.animeTitle}
                    </span>
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
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <AppTooltip content={episodesLabel !== '—' ? `Episodios: ${episodesLabel}` : ''}>
                    <span
                      className="inline-flex items-center gap-2"
                      aria-label={
                        episodesLabel !== '—' ? `${item.episodes?.length || 0} episodios: ${episodesLabel}` : undefined
                      }
                    >
                      <span className="font-medium tabular-nums">
                        {item.episodes?.length || 0} {(item.episodes?.length || 0) === 1 ? 'ep' : 'eps'}
                      </span>
                      {episodesLabel !== '—' && (
                        <>
                          <span aria-hidden="true" className="h-3 w-px shrink-0 bg-border-strong/70" />
                          <span className="max-w-[140px] truncate tabular-nums text-muted-foreground">
                            {episodesLabel}
                          </span>
                        </>
                      )}
                    </span>
                  </AppTooltip>
                  <span aria-hidden="true" className="h-3 w-px shrink-0 bg-border-strong/70" />
                  <AppTooltip content={`Proveedor de origen: ${sourceLabel}`}>
                    <span className="inline-flex shrink-0 items-center gap-1.5">
                      {item.providerId && PROVIDER_ICONS[item.providerId] && (
                        <img
                          src={PROVIDER_ICONS[item.providerId]}
                          alt=""
                          aria-hidden="true"
                          className="h-3.5 w-3.5 shrink-0 rounded"
                          draggable={false}
                        />
                      )}
                      {sourceLabel}
                      {item.lang === 'DUB' && (
                        <>
                          <span aria-hidden="true" className="h-3 w-px shrink-0 bg-border-strong/70" />
                          <span>DUB</span>
                        </>
                      )}
                    </span>
                  </AppTooltip>
                  {item.dirLabel && (
                    <>
                      <span aria-hidden="true" className="h-3 w-px shrink-0 bg-border-strong/70" />
                      <AppTooltip content={`Destino: ${item.dirFullPath}`}>
                        <span className="inline-flex max-w-[160px] items-center gap-1.5">
                          <Folder className="h-3 w-3 shrink-0" />
                          <span className="truncate">{item.dirLabel}</span>
                        </span>
                      </AppTooltip>
                    </>
                  )}
                </div>
              </div>
              <QueueItemActions
                isDownloading={isDownloading}
                isPaused={isPaused}
                isTerminal={isTerminal}
                canRetry={isFailed && hasFailedEpisodes}
                isRetryPending={isRetryPending}
                isSwitchPending={isSwitchPending}
                onPause={handlePauseClick}
                onResume={handleResumeClick}
                onSkip={handleSkipClick}
                onRetry={handleRetryClick}
                onOpenFolder={handleOpenFolderClick}
                onRemove={handleRemoveClick}
                onCancel={handleCancelClick}
              />
            </div>

            <div className="mb-1.5 flex items-center gap-3">
              <ProgressBar
                className="min-w-0 flex-1"
                value={pct}
                indeterminate={isDownloading && (isSwitchPending || pct === 0)}
                variant={isDone ? 'success' : isFailed ? 'danger' : isDownloading ? 'primary' : 'neutral'}
                label={`${item.animeTitle} — ${hasDetail ? 'progreso total' : 'progreso'} ${pct}%`}
                aria-valuetext={
                  isSwitchPending
                    ? 'Cambiando servidor'
                    : `${pct}% · ${completedCount}/${episodesCount} episodios${isPreparing ? ', preparando archivo' : ''}${speedText ? ` · ${speedText}` : ''}`
                }
              />
              <span className="min-w-[4ch] shrink-0 text-right text-[13px] font-semibold tabular-nums text-foreground">
                {pctFormat(pct)}
              </span>
            </div>
            <div
              data-queue-status
              className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-2 text-xs tabular-nums text-muted-foreground"
            >
              <QueueStatusBadge kind={badgeKind} />
              <span aria-hidden="true" className="h-3 w-px shrink-0 bg-border-strong/70" />
              <span>
                {completedCount}/{episodesCount} {episodesCount === 1 ? 'ep' : 'eps'}
              </span>
              {isDownloading && !isPreparing && (
                <>
                  <span aria-hidden="true" className="h-3 w-px shrink-0 bg-border-strong/70" />
                  <span className="min-w-[9ch]">{speedText || '—'}</span>
                </>
              )}
              {hasFailedEpisodes && (
                <span className="text-destructive-fg">
                  ({item.failedEps.length} {item.failedEps.length === 1 ? 'fallido' : 'fallidos'})
                </span>
              )}
              {isCardActive && (item.pausedEps?.length || 0) > 0 && (
                <span>
                  ({item.pausedEps.length} {item.pausedEps.length === 1 ? 'pausado' : 'pausados'})
                </span>
              )}
              {isCardActive && (item.cancelledEps?.length || 0) > 0 && (
                <span>
                  ({item.cancelledEps.length} {item.cancelledEps.length === 1 ? 'cancelado' : 'cancelados'})
                </span>
              )}
              {isDownloading && (
                <span
                  className="inline-flex min-w-0 max-w-full flex-[1_1_160px] items-center gap-1.5"
                  aria-live={isSwitchPending ? 'polite' : undefined}
                >
                  <span aria-hidden="true" className="mr-0.5 h-3 w-px shrink-0 bg-border-strong/70" />
                  {isSwitchPending ? (
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden="true" />
                  ) : (
                    <Server className="h-3 w-3 shrink-0" aria-hidden="true" />
                  )}
                  <span className="truncate">
                    {isSwitchPending
                      ? 'Cambiando servidor…'
                      : isPreparing
                        ? activeEps[0]?.server || item.currentServer || 'Preparación local'
                        : pct === 0
                          ? 'Conectando…'
                          : item.currentServer || 'Preparando servidor…'}
                  </span>
                  {preparingCount > 0 && !isPreparing && !isSwitchPending && (
                    <>
                      <span aria-hidden="true" className="h-3 w-px shrink-0 bg-border-strong/70" />
                      <span className="truncate">
                        {preparingCount} {preparingCount === 1 ? 'archivo en preparación' : 'archivos en preparación'}
                      </span>
                    </>
                  )}
                </span>
              )}
              {hasDetail && (
                <button
                  type="button"
                  ref={detailToggleRef}
                  data-keep-focus
                  onClick={toggleParallelClick}
                  aria-expanded={showParallel}
                  aria-controls={detailId}
                  aria-label={showParallel ? 'Ocultar progreso por episodio' : 'Ver progreso por episodio'}
                  className="relative ml-auto inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2 font-medium transition-colors after:absolute after:inset-x-0 after:-inset-y-2 hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  Episodios ({detailRows.length})
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform duration-200 ${showParallel ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>
              )}
            </div>
            {hasErrors && (
              <div className="flex min-h-11 items-center gap-2 text-xs text-muted-foreground">
                <button
                  type="button"
                  ref={errorToggleRef}
                  data-keep-focus
                  onClick={toggleErrorClick}
                  aria-expanded={showFullError}
                  aria-controls={errorId}
                  className="-ml-2 inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-lg px-2 text-left font-medium text-destructive-fg transition-colors hover:bg-destructive/10"
                >
                  <ChevronDown
                    className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${showFullError ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                  <span>
                    {showFullError ? 'Ocultar' : 'Ver'} {errorLabel}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
        <QueueEpisodeDetails
          id={detailId}
          open={isCardActive && hasDetail && showParallel}
          rows={hasDetail ? detailRows : EMPTY_DETAIL_ROWS}
          itemId={item.id}
          animeTitle={item.animeTitle}
          onClose={closeParallel}
          pendingEpisodeKeys={pendingEpisodeKeys}
          pendingSkipEpKeys={pendingSkipEpKeys}
          onPauseEpisode={onPauseEpisode}
          onResumeEpisode={onResumeEpisode}
          onSkipEpisode={onSkipEpisode}
          onCancelEpisode={onCancelEpisode}
        />
        {hasErrors && (
          <div
            id={errorId}
            data-queue-errors
            className="downloader-card-slot-error"
            data-state={showFullError ? 'open' : 'closed'}
            aria-hidden={!showFullError}
            inert={!showFullError ? true : undefined}
          >
            <div className="downloader-card-slot-error-content">
              <section className="downloader-error-panel" aria-labelledby={`${errorId}-heading`}>
                <div className="downloader-panel-heading">
                  <h4
                    id={`${errorId}-heading`}
                    className="flex items-center gap-2 font-sans text-[13px] font-semibold text-foreground"
                  >
                    <XCircle className="h-3.5 w-3.5 text-destructive-fg" aria-hidden="true" />
                    <span>Errores</span>
                    <span className="font-normal tabular-nums text-muted-foreground">{failures.length}</span>
                  </h4>
                  <button
                    type="button"
                    data-keep-focus
                    onClick={closeError}
                    aria-label="Ocultar errores"
                    className="downloader-panel-close"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <div
                  className="downloader-error-scroll"
                  tabIndex={0}
                  data-keep-focus
                  role="region"
                  aria-label={`Motivos de error de ${item.animeTitle}`}
                >
                  <dl className="select-text">
                    {failures.map(({ episode, reason }) => (
                      <div key={episode ?? 'general'} className="downloader-error-row">
                        <dt className="font-semibold tabular-nums text-destructive-fg">
                          {episode != null ? `EP ${episode}` : 'Descarga'}
                        </dt>
                        <dd className="downloader-error-reason text-muted-foreground">{reason}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    );
  },
  (prev, next) => {
    if (
      prev.item !== next.item ||
      prev.activeProvider !== next.activeProvider ||
      prev.isRetryPending !== next.isRetryPending ||
      (prev.isSwitchPending ?? false) !== (next.isSwitchPending ?? false) ||
      prev.isPriority !== next.isPriority
    ) {
      return false;
    }
    // El Set cambia de identidad por cada click: comparar solo las claves
    // propias del item para no re-renderizar toda la cola.
    const eps: number[] = Array.isArray(next.item?.episodes) ? next.item.episodes : [];
    const id: string = next.item?.id;
    if (!eps.length || !id) {
      return prev.pendingEpisodeKeys === next.pendingEpisodeKeys && prev.pendingSkipEpKeys === next.pendingSkipEpKeys;
    }
    for (const ep of eps) {
      const key = `${id}:${ep}`;
      if (prev.pendingEpisodeKeys?.has(key) !== next.pendingEpisodeKeys?.has(key)) return false;
      if (prev.pendingSkipEpKeys?.has(key) !== next.pendingSkipEpKeys?.has(key)) return false;
    }
    return true;
  },
);
