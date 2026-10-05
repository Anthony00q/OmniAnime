import { CalendarDays, LayoutGrid, RefreshCcw, Rows3 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useQueryClient } from '@tanstack/react-query';
import { useAtomValue, useSetAtom } from 'jotai';
import { useAtomCallback } from 'jotai/utils';
import { activeProviderAtom, navigateToCatalogAtom, openAnimeAtom } from '@/renderer/store/atoms';
import { prefetchAnimeDetails, useConnectivityStatus, useSchedule } from '@/renderer/hooks/useQueries';
import { shouldShowOfflineEmpty } from '@/renderer/utils/offlineEmpty';
import {
  WEEKDAY_LABELS,
  groupDayEntriesByTime,
  nextUpcomingEntry,
  nowMarkerIndex,
  sortDayEntries,
  todayIsoWeekday,
  weekDates,
} from '@/renderer/utils/schedule';
import { getScheduleViewMode, setScheduleViewMode, type ScheduleViewMode } from '@/renderer/utils/scheduleView';
import { PageHeader } from '@/renderer/components/ui/PageHeader';
import { ErrorState } from '@/renderer/components/ui/ErrorState';
import { EmptyState } from '@/renderer/components/ui/EmptyState';
import { AppTooltip } from '@/renderer/components/ui/AppTooltip';
import { PosterGrid } from '@/renderer/components/anime/PosterGrid';
import { ScheduleGridSkeleton, ScheduleSkeleton } from '@/renderer/components/anime/PosterGridSkeleton';
import { ScheduleAgendaRow } from '@/renderer/views/schedule/components/ScheduleAgendaRow';
import { ScheduleShowtimeCard } from '@/renderer/views/schedule/components/ScheduleShowtimeCard';
import { WeekRail } from '@/renderer/views/schedule/components/WeekRail';

// Marca de la hora actual entre franjas: estado del día, no decoración.
function ScheduleNowMarker({ nowMs }: { nowMs: number }) {
  const now = new Date(nowMs);
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return (
    <div className="flex items-center gap-2 py-2" role="separator" aria-label={`Hora actual ${clock}`}>
      <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-primary">Ahora</span>
      <span className="text-[13px] font-medium tabular-nums text-primary">{clock}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-primary/30" />
    </div>
  );
}

export function ScheduleView({ isActive }: { isActive?: boolean }) {
  const providerId = useAtomValue(activeProviderAtom);
  const getProviderId = useAtomCallback((get) => get(activeProviderAtom));
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

  const dates = useMemo(() => weekDates(new Date(nowMs)), [nowMs]);
  const counts = useMemo(
    () => WEEKDAY_LABELS.map((_, idx) => entries.filter((entry) => entry.day === idx + 1).length),
    [entries],
  );
  const dayEntries = useMemo(
    () => sortDayEntries(entries.filter((entry) => entry.day === selectedDay)),
    [entries, selectedDay],
  );
  const groups = useMemo(() => groupDayEntriesByTime(dayEntries), [dayEntries]);

  // "Sigue" y la marca de ahora solo informan sobre el día de hoy.
  const isTodaySelected = selectedDay === todayDay;
  const nextSlug = useMemo(
    () => (isTodaySelected ? (nextUpcomingEntry(dayEntries, nowMs)?.slug ?? null) : null),
    [dayEntries, isTodaySelected, nowMs],
  );
  const nowIndex = isTodaySelected ? nowMarkerIndex(groups, nowMs) : -1;

  const handleSelectAnime = useCallback(
    (slug: string) => {
      // El proveedor se lee al clic: si el handler lo cerrara, cambiaría con cada
      // cambio de proveedor y el memo de las filas no surtiría efecto.
      prefetchAnimeDetails(queryClient, getProviderId(), slug);
      setOpenAnime(slug);
    },
    [queryClient, getProviderId, setOpenAnime],
  );

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
            <ScheduleGridSkeleton count={10} />
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
            <div className="sticky top-0 z-20 -mx-4 flex min-h-[64px] flex-wrap items-center gap-x-4 gap-y-2 bg-background px-4 pb-4 pt-4 sm:-mx-8 sm:px-8">
              <WeekRail
                className="min-w-[500px] flex-1"
                dates={dates}
                counts={counts}
                selectedDay={selectedDay}
                todayDay={todayDay}
                onSelect={setSelectedDay}
              />
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
                      className={clsx(
                        "relative flex h-7 w-7 items-center justify-center rounded-full border transition-colors after:absolute after:-inset-2 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                        viewMode === 'grid'
                          ? 'border-primary/30 bg-primary/15 text-primary'
                          : 'border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground',
                      )}
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
                      className={clsx(
                        "relative flex h-7 w-7 items-center justify-center rounded-full border transition-colors after:absolute after:-inset-2 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                        viewMode === 'list'
                          ? 'border-primary/30 bg-primary/15 text-primary'
                          : 'border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground',
                      )}
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
                  <ScheduleShowtimeCard
                    key={entry.slug}
                    entry={entry}
                    nowMs={nowMs}
                    onSelect={handleSelectAnime}
                    isNext={entry.slug === nextSlug}
                  />
                ))}
              </PosterGrid>
            ) : (
              <ul>
                {groups.map((group, idx) => (
                  <li key={group.time ?? 'sin-hora'}>
                    {idx === nowIndex && <ScheduleNowMarker nowMs={nowMs} />}
                    <div className="flex items-baseline gap-3 pb-1 pt-5">
                      {group.time ? (
                        <h3 className="text-[16px] font-semibold tabular-nums text-foreground">{group.time}</h3>
                      ) : (
                        <h3 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-text-tertiary">
                          Sin hora publicada
                        </h3>
                      )}
                      <span aria-hidden="true" className="h-px flex-1 self-center bg-border/40" />
                    </div>
                    <ul>
                      {group.entries.map((entry) => (
                        <li key={entry.slug} className="schedule-row border-b border-border/40 last:border-0">
                          <ScheduleAgendaRow
                            entry={entry}
                            nowMs={nowMs}
                            onSelect={handleSelectAnime}
                            isNext={entry.slug === nextSlug}
                          />
                        </li>
                      ))}
                    </ul>
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
