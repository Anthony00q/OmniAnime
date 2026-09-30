import { CalendarDays, LayoutGrid, RefreshCcw, Rows3 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAtomValue, useSetAtom } from 'jotai';
import { activeProviderAtom, navigateToCatalogAtom, openAnimeAtom } from '../store/atoms';
import { prefetchAnimeDetails, useConnectivityStatus, useSchedule } from '../hooks/useQueries';
import { shouldShowOfflineEmpty } from '../utils/offlineEmpty';
import {
  WEEKDAY_LABELS,
  scheduleEntryState,
  scheduleMetaLine,
  scheduleRowLabel,
  sortDayEntries,
  todayIsoWeekday,
  type ScheduleLabelTone,
  type ScheduleRowLabel,
} from '../utils/schedule';
import type { ScheduleEntry } from '../../types/anime';
import { getScheduleViewMode, setScheduleViewMode, type ScheduleViewMode } from '../utils/scheduleView';
import { PageHeader } from '../components/ui/PageHeader';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { AppTooltip } from '../components/ui/AppTooltip';
import { PosterGrid } from '../components/anime/PosterGrid';
import { PosterImage } from '../components/anime/PosterImage';
import { PosterGridSkeleton, ScheduleSkeleton } from '../components/anime/PosterGridSkeleton';

const LABEL_TONE: Record<ScheduleLabelTone, string> = {
  success: 'border-success/30 bg-success/10 text-success',
  danger: 'border-destructive-fg/30 bg-destructive/40 text-destructive-fg',
  neutral: 'border-border/70 bg-secondary/60 text-muted-foreground',
};

// Sobre póster la etiqueta lleva superficie opaca propia (bg-popover) y el
// estado va en su tinta con la hora en foreground: nunca gris sobre imagen.
const CARD_LABEL_TONE: Record<ScheduleLabelTone, string> = {
  success: 'text-success',
  danger: 'text-destructive-fg',
  neutral: 'text-foreground',
};

interface ScheduleRowProps {
  entry: ScheduleEntry;
  nowMs: number;
  onSelect: (slug: string) => void;
}

function ScheduleLabelPill({ label, variant }: { label: ScheduleRowLabel; variant: 'list' | 'card' }) {
  const isCard = variant === 'card';
  return (
    <span
      className={
        isCard
          ? 'absolute right-3 top-3 z-20 inline-flex h-6 select-none items-center whitespace-nowrap rounded-full border border-border-strong/60 bg-popover px-2.5 text-[11px] font-semibold tabular-nums'
          : `inline-flex h-7 select-none items-center whitespace-nowrap rounded-full border px-3 text-[13px] font-medium tabular-nums ${LABEL_TONE[label.tone]}`
      }
    >
      <span className="sr-only">{label.text}</span>
      <span aria-hidden="true" className="flex flex-nowrap items-center gap-1.5">
        {label.state ? (
          <>
            <span className={isCard ? CARD_LABEL_TONE[label.tone] : undefined}>{label.state}</span>
            {label.time ? <span className={`h-3 w-px ${isCard ? 'bg-border-strong' : 'bg-border-strong/70'}`} /> : null}
          </>
        ) : null}
        {label.time ? <span className="text-foreground">{label.time}</span> : null}
      </span>
    </span>
  );
}

function ScheduleRow({ entry, nowMs, onSelect }: ScheduleRowProps) {
  const label = scheduleRowLabel(entry, scheduleEntryState(entry, nowMs));
  const meta = scheduleMetaLine(entry);

  return (
    <button
      type="button"
      onClick={() => onSelect(entry.slug)}
      aria-label={`Ver ficha de ${entry.title}`}
      className="group flex w-full items-center gap-4 px-2 py-4 text-left transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60"
    >
      <span className="h-[78px] w-[52px] shrink-0 overflow-hidden rounded bg-secondary">
        <PosterImage src={entry.poster} alt={entry.title} className="h-full w-full rounded object-cover" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-1 block text-[16px] font-semibold leading-tight text-foreground transition-colors group-hover:text-primary">
          {entry.title}
        </span>
        {meta ? <span className="mt-1 block text-[12px] tabular-nums text-muted-foreground">{meta}</span> : null}
      </span>
      <span className="flex w-40 shrink-0 items-center justify-end">
        {label ? <ScheduleLabelPill label={label} variant="list" /> : null}
      </span>
    </button>
  );
}

