import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction,
} from 'react';
import { RefreshCcw, FolderOpen, Library, Search } from 'lucide-react';
import { useAtomValue, useSetAtom } from 'jotai';
import { toast } from 'sonner';
import { settingsAtom, currentViewAtom, navigateToCatalogAtom } from '../store/atoms';
import { useLibrary } from '../hooks/useQueries';
import { LibraryAnimeDetails } from './LibraryAnimeDetails';
import { PosterCard } from '../components/anime/PosterCard';
import { PosterGrid } from '../components/anime/PosterGrid';
import { PosterGridSkeleton } from '../components/anime/PosterGridSkeleton';
import { AppTooltip } from '../components/ui/AppTooltip';
import { PageHeader } from '../components/ui/PageHeader';
import { SearchField } from '../components/ui/SearchField';
import { CustomSelect } from '../components/CustomSelect';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import {
  filterLibraryItems,
  normalizeLibrarySort,
  sortLibraryItems,
  type LibrarySortKey,
} from '../utils/libraryFilter';
import { LibraryFolderMenu } from './libraryDetails/components/LibraryFolderMenu';
import { LibraryFolderDetailsDialog } from './libraryDetails/components/LibraryFolderDetailsDialog';

interface LibraryViewProps {
  onSelectAnime?: (slug: string) => void;
  activeProvider?: string;
  isActive?: boolean;
}

const LIBRARY_SORT_STORAGE_KEY = 'omnianime:library-sort';

const LibraryPosterItem = memo(
  function LibraryPosterItem({
    item,
    setSelectedFolder,
    onContextMenu,
  }: {
    item: any;
    setSelectedFolder: Dispatch<SetStateAction<any>>;
    onContextMenu: (event: ReactMouseEvent, item: any) => void;
  }) {
    const title = item.metaTitle || item.name;
    const episodeCount = typeof item.episodeCount === 'number' ? item.episodeCount : undefined;

    return (
      <PosterCard
        title={title}
        poster={item.posterLocal}
        topOverlay={
          item.hasNew ? (
            <span className="ml-auto block w-fit rounded-md bg-primary px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-primary-foreground shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
              Nuevo
            </span>
          ) : undefined
        }
        meta={
          episodeCount !== undefined ? (
            <span className="text-[12px] font-medium normal-case tracking-normal text-white/55 tabular-nums">
              {episodeCount} {episodeCount === 1 ? 'EP' : 'EPs'}
            </span>
          ) : undefined
        }
        onClick={() => setSelectedFolder(item)}
        onContextMenu={(event) => onContextMenu(event, item)}
      />
    );
  },
  (prev, next) =>
    prev.item.path === next.item.path &&
    prev.item.posterLocal === next.item.posterLocal &&
    prev.item.metaTitle === next.item.metaTitle &&
    prev.item.name === next.item.name &&
    prev.item.hasNew === next.item.hasNew &&
    prev.item.episodeCount === next.item.episodeCount &&
    prev.item.alternativeTitles === next.item.alternativeTitles &&
    prev.setSelectedFolder === next.setSelectedFolder &&
    prev.onContextMenu === next.onContextMenu,
);

