import clsx from 'clsx';
import { WEEKDAY_LABELS } from '@/renderer/utils/schedule';

interface WeekRailProps {
  // Fechas de la semana ISO: índice 0 = lunes.
  dates: Date[];
  // Emisiones publicadas por cada día.
  counts: number[];
  selectedDay: number;
  todayDay: number;
  onSelect: (day: number) => void;
  className?: string;
}

// Tira de la semana: un segmento por día con fecha y emisiones; "hoy" se dice con el texto HOY.
export function WeekRail({ dates, counts, selectedDay, todayDay, onSelect, className }: WeekRailProps) {
  return (
    <div
      className={clsx('flex items-center gap-1 rounded-full border border-border/70 p-1', className)}
      role="group"
      aria-label="Días de la semana"
    >
      {WEEKDAY_LABELS.map((label, idx) => {
        const day = idx + 1;
        const selected = day === selectedDay;
        const isToday = day === todayDay;
        const count = counts[idx] ?? 0;
        return (
          <button
            key={label}
            type="button"
            onClick={() => onSelect(day)}
            aria-pressed={selected}
            aria-label={`${label} ${dates[idx].getDate()}, ${count} ${count === 1 ? 'emisión' : 'emisiones'}${isToday ? ', hoy' : ''}`}
            className={clsx(
              'flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full border px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
              selected
                ? 'border-primary/30 bg-primary/15 text-primary'
                : 'border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground',
            )}
          >
            <span className="text-[11px] font-semibold uppercase tracking-[0.05em]">
              {isToday ? 'HOY' : label.slice(0, 3)}
            </span>
            <span className="text-[13px] font-semibold tabular-nums">{dates[idx].getDate()}</span>
            {count > 0 && (
              <>
                <span aria-hidden="true" className="text-[13px] text-border-strong">
                  ·
                </span>
                <span
                  className={clsx(
                    'text-[13px] font-medium tabular-nums',
                    selected ? 'text-primary/70' : 'text-text-tertiary',
                  )}
                >
                  {count}
                </span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