function SchedulePosterCard({ entry, nowMs, onSelect }: ScheduleRowProps) {
  const label = scheduleRowLabel(entry, scheduleEntryState(entry, nowMs));
  const meta = scheduleMetaLine(entry);

  return (
    <button
      type="button"
      onClick={() => onSelect(entry.slug)}
      aria-label={`Ver ficha de ${entry.title}`}
      className="anime-poster-card sala-frame poster-list-item group relative isolate flex aspect-[2/3] min-w-0 cursor-pointer flex-col overflow-hidden border border-transparent bg-transparent text-left shadow-none transition-[border-color,box-shadow] duration-200 ease-out hover:border-white/15 hover:shadow-[0_8px_24px_rgba(0,0,0,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <PosterImage src={entry.poster} alt={entry.title} className="absolute inset-0 z-0 h-full w-full object-cover" />
      <div
        aria-hidden="true"
        className="absolute inset-0 z-10 bg-gradient-to-t from-black/90 via-black/40 via-55% to-black/5 opacity-90 transition-opacity duration-200 group-hover:opacity-100"
      />
      {label && <ScheduleLabelPill label={label} variant="card" />}
      <div className="relative z-20 mt-auto min-w-0 p-3.5">
        {meta && (
          <div className="mb-1.5 flex min-w-0 items-center gap-1.5 overflow-hidden text-[12px] tabular-nums text-white/50">
            {meta}
          </div>
        )}
        <h3 className="sala-poster-title line-clamp-2 min-h-[2.6em] text-[14px] font-semibold leading-snug tracking-tight text-white">
          {entry.title}
        </h3>
      </div>
    </button>
  );
}