export function LibraryView({ onSelectAnime, activeProvider, isActive }: LibraryViewProps = {}) {
  const [selectedFolder, setSelectedFolder] = useState<any>(null);
  const [selectedDirFilter, setSelectedDirFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<LibrarySortKey>(() => {
    try {
      return normalizeLibrarySort(window.localStorage.getItem(LIBRARY_SORT_STORAGE_KEY));
    } catch {
      return 'recientes';
    }
  });
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const setCurrentView = useSetAtom(currentViewAtom);
  const navigateToCatalog = useSetAtom(navigateToCatalogAtom);
  const [folderMenu, setFolderMenu] = useState<{ x: number; y: number; item: any } | null>(null);
  const [detailsItem, setDetailsItem] = useState<any>(null);

  const handleFolderContextMenu = useCallback((event: ReactMouseEvent, item: any) => {
    event.preventDefault();
    setFolderMenu({ x: event.clientX, y: event.clientY, item });
  }, []);
  const closeFolderMenu = useCallback(() => setFolderMenu(null), []);

  const handleSortChange = (value: string) => {
    const next = normalizeLibrarySort(value);
    setSortKey(next);
    try {
      window.localStorage.setItem(LIBRARY_SORT_STORAGE_KEY, next);
    } catch {}
  };

  const globalSettings = useAtomValue(settingsAtom);
  const dirs = useMemo(() => {
    const configuredDirs = Array.isArray(globalSettings?.outputDirs)
      ? globalSettings.outputDirs.filter(
          (dir: unknown): dir is string => typeof dir === 'string' && dir.trim().length > 0,
        )
      : [];
    if (configuredDirs.length > 0) return configuredDirs.slice(0, 3);
    return globalSettings?.defaultOutputDir ? [globalSettings.defaultOutputDir] : [];
  }, [globalSettings?.defaultOutputDir, globalSettings?.outputDirs]);

  const { data: items = [], isLoading, isError, isFetching, refetch } = useLibrary(dirs);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const trimmedQuery = searchQuery.trim();

  const visibleItems = useMemo(
    () => sortLibraryItems(filterLibraryItems(items, selectedDirFilter, searchQuery), sortKey),
    [items, selectedDirFilter, searchQuery, sortKey],
  );

  useEffect(() => {
    if (selectedDirFilter !== 'all' && !dirs.includes(selectedDirFilter)) {
      setSelectedDirFilter('all');
    }
  }, [dirs, selectedDirFilter]);

  useEffect(() => {
    if (selectedFolder?.sourceDir && !dirs.includes(selectedFolder.sourceDir)) {
      setSelectedFolder(null);
    }
  }, [dirs, selectedFolder]);

  useEffect(() => {
    if (isActive === false) {
      setFolderMenu(null);
      setDetailsItem(null);
    }
  }, [isActive]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } catch {}
    setTimeout(() => setIsRefreshing(false), 400);
  };

  const handleOpenFolder = async () => {
    const target = selectedDirFilter !== 'all' ? selectedDirFilter : dirs[0];
    if (!target) return;

    try {
      const result = await window.api.invoke('open-folder', target);
      if (result === false || result?.success === false) {
        toast.error(result?.error || 'No se pudo abrir la carpeta');
      }
    } catch {
      toast.error('No se pudo abrir la carpeta');
    }
  };

  const getDirLabel = (dir: string, index: number): string => {
    const parts = dir.split(/[\\/]/);
    const last = parts[parts.length - 1] || parts[parts.length - 2] || `Carpeta ${index + 1}`;
    return last.length > 20 ? last.slice(0, 17) + '...' : last;
  };

  if (selectedFolder) {
    return (
      <LibraryAnimeDetails
        folderData={selectedFolder}
        // Sin refetch: las mutaciones ya invalidan ['library'].
        onBack={() => {
          setSelectedFolder(null);
        }}
        onSelectAnime={onSelectAnime}
        activeProvider={activeProvider}
        isActive={isActive}
      />
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-col bg-background pt-10">
      <PageHeader
        title="Librería Local"
        description="Tu colección, estante por estante"
        actions={
          <div className="flex items-center gap-2 sm:gap-3">
            <AppTooltip content="Recargar">
              <span className="inline-flex">
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="rounded-lg border border-border/70 bg-secondary p-2 text-foreground transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  disabled={isFetching || isRefreshing}
                  aria-label="Recargar librería"
                >
                  <RefreshCcw className={`h-5 w-5 ${isFetching || isRefreshing ? 'animate-spin' : ''}`} />
                </button>
              </span>
            </AppTooltip>
            <button
              type="button"
              onClick={handleOpenFolder}
              className="flex items-center gap-2 rounded-lg border border-border/70 bg-secondary px-3 py-2 text-sm text-foreground transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 sm:px-4"
            >
              <FolderOpen className="h-4 w-4" />
              <span>Abrir Carpeta</span>
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchField
            value={searchQuery}
            inputRef={searchInputRef}
            placeholder="Buscar en tu librería…"
            ariaLabel="Buscar en la librería"
            onChange={(event) => setSearchQuery(event.target.value)}
            onClear={() => setSearchQuery('')}
          />
          <CustomSelect
            value={sortKey}
            options={[
              { value: 'recientes', label: 'Recientes' },
              { value: 'az', label: 'A–Z' },
              { value: 'za', label: 'Z–A' },
              { value: 'mas-eps', label: 'Más EPs' },
            ]}
            onChange={handleSortChange}
            ariaLabel="Ordenar librería"
            className="w-full sm:w-48"
          />
        </div>
      </PageHeader>

      {dirs.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 sm:px-6">
          <button
            type="button"
            onClick={() => setSelectedDirFilter('all')}
            aria-pressed={selectedDirFilter === 'all'}
            className={`h-8 shrink-0 rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
              selectedDirFilter === 'all'
                ? 'border-primary/30 bg-primary/15 text-primary'
                : 'border-border/70 bg-transparent text-muted-foreground hover:border-border/50 hover:bg-secondary hover:text-foreground'
            }`}
          >
            Todas
          </button>
          {dirs.map((dir: string, i: number) => (
            <button
              key={i}
              type="button"
              onClick={() => setSelectedDirFilter(dir)}
              aria-pressed={selectedDirFilter === dir}
              className={`h-8 max-w-[200px] shrink-0 truncate rounded-full border px-3 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                selectedDirFilter === dir
                  ? 'border-primary/30 bg-primary/15 text-primary'
                  : 'border-border/70 bg-transparent text-muted-foreground hover:border-border/50 hover:bg-secondary hover:text-foreground'
              }`}
            >
              {getDirLabel(dir, i)}
            </button>
          ))}
        </div>
      )}

      <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading ? (
          <PosterGridSkeleton count={12} />
        ) : dirs.length === 0 ? (
          <EmptyState
            icon={<FolderOpen className="h-6 w-6" aria-hidden="true" />}
            title="Aún sin estantes"
            description="Configura al menos una carpeta de descarga en Ajustes para comenzar tu colección."
            actionLabel="Abrir Ajustes"
            onAction={() => setCurrentView('settings')}
          />
        ) : isError ? (
          <ErrorState
            title="No se pudo escanear la librería"
            description="Comprueba que las carpetas configuradas sigan disponibles."
            onRetry={() => refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Library className="h-6 w-6" aria-hidden="true" />}
            title="Estantería vacía"
            description="Aún no has descargado ningún anime. Explora el catálogo y coloca el primer lomo."
            actionLabel="Explorar catálogo"
            onAction={() => navigateToCatalog()}
          />
        ) : visibleItems.length === 0 && trimmedQuery ? (
          <EmptyState
            icon={<Search className="h-6 w-6" aria-hidden="true" />}
            title="Sin resultados"
            description={`No hay animes que coincidan con «${trimmedQuery}». Prueba con otro título o limpia la búsqueda.`}
            actionLabel="Limpiar búsqueda"
            onAction={() => setSearchQuery('')}
            secondaryActionLabel={selectedDirFilter !== 'all' ? 'Ver todas' : undefined}
            onSecondaryAction={selectedDirFilter !== 'all' ? () => setSelectedDirFilter('all') : undefined}
          />
        ) : visibleItems.length === 0 ? (
          <EmptyState
            icon={<Search className="h-6 w-6" aria-hidden="true" />}
            title="Nada en esta balda"
            description="No hay animes en la carpeta seleccionada. Prueba con otra ubicación o descarga contenido nuevo."
            actionLabel="Ver todas"
            onAction={() => setSelectedDirFilter('all')}
          />
        ) : (
          <>
            <p
              className="px-0 pt-2 text-[13px] font-medium normal-case tracking-normal text-text-tertiary tabular-nums select-none"
              role="status"
            >
              {trimmedQuery
                ? `${visibleItems.length} de ${items.length} ${items.length === 1 ? 'anime' : 'animes'}`
                : `${visibleItems.length} ${visibleItems.length === 1 ? 'anime' : 'animes'}`}
              {selectedDirFilter === 'all' && dirs.length > 1 && (
                <>
                  {' '}
                  <span aria-hidden="true" className="text-border-strong">
                    |
                  </span>{' '}
                  {dirs.length} carpetas
                </>
              )}
            </p>
            <PosterGrid>
              {visibleItems.map((item: any, idx: number) => (
                <LibraryPosterItem
                  key={item.path || idx}
                  item={item}
                  setSelectedFolder={setSelectedFolder}
                  onContextMenu={handleFolderContextMenu}
                />
              ))}
            </PosterGrid>
          </>
        )}
      </div>
      {folderMenu && (
        <LibraryFolderMenu
          x={folderMenu.x}
          y={folderMenu.y}
          onDetails={() => setDetailsItem(folderMenu.item)}
          onClose={closeFolderMenu}
        />
      )}
      <LibraryFolderDetailsDialog item={detailsItem} onOpenChange={(open) => !open && setDetailsItem(null)} />
    </div>
  );
}
