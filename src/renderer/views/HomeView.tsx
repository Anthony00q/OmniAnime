import { RefreshCcw, Clock, Loader2, Clapperboard } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import type { KeyboardEvent } from 'react';
import { activeProviderAtom, openAnimeAtom, navigateToCatalogAtom } from '../store/atoms';
import { useConnectivityStatus, useHomeData, useSearchAnime } from '../hooks/useQueries';
import { shouldShowOfflineEmpty } from '../utils/offlineEmpty';
import { PosterCard } from '../components/anime/PosterCard';
import { PosterImage } from '../components/anime/PosterImage';
import { PosterGrid } from '../components/anime/PosterGrid';
import { PosterGridSkeleton } from '../components/anime/PosterGridSkeleton';
import { PageHeader } from '../components/ui/PageHeader';
import { SearchField } from '../components/ui/SearchField';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';

const HomePosterItem = memo(function HomePosterItem({ item, priority }: { item: any; priority: boolean }) {
  const setOpenAnime = useSetAtom(openAnimeAtom);

  return (
    <PosterCard
      title={item.title}
      poster={item.poster}
      priority={priority}
      meta={
        <>
          <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.08em] text-primary tabular-nums">
            Ep {item.episode || '?'}
          </span>
          <span aria-hidden="true" className="shrink-0 text-[11px] text-white/30">
            /
          </span>
          <span className="flex min-w-0 items-center gap-1 truncate text-[12px] font-medium normal-case tracking-normal text-white/50 tabular-nums">
            <Clock className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />
            <span className="truncate">{item.timeAgo || 'Reciente'}</span>
          </span>
        </>
      }
      onClick={() => setOpenAnime(item.slug)}
    />
  );
});

