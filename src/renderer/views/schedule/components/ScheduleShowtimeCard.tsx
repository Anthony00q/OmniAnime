import { memo } from 'react';
import clsx from 'clsx';
import { PosterImage } from '@/renderer/components/anime/PosterImage';
import {
  scheduleEntryState,
  scheduleMetaLine,
  scheduleRowLabel,
  type ScheduleLabelTone,
} from '@/renderer/utils/schedule';
import type { ScheduleEntry } from '@/types/anime';

interface ScheduleShowtimeCardProps {
  entry: ScheduleEntry;
  nowMs: number;
  onSelect: (slug: string) => void;
  isNext?: boolean;
}

// Estado en su tinta sobre la banda: nunca gris sobre imagen.
const CARD_STATE_TONE: Record<ScheduleLabelTone, string> = {
  success: 'text-success',
  danger: 'text-destructive-fg',
  neutral: 'text-muted-foreground',
};

// Tarjeta de función: banda sólida bajo el póster con la hora como sello
// (superficie propia, nunca el mismo texto que el título) y el estado en su tinta.
export const ScheduleShowtimeCard = memo(function ScheduleShowtimeCard({
  entry,
  nowMs,
  onSelect,
  isNext = false,
}: ScheduleShowtimeCardProps) {
  const label = scheduleRowLabel(entry, scheduleEntryState(entry, nowMs));
  const meta = scheduleMetaLine(entry);
  const stateText = label?.state ?? (isNext ? 'Sigue' : null);

  return (
    <button
      type="button"
      onClick={() => onSelect(entry.slug)}
      aria-label={`Ver ficha de ${entry.title}`}
      className={clsx(
        'schedule-card group relative isolate flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-xl border bg-card text-left shadow-none transition-[border-color,box-shadow] duration-200 ease-out hover:shadow-[0_8px_24px_rgba(0,0,0,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        isNext ? 'border-primary/30 hover:border-primary/50' : 'border-border/50 hover:border-primary/30',
      )}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden">
        <PosterImage src={entry.poster} alt={entry.title} className="absolute inset-0 h-full w-full object-cover" />
      </div>
      <div className="relative z-10 flex w-full grow flex-col gap-1 border-t border-border/50 px-3 py-2.5">
        <div className="flex min-h-[28px] items-center justify-between gap-2">
          {label?.time ? (
            <span className="inline-flex h-7 shrink-0 items-center rounded-full border border-border-strong/60 bg-popover px-2.5 text-[15px] font-semibold tabular-nums text-foreground">
              {label.time}
            </span>
          ) : (
            <span aria-hidden="true" />
          )}
          {stateText ? (
            <span
              className={clsx(
                'ml-auto min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.09em]',
                isNext && !label?.state ? 'text-primary' : CARD_STATE_TONE[label?.tone ?? 'neutral'],
              )}
            >
              {stateText}
            </span>
          ) : (
            <span aria-hidden="true" />
          )}
        </div>
        <h3 className="sala-poster-title line-clamp-2 min-h-[2.6em] text-[14px] font-semibold leading-snug tracking-tight text-foreground">
          {entry.title}
        </h3>
        <div className="line-clamp-1 min-h-[1.2em] text-[13px] tabular-nums text-muted-foreground">{meta}</div>
      </div>
    </button>
  );
});
