import { SkipForward, Loader2, XCircle, X, CheckCircle2, Clock, Play, Pause, PauseCircle, Ban } from 'lucide-react';
import { memo } from 'react';
import { ProgressBar } from '@/renderer/components/ui/ProgressBar';
import { MOTION_DURATION, useEmphasis } from '@/renderer/utils/motion';
import { type DetailRow } from '@/renderer/utils/downloaderRows';

interface EpisodeDetailRowProps {
  row: DetailRow;
  itemId: string;
  animeTitle: string;
  isEpPending: boolean;
  isEpSwitching?: boolean;
  onPauseEpisode: (id: string, episode: number) => void;
  onResumeEpisode: (id: string, episode: number) => void;
  onSkipEpisode: (id: string, episode: number) => void;
  onCancelEpisode: (id: string, episode: number) => void;
}

// Fila memoizada por episodio: solo re-renderiza si cambian sus propios
// campos o su pending, no cuando otro EP de la lista cambia de estado.
export const EpisodeDetailRow = memo(
  function EpisodeDetailRow({
    row: e,
    itemId,
    animeTitle,
    isEpPending,
    isEpSwitching = false,
    onPauseEpisode,
    onResumeEpisode,
    onSkipEpisode,
    onCancelEpisode,
  }: EpisodeDetailRowProps) {
    const rawPct = Math.round((e.progress ?? 0) * 100);
    const isEpPaused = e.state === 'paused';
    const isEpCancelled = e.state === 'cancelled';
    const isEpQueued = e.state === 'queued';
    const isEpCompleted = e.state === 'completed';
    const isEpFailed = e.state === 'failed';
    const isEpDone = isEpCompleted || isEpFailed;
    const isAssembling = e.state === 'active' && e.phase === 'assembling';
    const epPct = isAssembling ? Math.min(99, rawPct) : rawPct;
    const showActions = !isEpCancelled && !isEpDone;
    const showSkip = e.state === 'active' && !!e.server;
    const isSwitching = isEpSwitching && e.state === 'active';
    const showServer = !!e.server && !isSwitching && (isEpPaused || isEpFailed || isAssembling);
    const stateLabel = isSwitching
      ? 'Cambiando servidor…'
      : isAssembling
        ? 'Preparando archivo'
        : isEpPaused
          ? 'Pausado'
          : isEpQueued
            ? 'En cola'
            : isEpCompleted
              ? 'Completado'
              : isEpFailed
                ? 'Fallido'
                : isEpCancelled
                  ? 'Cancelado'
                  : e.server || 'Conectando…';
    const isEpEmphatic = isEpCompleted || isEpFailed;
    const stateFadeRef = useEmphasis<HTMLSpanElement>(e.state, { mode: 'fade', duration: MOTION_DURATION.base });
    const statePulseRef = useEmphasis<HTMLSpanElement>(isEpEmphatic ? e.state : null, { mode: 'pulse' });
    return (
      <div className="episode-list-item flex h-16 flex-col justify-center gap-1 py-1 pr-2" data-ep-state={e.state}>
        <div className="flex min-h-11 items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
          <span className="w-[7ch] shrink-0 font-semibold text-foreground">EP {e.episode}</span>
          <span
            ref={stateFadeRef}
            className={`inline-flex min-w-0 flex-1 items-center gap-1.5 ${isEpCompleted ? 'text-success' : isEpFailed ? 'text-destructive-fg' : 'text-muted-foreground'}`}
            aria-live={isSwitching ? 'polite' : undefined}
          >
            {(isSwitching || isEpPaused || isEpQueued || isEpCompleted || isEpFailed || isEpCancelled) && (
              <span ref={statePulseRef} className="inline-flex shrink-0" aria-hidden="true">
                {isSwitching && <Loader2 className="h-3 w-3 animate-spin" />}
                {isEpPaused && <PauseCircle className="h-3 w-3" />}
                {isEpQueued && <Clock className="h-3 w-3" />}
                {isEpCompleted && <CheckCircle2 className="h-3 w-3" />}
                {isEpFailed && <XCircle className="h-3 w-3" />}
                {isEpCancelled && <Ban className="h-3 w-3" />}
              </span>
            )}
            <span className="truncate">{stateLabel}</span>
            {showServer && (
              <>
                <span aria-hidden="true" className="h-3 w-px shrink-0 bg-border-strong/70" />
                <span className="truncate text-muted-foreground">{e.server}</span>
              </>
            )}
          </span>
          <span className="ml-auto w-[5ch] shrink-0 text-right">{isEpCancelled ? '—' : `${epPct}%`}</span>
          {showActions && (
            <span className="flex shrink-0 items-center justify-end">
              {isEpPaused ? (
                <button
                  type="button"
                  onClick={() => onResumeEpisode(itemId, e.episode)}
                  disabled={isEpPending}
                  aria-label={`Reanudar EP ${e.episode}`}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  <Play className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onPauseEpisode(itemId, e.episode)}
                  disabled={isEpPending}
                  aria-label={`Pausar EP ${e.episode}`}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  <Pause className="h-4 w-4" />
                </button>
              )}
              {showSkip && (
                <button
                  type="button"
                  onClick={() => onSkipEpisode(itemId, e.episode)}
                  disabled={isEpPending || isSwitching}
                  aria-label={isSwitching ? `Cambiando servidor EP ${e.episode}` : `Saltar servidor EP ${e.episode}`}
                  aria-busy={isSwitching || undefined}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  {isSwitching ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <SkipForward className="h-4 w-4" />
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => onCancelEpisode(itemId, e.episode)}
                disabled={isEpPending}
                aria-label={`Cancelar EP ${e.episode}`}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive-fg disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/60"
              >
                <X className="h-4 w-4" />
              </button>
            </span>
          )}
        </div>
        {!isEpCancelled && (
          <ProgressBar
            value={epPct}
            indeterminate={isSwitching}
            variant={isEpCompleted ? 'success' : isEpFailed ? 'danger' : undefined}
            label={`${animeTitle} — EP ${e.episode} ${epPct}%${isSwitching ? ' (cambiando servidor)' : ''}${isAssembling && !isSwitching ? ' (preparando archivo)' : ''}${isEpPaused ? ' (pausado)' : ''}${isEpQueued ? ' (en cola)' : ''}${isEpCompleted ? ' (completado)' : ''}${isEpFailed ? ' (fallido)' : ''}`}
            showValue={false}
            aria-valuetext={`EP ${e.episode} ${epPct}%, ${stateLabel}${showServer ? `, ${e.server}` : ''}`}
          />
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.row.episode === next.row.episode &&
    prev.row.progress === next.row.progress &&
    prev.row.server === next.row.server &&
    prev.row.phase === next.row.phase &&
    prev.row.state === next.row.state &&
    prev.itemId === next.itemId &&
    prev.animeTitle === next.animeTitle &&
    prev.isEpPending === next.isEpPending &&
    (prev.isEpSwitching ?? false) === (next.isEpSwitching ?? false) &&
    prev.onPauseEpisode === next.onPauseEpisode &&
    prev.onResumeEpisode === next.onResumeEpisode &&
    prev.onSkipEpisode === next.onSkipEpisode &&
    prev.onCancelEpisode === next.onCancelEpisode,
);
