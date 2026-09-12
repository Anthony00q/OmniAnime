import { memo, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Filter, Loader2, SearchX } from 'lucide-react';
import { useAtomValue, useSetAtom, useAtom } from 'jotai';
import { CustomSelect } from '../components/CustomSelect';
import { EmptyState } from '../components/ui/EmptyState';
import {
  activeProviderAtom,
  providerChangedCounterAtom,
  navigateToCatalogCounterAtom,
  focusSearchCounterAtom,
  pendingCatalogGenreAtom,
  openAnimeAtom,
} from '../store/atoms';
import { useCatalog, useConnectivityStatus, useFiltersData } from '../hooks/useQueries';
import { shouldShowOfflineEmpty } from '../utils/offlineEmpty';
import { PosterCard } from '../components/anime/PosterCard';
import { PosterGrid } from '../components/anime/PosterGrid';
import { PosterGridSkeleton } from '../components/anime/PosterGridSkeleton';
import { PageHeader } from '../components/ui/PageHeader';
import { SearchField } from '../components/ui/SearchField';
import { ErrorState } from '../components/ui/ErrorState';
import { createDefaultCatalogFilters, resolveFilterChipLabel } from '../utils/catalogFilters';
import { dedupeCatalogPages, getCatalogResultKey } from '../utils/catalogResults';
import { ActiveFilterChips } from '../components/catalog/ActiveFilterChips';

const CatalogPosterItem = memo(function CatalogPosterItem({ item, priority }: { item: any; priority: boolean }) {
  const setOpenAnime = useSetAtom(openAnimeAtom);

  return (
    <PosterCard
      title={item.title}
      poster={item.poster}
      priority={priority}
      badge={
        <>
          {item.category && (
            <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-primary">
              {item.category}
            </span>
          )}
          {item.year && <span className="text-[12px] font-medium tabular-nums text-white/55">{item.year}</span>}
        </>
      }
      onClick={() => setOpenAnime(item.slug)}
    />
  );
});