export function ScheduleView({ isActive }: { isActive?: boolean }) {
  const providerId = useAtomValue(activeProviderAtom);
  const providerName = providerId === 'jkanime' ? 'JkAnime' : 'AnimeAV1';
  const setOpenAnime = useSetAtom(openAnimeAtom);
  const navigateToCatalog = useSetAtom(navigateToCatalogAtom);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch, refresh, isRefreshing } = useSchedule();
  const entries = useMemo(() => data?.entries ?? [], [data]);

  const [selectedDay, setSelectedDay] = useState(() => todayIsoWeekday());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [viewMode, setViewMode] = useState<ScheduleViewMode>(getScheduleViewMode);
  const todayDay = todayIsoWeekday(new Date(nowMs));

  const changeViewMode = (mode: ScheduleViewMode) => {
    setViewMode(mode);
    setScheduleViewMode(mode);
  };

  // El día elegido persiste en la sesión y se resetea al cambiar de proveedor.
  useEffect(() => {
    setSelectedDay(todayIsoWeekday());
  }, [providerId]);

  // Tick acotado a la vista activa: refresca los estados Emitido/Retrasado.
  useEffect(() => {
    if (isActive === false) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [isActive]);

  const counts = useMemo(
    () => WEEKDAY_LABELS.map((_, idx) => entries.filter((entry) => entry.day === idx + 1).length),
    [entries],
  );
  const dayEntries = useMemo(
    () => sortDayEntries(entries.filter((entry) => entry.day === selectedDay)),
    [entries, selectedDay],
  );

  const handleSelectAnime = (slug: string) => {
    prefetchAnimeDetails(queryClient, providerId, slug);
    setOpenAnime(slug);
  };

  const isEmpty = !isLoading && !isError && entries.length === 0;
  const { data: isOnline } = useConnectivityStatus(isEmpty || isError);
  const showOfflineEmpty = shouldShowOfflineEmpty(isError ? 1 : entries.length, isOnline);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        align="center"
        title="Horarios"
        description={`Programación semanal de ${providerName}`}
        actions={
          <button
            type="button"
            onClick={() => refresh()}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <RefreshCcw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        }
      />

      <div className="relative z-0 flex-1 overflow-y-auto px-4 pb-12 sm:px-8">
        {isLoading ? (
          viewMode === 'grid' ? (
            <PosterGridSkeleton count={10} />
          ) : (
            <ScheduleSkeleton count={7} />
          )
        ) : isError ? (
          <ErrorState
            title="No se pudo cargar el horario"
            description={`No se pudo consultar la programación de ${providerName}.`}
            onRetry={() => refetch()}
          />
        ) : entries.length === 0 ? (
          showOfflineEmpty ? (
            <EmptyState
              icon={<CalendarDays className="h-6 w-6" aria-hidden="true" />}
              title="Sin conexión a internet"
              description={`No se pudo consultar la programación de ${providerName}. Comprueba tu conexión e inténtalo de nuevo.`}
              actionLabel="Reintentar"
              onAction={() => refetch()}
            />
          ) : (
            <EmptyState
              icon={<CalendarDays className="h-6 w-6" aria-hidden="true" />}
              title="No hay programación disponible"
              description={`Ahora mismo ${providerName} no publica horarios de emisión. Vuelve a intentarlo más tarde.`}
              actionLabel="Explorar catálogo"
              onAction={() => navigateToCatalog()}
              secondaryActionLabel="Reintentar"
              onSecondaryAction={() => refetch()}
            />
          )
        ) : (
          <>
            <div className="sticky top-0 z-20 -mx-4 flex min-h-[64px] flex-wrap items-center gap-2 bg-background px-4 pb-4 pt-4 sm:-mx-8 sm:px-8">
              {WEEKDAY_LABELS.map((label, idx) => {
                const day = idx + 1;
                const selected = day === selectedDay;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setSelectedDay(day)}
                    aria-pressed={selected}
                    className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                      selected
                        ? 'border-primary/30 bg-primary/15 text-primary'
                        : 'border-border/70 bg-transparent text-muted-foreground hover:border-border/50 hover:bg-secondary hover:text-foreground'
                    }`}
                  >
                    {label}
                    <span
                      className={`text-[13px] font-medium tabular-nums ${selected ? 'text-primary/70' : 'text-text-tertiary'}`}
                    >
                      {counts[idx]}
                    </span>
                    {day === todayDay && (
                      <>
                        <span aria-hidden="true" className="h-1 w-1 rounded-full bg-primary" />
                        <span className="sr-only">hoy</span>
                      </>
                    )}
                  </button>
                );
              })}
              <div className="ml-auto flex items-center gap-3">
                <p className="select-none text-[13px] font-medium tabular-nums text-text-tertiary" role="status">
                  {dayEntries.length} {dayEntries.length === 1 ? 'emisión' : 'emisiones'}{' '}
                  <span aria-hidden="true" className="text-border-strong">
                    |
                  </span>{' '}
                  {providerName}
                </p>
                <div
                  className="flex items-center gap-1 rounded-full border border-border/70 p-1"
                  role="group"
                  aria-label="Modo de visualización del horario"
                >
                  <AppTooltip content="Tarjetas" side="bottom">
                    <button
                      type="button"
                      onClick={() => changeViewMode('grid')}
                      aria-pressed={viewMode === 'grid'}
                      aria-label="Ver en tarjetas"
                      className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                        viewMode === 'grid'
                          ? 'border-primary/30 bg-primary/15 text-primary'
                          : 'border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground'
                      }`}
                    >
                      <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </AppTooltip>
                  <AppTooltip content="Lista" side="bottom">
                    <button
                      type="button"
                      onClick={() => changeViewMode('list')}
                      aria-pressed={viewMode === 'list'}
                      aria-label="Ver en lista"
                      className={`flex h-7 w-7 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                        viewMode === 'list'
                          ? 'border-primary/30 bg-primary/15 text-primary'
                          : 'border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground'
                      }`}
                    >
                      <Rows3 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </AppTooltip>
                </div>
              </div>
            </div>

            {dayEntries.length === 0 ? (
              <p className="px-2 py-12 text-center text-[13px] text-muted-foreground">
                Sin emisiones programadas para {WEEKDAY_LABELS[selectedDay - 1].toLowerCase()}.
              </p>
            ) : viewMode === 'grid' ? (
              <PosterGrid>
                {dayEntries.map((entry) => (
                  <SchedulePosterCard key={entry.slug} entry={entry} nowMs={nowMs} onSelect={handleSelectAnime} />
                ))}
              </PosterGrid>
            ) : (
              <ul>
                {dayEntries.map((entry) => (
                  <li key={entry.slug} className="schedule-row border-b border-border/40 last:border-0">
                    <ScheduleRow entry={entry} nowMs={nowMs} onSelect={handleSelectAnime} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