export function HomeView({ isActive }: { isActive?: boolean }) {
  const providerId = useAtomValue(activeProviderAtom);
  const setOpenAnime = useSetAtom(openAnimeAtom);

  const providerName = providerId === 'jkanime' ? 'JkAnime' : 'AnimeAV1';
  const navigateToCatalog = useSetAtom(navigateToCatalogAtom);
  const previousProviderRef = useRef(providerId);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(-1);

  const { data: items = [], isLoading, isError, refetch, refresh, isRefreshing } = useHomeData();

  const isProviderChanging = previousProviderRef.current !== providerId;

  const { data: searchResults = [], isFetching: isSearching } = useSearchAnime(
    debouncedQuery,
    !isProviderChanging && debouncedQuery.trim().length >= 3,
  );

  useEffect(() => {
    const providerChanged = previousProviderRef.current !== providerId;
    previousProviderRef.current = providerId;

    if (isActive === false || providerChanged) {
      setSearchQuery('');
      setDebouncedQuery('');
      setShowDropdown(false);
      setActiveSearchIndex(-1);
    }
  }, [isActive, providerId]);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedQuery(searchQuery), 400);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  useEffect(() => {
    setActiveSearchIndex(-1);
    if (debouncedQuery.trim().length >= 3) {
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
    }
  }, [debouncedQuery]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.search-container')) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleSelectAnime = (slug: string) => {
    setOpenAnime(slug);
    setShowDropdown(false);
    setActiveSearchIndex(-1);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setShowDropdown(false);
      return;
    }

    if (!showDropdown || searchResults.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSearchIndex((current) => (current + 1) % searchResults.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSearchIndex((current) => (current <= 0 ? searchResults.length - 1 : current - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const selectedResult = searchResults[activeSearchIndex >= 0 ? activeSearchIndex : 0];
      if (selectedResult?.slug) handleSelectAnime(selectedResult.slug);
    }
  };

  const visibleSearchQuery = isProviderChanging ? '' : searchQuery;
  const dropdownOpen = !isProviderChanging && showDropdown && searchQuery.trim().length >= 3;
  const isHomeEmpty = !isLoading && !isError && items.length === 0;
  const needConnectivity =
    isHomeEmpty || (dropdownOpen && !isSearching && searchResults.length === 0 && debouncedQuery.trim().length >= 3);
  const { data: isOnline } = useConnectivityStatus(needConnectivity);
  const showOfflineEmpty = shouldShowOfflineEmpty(isError ? 1 : items.length, isOnline);
  const showOfflineSearch = dropdownOpen && !isSearching && shouldShowOfflineEmpty(searchResults.length, isOnline);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        align="center"
        title="Episodios recientes"
        description={`Últimas publicaciones de ${providerName}`}
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
      >
        <div className="search-container relative z-50">
          <SearchField
            value={visibleSearchQuery}
            placeholder="Busca un anime..."
            ariaLabel="Buscar un anime"
            ariaControls="home-search-results"
            ariaExpanded={dropdownOpen}
            ariaActiveDescendant={activeSearchIndex >= 0 ? `home-search-option-${activeSearchIndex}` : undefined}
            role="combobox"
            ariaHasPopup="listbox"
            ariaAutoComplete="list"
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setShowDropdown(true);
            }}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => {
              if (visibleSearchQuery.trim().length >= 3) setShowDropdown(true);
            }}
            onClear={() => {
              setSearchQuery('');
              setShowDropdown(false);
            }}
          />

          {dropdownOpen && (
            <div
              id="home-search-results"
              role="listbox"
              aria-label="Resultados de búsqueda"
              className="absolute left-0 top-full z-[60] mt-2 flex max-h-[400px] w-full flex-col overflow-hidden rounded-xl border border-border-strong bg-popover shadow-2xl"
            >
              {isSearching ? (
                <div
                  className="flex items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground"
                  role="status"
                >
                  <Loader2 className="h-4 w-4 animate-spin" /> Buscando...
                </div>
              ) : searchResults.length > 0 ? (
                <div className="overflow-y-auto custom-scrollbar">
                  {searchResults.map((item: any, idx: number) => (
                    <button
                      key={item.slug || item.id || `search-result-${idx}`}
                      id={`home-search-option-${idx}`}
                      type="button"
                      role="option"
                      aria-selected={activeSearchIndex === idx}
                      onClick={() => handleSelectAnime(item.slug)}
                      onMouseEnter={() => setActiveSearchIndex(idx)}
                      className={`flex w-full items-center gap-4 border-b border-border/50 p-3 text-left transition-colors last:border-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/60 ${activeSearchIndex === idx ? 'bg-secondary/70' : 'hover:bg-secondary/50'}`}
                    >
                      <div className="h-16 w-12 shrink-0 overflow-hidden rounded bg-secondary">
                        <PosterImage
                          src={item.poster}
                          alt={item.title}
                          className="h-full w-full rounded object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="line-clamp-1 text-sm font-bold text-foreground">{item.title}</h4>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[11px] font-bold uppercase text-primary">
                            {item.category || 'ANIME'}
                          </span>
                          <span>{item.year || item.status || ''}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : showOfflineSearch ? (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  Sin conexión: no se pudo buscar &quot;{searchQuery}&quot;
                </div>
              ) : (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  No se encontraron animes para &quot;{searchQuery}&quot;
                </div>
              )}
            </div>
          )}
        </div>
      </PageHeader>

      <div className="relative z-0 flex-1 overflow-y-auto px-4 pb-12 sm:px-8">
        {isLoading ? (
          <PosterGridSkeleton count={12} />
        ) : isError ? (
          <ErrorState
            title="No se pudieron cargar los episodios"
            description={`No pudimos actualizar el contenido de ${providerName}.`}
            onRetry={() => refetch()}
          />
        ) : items.length === 0 ? (
          showOfflineEmpty ? (
            <EmptyState
              icon={<Clapperboard className="h-6 w-6" aria-hidden="true" />}
              title="Sin conexión"
              description={`No hay conexión para actualizar ${providerName}. Tus descargas y librería siguen disponibles.`}
              actionLabel="Reintentar"
              onAction={() => refetch()}
              secondaryActionLabel="Explorar catálogo"
              onSecondaryAction={() => navigateToCatalog()}
            />
          ) : (
            <EmptyState
              icon={<Clapperboard className="h-6 w-6" aria-hidden="true" />}
              title="La sala está en pausa"
              description={`No hay novedades en ${providerName} por el momento. Vuelve tras el próximo pase.`}
              actionLabel="Explorar catálogo"
              onAction={() => navigateToCatalog()}
              secondaryActionLabel="Reintentar"
              onSecondaryAction={() => refetch()}
            />
          )
        ) : (
          <>
            <p
              className="px-0 pt-4 text-[13px] font-medium normal-case tracking-normal text-text-tertiary tabular-nums select-none"
              role="status"
            >
              {items.length} {items.length === 1 ? 'anime reciente' : 'animes recientes'} · {providerName}
            </p>
            <PosterGrid>
              {items.map((item: any, idx: number) => (
                <HomePosterItem key={`${item.slug}-${item.episode || idx}`} item={item} priority={idx < 6} />
              ))}
            </PosterGrid>
          </>
        )}
      </div>
    </div>
  );
}
