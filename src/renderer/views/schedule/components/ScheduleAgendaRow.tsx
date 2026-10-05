import { memo } from 'react';
import clsx from 'clsx';
import { PosterImage } from '@/renderer/components/anime/PosterImage';
import {
  scheduleEntryState,
  scheduleMetaLine,
  scheduleRowLabel,
  type ScheduleLabelTone,
  type ScheduleRowLabel,
} from '@/renderer/utils/schedule';
import type { ScheduleEntry } from '@/types/anime';

interface ScheduleAgendaRowProps {
  entry: ScheduleEntry;
  nowMs: number;
  onSelect: (slug: string) => void;
  isNext?: boolean;
}

const LABEL_TONE: Record<ScheduleLabelTone, string> = {
  success: 'border-success/30 bg-success/10 text-success',
  danger: 'border-destructive-fg/30 bg-destructive/40 text-destructive-fg',
  neutral: 'border-border/70 bg-secondary/60 text-muted-foreground',
};

// Etiqueta con la forma de la fuente: estado pegado a la hora con hairline, nunca
// con punto. "Sigue" ocupa el hueco del estado.
function ScheduleLabelPill({ label, isNext }: { label: ScheduleRowLabel; isNext: boolean }) {
  const state = isNext ? 'Sigue' : label.state;
  return (
    <span
      className={clsx(
        'inline-flex h-7 select-none items-center whitespace-nowrap rounded-full border px-3 text-[13px] font-medium tabular-nums',
        isNext ? 'border-primary/30 bg-primary/15 text-primary' : LABEL_TONE[label.tone],
      )}
    >
      <span className="sr-only">{isNext ? `Sigue · ${label.text}` : label.text}</span>
      <span aria-hidden="true" className="flex flex-nowrap items-center gap-1.5">
        {state ? (
          <>
            <span>{state}</span>
            {label.time ? <span className="h-3 w-px bg-border-strong/70" /> : null}
          </>
        ) : null}
        {label.time ? <span className="text-foreground">{label.time}</span> : null}
      </span>
    </span>
  );
}

export const ScheduleAgendaRow = memo(function ScheduleAgendaRow({
  entry,
  nowMs,
  onSelect,
  isNext = false,
}: ScheduleAgendaRowProps) {
  const label = scheduleRowLabel(entry, scheduleEntryState(entry, nowMs));
  const meta = scheduleMetaLine(entry);

  return (
    <button
      type="button"
      onClick={() => onSelect(entry.slug)}
      aria-label={`Ver ficha de ${entry.title}`}
      className={clsx(
        'group flex w-full items-center gap-4 px-2 py-4 text-left transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60',
        isNext && 'bg-primary/5 hover:bg-primary/10',
      )}
    >
      <span className="h-[78px] w-[52px] shrink-0 overflow-hidden rounded bg-secondary">
        <PosterImage src={entry.poster} alt={entry.title} className="h-full w-full rounded object-cover" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-1 block text-[15px] font-semibold leading-tight text-foreground transition-colors group-hover:text-primary">
          {entry.title}
        </span>
        {meta ? <span className="mt-1 block text-[13px] tabular-nums text-muted-foreground">{meta}</span> : null}
      </span>
      <span className="flex w-40 shrink-0 items-center justify-end">
        {label ? <ScheduleLabelPill label={label} isNext={isNext} /> : null}
      </span>
    </button>
  );
});