export function CatalogView() {
  const searchInputRef = useRef<HTMLInputElement>(null);

  const providerId = useAtomValue(activeProviderAtom);
  const providerChangedCounter = useAtomValue(providerChangedCounterAtom);
  const navigateToCatalogCounter = useAtomValue(navigateToCatalogCounterAtom);
  const focusSearchCounter = useAtomValue(focusSearchCounterAtom);
  const [pendingCatalogGenre, setPendingCatalogGenre] = useAtom(pendingCatalogGenreAtom);

  const [showFilters, setShowFilters] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [localMinYear, setLocalMinYear] = useState<number | null>(null);
  const [localMaxYear, setLocalMaxYear] = useState<number | null>(null);
  const hasInitializedYearsRef = useRef(false);

  const [activeFilters, setActiveFilters] = useState<Record<string, unknown>>(createDefaultCatalogFilters);

  const { data: filterData } = useFiltersData();

  const { data, isLoading, isError, refetch, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useCatalog(activeFilters);

  const pages = data?.pages;
  const items = useMemo(() => dedupeCatalogPages(pages ?? []), [pages]);
  const providerName = providerId === 'jkanime' ? 'JkAnime' : 'AnimeAV1';
  const isCatalogEmpty = !isLoading && !isError && items.length === 0;
  const { data: isOnline } = useConnectivityStatus(isCatalogEmpty);
  const showOfflineEmpty = shouldShowOfflineEmpty(isError ? 1 : items.length, isOnline);

  const applyPendingGenre = useCallback(
    (genreName: string | null) => {
      if (!genreName || !filterData?.genres) return;
      const g = filterData.genres.find((x: any) => x.name.toLowerCase() === genreName.toLowerCase());
      if (g) {
        setActiveFilters((prev) => ({ ...prev, genre: [g.id] }));
      }
      setPendingCatalogGenre(null);
    },
    [filterData, setActiveFilters, setPendingCatalogGenre],
  );

  useEffect(() => {
    if (
      !hasInitializedYearsRef.current &&
      filterData?.years &&
      filterData.years.length > 0 &&
      filterData.yearMode !== 'single'
    ) {
      const min = Math.min(...filterData.years);
      const max = Math.max(...filterData.years);
      setLocalMinYear(min);
      setLocalMaxYear(max);
      hasInitializedYearsRef.current = true;
    }

    if (pendingCatalogGenre) {
      applyPendingGenre(pendingCatalogGenre);
    }
  }, [filterData, pendingCatalogGenre, applyPendingGenre]);

  useEffect(() => {
    if (providerChangedCounter === 0) return;
    setSearchInput('');
    setActiveFilters(createDefaultCatalogFilters());
    setShowFilters(false);
    setLocalMinYear(null);
    setLocalMaxYear(null);
    hasInitializedYearsRef.current = false;
  }, [providerChangedCounter]);

  useEffect(() => {
    if (focusSearchCounter > 0) {
      searchInputRef.current?.focus();
    }
  }, [focusSearchCounter]);

  useEffect(() => {
    if (navigateToCatalogCounter === 0) return;
    if (pendingCatalogGenre) {
      applyPendingGenre(pendingCatalogGenre);
    }
  }, [filterData, navigateToCatalogCounter, pendingCatalogGenre, applyPendingGenre]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setActiveFilters((prev) => {
        if (prev.search === searchInput) return prev;
        return { ...prev, search: searchInput };
      });
    }, 800);
    return () => clearTimeout(handler);
  }, [searchInput]);

  const scrollRafRef = useRef<number | null>(null);
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (scrollRafRef.current !== null) return;
      const target = e.currentTarget;
      scrollRafRef.current = window.requestAnimationFrame(() => {
        scrollRafRef.current = null;
        const { scrollTop, clientHeight, scrollHeight } = target;
        if (scrollHeight - scrollTop <= clientHeight + 100 && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      });
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage],
  );

  useEffect(() => {
    return () => {
      if (scrollRafRef.current !== null) window.cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  const updateFilter = (key: string, value: any) => {
    setActiveFilters((prev) => ({ ...prev, [key]: value }));
  };

  const toggleGenre = (genreId: string) => {
    setActiveFilters((prev) => {
      const genres = prev.genre as string[];
      const isSelected = genres.includes(genreId);
      return {
        ...prev,
        genre: isSelected ? genres.filter((g) => g !== genreId) : [...genres, genreId],
      };
    });
  };

  const updateFilterRange = (min: number, max: number) => {
    let minStr = min.toString();
    let maxStr = max.toString();
    if (filterData && filterData.years && filterData.years.length > 0) {
      if (min === Math.min(...filterData.years)) minStr = '';
      if (max === Math.max(...filterData.years)) maxStr = '';
    }
    setActiveFilters((prev) => ({ ...prev, minYear: minStr, maxYear: maxStr }));
  };

  const commitYearRange = () => {
    if (localMinYear !== null && localMaxYear !== null) {
      updateFilterRange(localMinYear, localMaxYear);
    }
  };

  const clearFilters = () => {
    setSearchInput('');
    setActiveFilters(createDefaultCatalogFilters());
    if (filterData?.years && filterData.years.length > 0) {
      setLocalMinYear(Math.min(...filterData.years));
      setLocalMaxYear(Math.max(...filterData.years));
    }
  };

  const removeFilter = (key: string) => {
    if (key === 'minYear' || key === 'maxYear' || key === 'search') {
      updateFilter(key, '');
    } else if (key === 'genre') {
      updateFilter(key, []);
    } else {
      updateFilter(key, '');
    }
    if (key === 'minYear') {
      if (filterData?.years?.length) {
        setLocalMinYear(Math.min(...filterData.years));
      }
    }
    if (key === 'maxYear') {
      if (filterData?.years?.length) {
        setLocalMaxYear(Math.max(...filterData.years));
      }
    }
  };

  const activeFilterChips = useMemo(
    () =>
      Object.entries(activeFilters)
        .filter(([key, value]) => {
          if (Array.isArray(value)) return value.length > 0;
          if (key === 'search') return false;
          return value !== '' && value !== undefined && value !== null;
        })
        .map(([key, value]) => ({ key, value, label: resolveFilterChipLabel(key, value, filterData) })),
    [activeFilters, filterData],
  );

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Catálogo"
        description={`Explora el catálogo disponible en ${providerName}`}
        actions={
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
            aria-controls="catalog-filters"
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
              showFilters
                ? 'border-primary/30 bg-primary/15 text-primary'
                : 'border-border/70 bg-secondary text-muted-foreground hover:text-foreground'
            }`}
          >
            <Filter className="h-4 w-4" aria-hidden="true" />
            <span>Filtros</span>
            {activeFilterChips.length > 0 && (
              <span
                className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold tabular-nums leading-none text-primary-foreground"
                aria-label={`${activeFilterChips.length} filtros activos`}
              >
                {activeFilterChips.length}
              </span>
            )}
          </button>
        }
      >
        <div className="flex flex-col gap-3">
          <SearchField
            value={searchInput}
            inputRef={searchInputRef}
            placeholder="Buscar en el catálogo..."
            ariaLabel="Buscar en el catálogo"
            onChange={(event) => setSearchInput(event.target.value)}
            onSubmit={() => setActiveFilters((prev) => ({ ...prev, search: searchInput }))}
            onClear={() => {
              setSearchInput('');
              setActiveFilters((prev) => ({ ...prev, search: '' }));
            }}
          />

          <ActiveFilterChips filters={activeFilterChips} onRemove={removeFilter} onClear={clearFilters} />
        </div>
      </PageHeader>

      {filterData && (
        <div
          id="catalog-filters"
          className="catalog-filters-shell"
          data-state={showFilters ? 'open' : 'closed'}
          aria-hidden={!showFilters}
          inert={!showFilters}
        >
          <div className="catalog-filters-content">
            <div className="custom-scrollbar grid max-h-[40vh] shrink-0 grid-cols-2 gap-3 overflow-y-auto px-4 pb-4 pt-2 sm:grid-cols-3 sm:px-8 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {filterData.categories && filterData.categories.length > 0 && (
                <CustomSelect
                  value={(activeFilters.category as string) || ''}
                  options={[
                    { value: '', label: 'Todas las categorías' },
                    ...filterData.categories
                      .filter((c: any) => c.id !== '')
                      .map((c: any) => ({ value: c.id || c.name, label: c.name })),
                  ]}
                  onChange={(v) => updateFilter('category', v)}
                  ariaLabel="Filtrar por categoría"
                  allowClear
                />
              )}

              {filterData.genres && filterData.genres.length > 0 && (
                <CustomSelect
                  value={(activeFilters.genre as string[])?.[0] || ''}
                  options={[
                    { value: '', label: 'Géneros' },
                    ...filterData.genres.map((g: any) => ({ value: g.id, label: g.name })),
                  ]}
                  onChange={(v) => {
                    if (providerId === 'jkanime') {
                      updateFilter('genre', v ? [v] : []);
                    } else if (v) {
                      toggleGenre(v);
                    }
                  }}
                  ariaLabel="Filtrar por género"
                  toggle={providerId !== 'jkanime'}
                  selectedValues={activeFilters.genre as string[] | undefined}
                />
              )}

              {filterData.statuses && filterData.statuses.length > 0 && (
                <CustomSelect
                  value={(activeFilters.status as string) || ''}
                  options={[
                    { value: '', label: 'Todos los estados' },
                    ...filterData.statuses
                      .filter((s: any) => s.id !== '')
                      .map((s: any) => ({ value: s.id || s.name, label: s.name })),
                  ]}
                  onChange={(v) => updateFilter('status', v)}
                  ariaLabel="Filtrar por estado"
                  allowClear
                />
              )}

              {filterData.orders && filterData.orders.length > 0 && (
                <CustomSelect
                  value={(activeFilters.order as string) || ''}
                  options={[
                    { value: '', label: 'Orden' },
                    ...filterData.orders
                      .filter((o: any) => o.id !== '')
                      .map((o: any) => ({ value: o.id || o.name, label: o.name })),
                  ]}
                  onChange={(v) => updateFilter('order', v)}
                  ariaLabel="Ordenar catálogo"
                  allowClear
                />
              )}

              {filterData.orderDirs && filterData.orderDirs.length > 0 && (
                <CustomSelect
                  value={(activeFilters.orderDir as string) || ''}
                  options={[
                    { value: '', label: 'Descendente' },
                    ...filterData.orderDirs
                      .filter((d: any) => d.id !== '')
                      .map((d: any) => ({ value: d.id || d.name, label: d.name })),
                  ]}
                  onChange={(v) => updateFilter('orderDir', v)}
                  ariaLabel="Dirección del orden"
                  allowClear
                />
              )}

              {filterData.letters && filterData.letters.length > 0 && (
                <CustomSelect
                  value={(activeFilters.letter as string) || ''}
                  options={[
                    { value: '', label: 'Letra' },
                    ...filterData.letters
                      .filter((l: any) => l.id !== '')
                      .map((l: any) => ({ value: l.id || l.name, label: l.name })),
                  ]}
                  onChange={(v) => updateFilter('letter', v)}
                  ariaLabel="Filtrar por letra"
                  allowClear
                />
              )}

              {filterData.demographics && filterData.demographics.length > 0 && (
                <CustomSelect
                  value={(activeFilters.demographic as string) || ''}
                  options={[
                    { value: '', label: 'Demografía' },
                    ...filterData.demographics
                      .filter((d: any) => d.id !== '')
                      .map((d: any) => ({ value: d.id || d.name, label: d.name })),
                  ]}
                  onChange={(v) => updateFilter('demographic', v)}
                  ariaLabel="Filtrar por demografía"
                  allowClear
                />
              )}

              {filterData.types && filterData.types.length > 0 && (
                <CustomSelect
                  value={(activeFilters.type as string) || ''}
                  options={[
                    { value: '', label: 'Tipo' },
                    ...filterData.types
                      .filter((t: any) => t.id !== '')
                      .map((t: any) => ({ value: t.id || t.name, label: t.name })),
                  ]}
                  onChange={(v) => updateFilter('type', v)}
                  ariaLabel="Filtrar por tipo"
                  allowClear
                />
              )}

              {filterData.seasons && filterData.seasons.length > 0 && (
                <CustomSelect
                  value={(activeFilters.season as string) || ''}
                  options={[
                    { value: '', label: 'Temporada' },
                    ...filterData.seasons
                      .filter((s: any) => s.id !== '')
                      .map((s: any) => ({ value: s.id || s.name, label: s.name })),
                  ]}
                  onChange={(v) => updateFilter('season', v)}
                  ariaLabel="Filtrar por temporada"
                  allowClear
                />
              )}

              {filterData.yearMode === 'single' && filterData.years && filterData.years.length > 0 && (
                <CustomSelect
                  value={(activeFilters.year as string) || ''}
                  options={[
                    { value: '', label: 'Año' },
                    ...filterData.years.map((y: number) => ({ value: String(y), label: String(y) })),
                  ]}
                  onChange={(v) => updateFilter('year', v)}
                  ariaLabel="Filtrar por año"
                  allowClear
                />
              )}

              {filterData.yearMode !== 'single' && localMinYear !== null && localMaxYear !== null && (
                <div className="col-span-full flex items-center gap-4 mt-2 px-1">
                  <div className="flex flex-col items-center gap-1 shrink-0 select-none">
                    <span className="text-[11px] font-semibold text-muted-foreground">Desde</span>
                    <span className="text-sm font-bold text-foreground tabular-nums">{localMinYear}</span>
                  </div>
                  <div className="flex-1 flex flex-col gap-1.5">
                    <input
                      type="range"
                      aria-label="Año mínimo"
                      min={Math.min(...(filterData?.years || [1900]))}
                      max={Math.max(...(filterData?.years || [2099]))}
                      value={localMinYear ?? Math.min(...(filterData?.years || [1900]))}
                      onChange={(e) => {
                        const v = parseInt(e.target.value);
                        if (localMaxYear !== null && v <= localMaxYear) {
                          setLocalMinYear(v);
                        }
                      }}
                      onPointerUp={commitYearRange}
                      onKeyUp={commitYearRange}
                      className="w-full h-1.5 appearance-none bg-secondary rounded-full outline-none accent-primary cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background"
                    />
                    <input
                      type="range"
                      aria-label="Año máximo"
                      min={Math.min(...(filterData?.years || [1900]))}
                      max={Math.max(...(filterData?.years || [2099]))}
                      value={localMaxYear ?? Math.max(...(filterData?.years || [2099]))}
                      onChange={(e) => {
                        const v = parseInt(e.target.value);
                        if (localMinYear !== null && v >= localMinYear) {
                          setLocalMaxYear(v);
                        }
                      }}
                      onPointerUp={commitYearRange}
                      onKeyUp={commitYearRange}
                      className="w-full h-1.5 appearance-none bg-secondary rounded-full outline-none accent-primary cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background"
                    />
                  </div>
                  <div className="flex flex-col items-center gap-1 shrink-0 select-none">
                    <span className="text-[11px] font-semibold text-muted-foreground">Hasta</span>
                    <span className="text-sm font-bold text-foreground tabular-nums">{localMaxYear}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 pb-12 sm:px-8" onScroll={handleScroll}>
        {isLoading ? (
          <div className="px-0 pt-2">
            <PosterGridSkeleton count={12} />
          </div>
        ) : isError ? (
          <ErrorState
            title="No se pudo cargar el catálogo"
            description={`No pudimos obtener resultados de ${providerName}.`}
            onRetry={() => refetch()}
          />
        ) : (
          <>
            {items.length === 0 && !isLoading ? (
              showOfflineEmpty ? (
                <EmptyState
                  icon={<SearchX className="h-6 w-6" aria-hidden="true" />}
                  title="Sin conexión"
                  description={`No hay conexión para cargar el catálogo de ${providerName}. Tus descargas y librería siguen disponibles.`}
                  actionLabel="Reintentar"
                  onAction={() => refetch()}
                  secondaryActionLabel="Limpiar filtros"
                  onSecondaryAction={clearFilters}
                />
              ) : (
                <EmptyState
                  icon={<SearchX className="h-6 w-6" aria-hidden="true" />}
                  title="Nada en este estante"
                  description="Prueba ajustando los filtros o la búsqueda para encontrar lo que buscas."
                  actionLabel="Limpiar filtros"
                  onAction={clearFilters}
                />
              )
            ) : (
              <PosterGrid>
                {items.map((item: any, idx: number) => (
                  <CatalogPosterItem
                    key={getCatalogResultKey(item) || `catalog-item-${idx}`}
                    item={item}
                    priority={idx < 6}
                  />
                ))}
              </PosterGrid>
            )}

            {!hasNextPage && items.length > 0 && (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
                Has llegado al final del catálogo.
              </div>
            )}

            {isFetchingNextPage && (
              <div className="flex items-center justify-center py-8" role="status" aria-label="Cargando más resultados">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" aria-hidden="true" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
