import { memo } from 'react';
import { Layers, X, Ban, Clock } from 'lucide-react';
import { AppTooltip } from '../../../components/ui/AppTooltip';

export const HistoryEpisodesBadge = memo(function HistoryEpisodesBadge({
  requestedCount,
  failCount,
  cancelledCount,
  unstartedCount,
}: {
  requestedCount: number;
  failCount: number;
  cancelledCount: number;
  unstartedCount: number;
}) {
  const parts: string[] = [requestedCount === 1 ? '1 episodio solicitado' : `${requestedCount} episodios solicitados`];
  if (failCount > 0) parts.push(failCount === 1 ? '1 fallido' : `${failCount} fallidos`);
  if (cancelledCount > 0) parts.push(cancelledCount === 1 ? '1 cancelado' : `${cancelledCount} cancelados`);
  if (unstartedCount > 0) parts.push(`${unstartedCount} sin empezar`);
  const tooltip = parts.join(' · ');
  const label = `${requestedCount} ${requestedCount === 1 ? 'ep' : 'eps'}`;
  const hasOutcome = failCount > 0 || cancelledCount > 0 || unstartedCount > 0;

  return (
    <AppTooltip content={tooltip}>
      <span
        className="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-md bg-secondary px-2 py-1 text-xs font-semibold tabular-nums text-foreground"
        aria-label={tooltip}
      >
        <Layers className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        {label}
        {hasOutcome && (
          <span className="inline-flex items-center gap-1.5 font-medium" aria-hidden="true">
            <span className="text-muted-foreground/50" aria-hidden="true">
              ·
            </span>
            {failCount > 0 && (
              <span className="inline-flex items-center gap-0.5 text-destructive-fg">
                <X className="h-3 w-3" aria-hidden="true" />
                {failCount}
              </span>
            )}
            {cancelledCount > 0 && (
              <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                <Ban className="h-3 w-3" aria-hidden="true" />
                {cancelledCount}
              </span>
            )}
            {unstartedCount > 0 && (
              <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                <Clock className="h-3 w-3" aria-hidden="true" />
                {unstartedCount}
              </span>
            )}
          </span>
        )}
      </span>
    </AppTooltip>
  );
});
