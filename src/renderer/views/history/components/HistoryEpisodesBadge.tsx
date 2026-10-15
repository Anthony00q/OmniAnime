import { Fragment, memo } from 'react';

export const HistoryEpisodesBadge = memo(function HistoryEpisodesBadge({
  okCount,
  failCount,
  cancelledCount,
  unstartedCount,
}: {
  okCount: number;
  failCount: number;
  cancelledCount: number;
  unstartedCount: number;
}) {
  const parts: string[] = [];
  if (okCount > 0) parts.push(okCount === 1 ? '1 completado' : `${okCount} completados`);
  if (failCount > 0) parts.push(failCount === 1 ? '1 fallido' : `${failCount} fallidos`);
  if (cancelledCount > 0) parts.push(cancelledCount === 1 ? '1 cancelado' : `${cancelledCount} cancelados`);
  if (unstartedCount > 0) parts.push(`${unstartedCount} sin iniciar`);

  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums text-muted-foreground">
      {parts.length === 0
        ? 'Sin episodios registrados'
        : parts.map((part, index) => (
            <Fragment key={part}>
              {index > 0 && (
                <>
                  {' '}
                  <span aria-hidden="true" className="h-3 w-px shrink-0 bg-border-strong/70" />{' '}
                </>
              )}
              <span className="whitespace-nowrap">{part}</span>
            </Fragment>
          ))}
    </span>
  );
});
