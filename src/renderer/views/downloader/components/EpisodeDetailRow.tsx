import { SkipForward, Loader2, XCircle, X, CheckCircle2, Clock, Play, Pause, PauseCircle, Ban } from 'lucide-react';
import { memo } from 'react';
import { AppTooltip } from '@/renderer/components/ui/AppTooltip';
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
    const epPct = Math.round((e.progress ?? 0) * 100);
    const isEpPaused = e.state === 'paused';
    const isEpCancelled = e.state === 'cancelled';
    const isEpQueued = e.state === 'queued';
    const isEpCompleted = e.state === 'completed';
    const isEpFailed = e.state === 'failed';
    const isEpDone = isEpCompleted || isEpFailed;
    const isAssembling = e.state === 'active' && e.phase === 'assembling';
    const showActions = !isEpCancelled && !isEpDone;
    const showSkip = e.state === 'active' && !!e.server;
    const isSwitching = isEpSwitching && e.state === 'active';
    const isEpEmphatic = isEpCompleted || isEpFailed;
    const stateFadeRef = useEmphasis<HTMLSpanElement>(e.state, { mode: 'fade', duration: MOTION_DURATION.base });
    const statePulseRef = useEmphasis<HTMLSpanElement>(isEpEmphatic ? e.state : null, { mode: 'pulse' });
    return (
      <div className="episode-list-item flex flex-col justify-center gap-1 py-1" data-ep-state={e.state}>
        <div className="flex items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">EP {e.episode}</span>
          {isSwitching ? (
            <span className="inline-flex min-w-0 flex-1 items-center gap-1" aria-live="polite">
              <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden="true" />
              <span className="truncate">Cambiando servidor…</span>
            </span>
          ) : (
            e.server &&
            !isEpPaused &&
            !isEpCancelled &&
            !isEpDone &&
            !isEpQueued && (
              <span ref={stateFadeRef} className="min-w-0 flex-1 truncate">
                {isAssembling ? `Ensamblando${e.server ? ` · ${e.server}` : ''}` : e.server}
              </span>
            )
          )}
          {isEpPaused && (
            <span ref={stateFadeRef} className="inline-flex min-w-0 flex-1 items-center gap-1 text-muted-foreground">
              <span ref={statePulseRef} className="inline-flex shrink-0">
                <PauseCircle className="h-3 w-3 shrink-0" />
              </span>
              <span className="truncate">Pausado{e.server ? ` · ${e.server}` : ''}</span>
            </span>
          )}
          {isEpQueued && (
            <span ref={stateFadeRef} className="inline-flex min-w-0 flex-1 items-center gap-1 text-muted-foreground">
              <span ref={statePulseRef} className="inline-flex shrink-0">
                <Clock className="h-3 w-3 shrink-0" />
              </span>
              <span className="truncate">En cola</span>
            </span>
          )}
          {isEpCompleted && (
            <span ref={stateFadeRef} className="inline-flex min-w-0 flex-1 items-center gap-1 text-success">
              <span ref={statePulseRef} className="inline-flex shrink-0">
                <CheckCircle2 className="h-3 w-3 shrink-0" />
              </span>
              <span className="truncate">Completado</span>
            </span>
          )}
          {isEpFailed && (
            <span ref={stateFadeRef} className="inline-flex min-w-0 flex-1 items-center gap-1 text-destructive-fg">
              <span ref={statePulseRef} className="inline-flex shrink-0">
                <XCircle className="h-3 w-3 shrink-0" />
              </span>
              <span className="truncate">Fallido{e.server ? ` · ${e.server}` : ''}</span>
            </span>
          )}
          {isEpCancelled && (
            <span ref={stateFadeRef} className="inline-flex min-w-0 flex-1 items-center gap-1 text-muted-foreground">
              <span ref={statePulseRef} className="inline-flex shrink-0">
                <Ban className="h-3 w-3 shrink-0" />
              </span>
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
                <AppTooltip
                  content={isSwitching ? `Cambiando servidor EP ${e.episode}…` : `Saltar servidor EP ${e.episode}`}
                >
                  <button
                    type="button"
                    onClick={() => onSkipEpisode(itemId, e.episode)}
                    disabled={isEpPending || isSwitching}
                    aria-label={isSwitching ? `Cambiando servidor EP ${e.episode}` : `Saltar servidor EP ${e.episode}`}
                    aria-busy={isSwitching || undefined}
                    className="relative flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  >
                    {isSwitching ? (
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    ) : (
                      <SkipForward className="h-3 w-3" />
                    )}
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
            indeterminate={isSwitching}
            variant={isEpCompleted ? 'success' : isEpFailed ? 'danger' : undefined}
            label={`${animeTitle} — EP ${e.episode} ${epPct}%${isSwitching ? ' (cambiando servidor)' : ''}${isAssembling && !isSwitching ? ' (ensamblando)' : ''}${isEpPaused ? ' (pausado)' : ''}${isEpQueued ? ' (en cola)' : ''}${isEpCompleted ? ' (completado)' : ''}${isEpFailed ? ' (fallido)' : ''}`}
            showValue={false}
            aria-valuetext={
              isSwitching
                ? `EP ${e.episode} cambiando servidor`
                : `EP ${e.episode} ${epPct}%${e.server ? ` desde ${e.server}` : ''}${isAssembling ? ', ensamblando' : ''}${isEpPaused ? ', pausado' : ''}${isEpQueued ? ', en cola' : ''}${isEpCompleted ? ', completado' : ''}${isEpFailed ? ', fallido' : ''}`
            }
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
