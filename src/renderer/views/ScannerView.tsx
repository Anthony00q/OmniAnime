import { memo, useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { ScanSearch, RefreshCcw, AlertTriangle, Link, Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAtomValue, useSetAtom } from 'jotai';
import { settingsAtom, currentViewAtom } from '../store/atoms';
import { Dialog } from '../components/Dialog';
import { useLibrary, useSearchAnime, useLibraryActions } from '../hooks/useQueries';
import { PosterCard } from '../components/anime/PosterCard';
import { PosterImage } from '../components/anime/PosterImage';
import { PosterGrid } from '../components/anime/PosterGrid';
import { PosterGridSkeleton } from '../components/anime/PosterGridSkeleton';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { AppTooltip } from '../components/ui/AppTooltip';

// Nombre de carpeta legible para huérfanas sin título oficial
function prettifyFolderName(name: unknown): string {
  return String(name || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const ScannerPosterItem = memo(
  function ScannerPosterItem({
    folder,
    onRelink,
  }: {
    folder: any;
    onRelink: (folderPath: string, folderName: string) => void;
  }) {
    const isOrphan = !folder.metaSlug;
    // Jerarquía: título limpio primero, carpeta cruda en tenue. La pastilla
    // superior queda solo para huérfanas; el proveedor vive en la meta.
    const displayTitle = (!isOrphan && folder.metaTitle) || prettifyFolderName(folder.name) || folder.name;
    const providerLabel = folder.providerId === 'jkanime' ? 'JkAnime' : 'AnimeAV1';

    return (
      <PosterCard
        title={displayTitle}
        poster={folder.posterLocal || folder.poster}
        fallbackLabel={displayTitle}
        actionLabel={isOrphan ? 'Vincular a un Anime' : 'Cambiar Vínculo'}
        actionAlwaysVisible={isOrphan}
        ariaLabel={
          isOrphan
            ? `Vincular ${folder.name}`
            : `Cambiar vínculo de ${folder.name} (vinculado a ${folder.metaTitle}, ${providerLabel})`
        }
        topOverlay={
          isOrphan ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-destructive/20 bg-destructive/20 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-destructive-fg backdrop-blur-sm">
              <AlertTriangle className="h-3 w-3" />
              Huérfano
            </span>
          ) : undefined
        }
        badge={
          folder.episodeCount > 0 ? (
            <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary/90">
              {folder.episodeCount} ep.
            </span>
          ) : undefined
        }
        meta={
          !isOrphan && folder.metaTitle && folder.metaTitle !== folder.name ? (
            <span className="flex min-w-0 items-center gap-1 truncate text-[11px] text-white/50">
              <Link className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {providerLabel} · {folder.name}
              </span>
            </span>
          ) : undefined
        }
        onClick={() => onRelink(folder.path, folder.name)}
      />
    );
  },
  (prev, next) =>
    prev.folder.path === next.folder.path &&
    prev.folder.posterLocal === next.folder.posterLocal &&
    prev.folder.poster === next.folder.poster &&
    prev.folder.metaSlug === next.folder.metaSlug &&
    prev.folder.metaTitle === next.folder.metaTitle &&
    prev.folder.name === next.folder.name &&
    prev.folder.episodeCount === next.folder.episodeCount &&
    prev.folder.providerId === next.folder.providerId &&
    prev.onRelink === next.onRelink,
);

export function ScannerView({ isActive = true }: { isActive?: boolean }) {
  const [selectedDirFilter, setSelectedDirFilter] = useState<string>('all');

  const globalSettings = useAtomValue(settingsAtom);
  const dirs: string[] = useMemo(() => {
    const outputDirs = globalSettings?.outputDirs;
    const configuredDirs = Array.isArray(outputDirs)
      ? outputDirs.filter((dir: unknown): dir is string => typeof dir === 'string' && dir.trim().length > 0)
      : [];
    if (configuredDirs.length > 0) return configuredDirs.slice(0, 3);
    return globalSettings?.defaultOutputDir ? [globalSettings.defaultOutputDir] : [];
  }, [globalSettings?.defaultOutputDir, globalSettings?.outputDirs]);

  const { data: folders = [], isLoading, isError, isFetching, refetch } = useLibrary(dirs);
  const filteredFolders = useMemo(() => {
    if (selectedDirFilter === 'all') return folders;
    return folders.filter((f: any) => f.sourceDir === selectedDirFilter);
  }, [folders, selectedDirFilter]);
  const libActions = useLibraryActions();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const setCurrentView = useSetAtom(currentViewAtom);

  useEffect(() => {
    if (selectedDirFilter !== 'all' && !dirs.includes(selectedDirFilter)) {
      setSelectedDirFilter('all');
    }
  }, [dirs, selectedDirFilter]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } catch {}
    setTimeout(() => setIsRefreshing(false), 400);
  };

  const getDirLabel = (dir: string, index: number): string => {
    const parts = dir.split(/[\\/]/);
    const last = parts[parts.length - 1] || parts[parts.length - 2] || `Carpeta ${index + 1}`;
    return last.length > 20 ? last.slice(0, 17) + '...' : last;
  };

  const [relinkFolder, setRelinkFolder] = useState<{ path: string; name: string } | null>(null);
  const [relinkQuery, setRelinkQuery] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [relinkResults, setRelinkResults] = useState<any[]>([]);
  const isActiveRef = useRef(isActive);

  const { data: searchData, isFetching: isSearching } = useSearchAnime(
    submittedSearch,
    Boolean(relinkFolder && submittedSearch.trim().length >= 3),
  );

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    if (isActive === false) {
      setRelinkFolder(null);
      setRelinkQuery('');
      setSubmittedSearch('');
      setRelinkResults([]);
    }
  }, [isActive]);

  const lastToastedQueryRef = useRef<string | null>(null);

  useEffect(() => {
    if (!relinkFolder) {
      lastToastedQueryRef.current = null;
    }
  }, [relinkFolder]);

  useEffect(() => {
    if (searchData) {
      setRelinkResults(searchData);
      if (searchData.length === 0 && submittedSearch && lastToastedQueryRef.current !== submittedSearch) {
        lastToastedQueryRef.current = submittedSearch;
        toast.error('No se encontraron resultados para: ' + submittedSearch);
      } else if (searchData.length > 0) {
        lastToastedQueryRef.current = null;
      }
    }
  }, [searchData, submittedSearch]);

  useEffect(() => {
    const handleClose = (e: Event) => {
      if (isActiveRef.current && relinkFolder) {
        e.preventDefault(); // Evita que el evento ESC se propague globalmente
        setRelinkFolder(null);
      }
    };
    window.addEventListener('close-modals', handleClose);
    return () => window.removeEventListener('close-modals', handleClose);
  }, [relinkFolder]);

  const openRelinkModal = useCallback((folderPath: string, folderName: string) => {
    setRelinkFolder({ path: folderPath, name: folderName });
    const cleanName = folderName
      .replace(/\[.*?\]|\(.*?\)/g, '')
      .replace(/[_-]/g, ' ')
      .trim();
    setRelinkQuery(cleanName);
    setSubmittedSearch('');
    setRelinkResults([]);
  }, []);

  const executeSearch = () => {
    const query = relinkQuery.trim();
    if (query.length < 3) {
      setRelinkResults([]);
      toast.error('Escribe al menos 3 caracteres para buscar');
      return;
    }

    if (query === submittedSearch) {
      if (searchData) setRelinkResults(searchData);
      return;
    }

    setRelinkResults([]);
    setSubmittedSearch(query);
  };

  const confirmRelink = async (slug: string) => {
    if (!relinkFolder) return;
    libActions.relinkFolder.mutate(
      { folderPath: relinkFolder.path, slug },
      {
        onSuccess: () => {
          toast.success('Carpeta vinculada exitosamente');
          setRelinkFolder(null);
        },
        onError: () => toast.error('Error al vincular la carpeta'),
      },
    );
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/80 p-6 backdrop-blur-md">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Escáner de Librería</h1>
          <p className="text-muted-foreground text-sm">Detecta problemas de vinculación en tus carpetas locales</p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isFetching || isRefreshing}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
        >
          <RefreshCcw className={`w-4 h-4 ${isFetching || isRefreshing ? 'animate-spin' : ''}`} />
          <span>Escanear Directorio</span>
        </button>
      </div>

      {dirs.length > 1 && (
        <div className="px-4 py-2 sm:px-6 flex items-center gap-2 flex-wrap">
          <button
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
          {dirs.map((dir, i) => (
            <button
              key={i}
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

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading ? (
          <PosterGridSkeleton
            count={12}
            className="grid w-full grid-cols-2 gap-4 gap-y-6 pt-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7"
          />
        ) : dirs.length === 0 ? (
          <EmptyState
            icon={<ScanSearch className="h-10 w-10" aria-hidden="true" />}
            title="No hay carpetas configuradas"
            description="Configura al menos una carpeta de descarga en Ajustes para escanear tu librería."
            actionLabel="Abrir Ajustes"
            onAction={() => setCurrentView('settings')}
          />
        ) : isError ? (
          <ErrorState
            title="No se pudo escanear esta ubicación"
            description="Comprueba las carpetas configuradas e inténtalo de nuevo."
            onRetry={() => refetch()}
          />
        ) : filteredFolders.length === 0 ? (
          <EmptyState
            icon={<ScanSearch className="h-10 w-10" aria-hidden="true" />}
            title="No se encontraron carpetas en esta ubicación"
            description="No hay carpetas que coincidan con el filtro seleccionado. Prueba con otra ubicación."
            actionLabel="Ver todas"
            onAction={() => setSelectedDirFilter('all')}
          />
        ) : (
          <PosterGrid className="w-full">
            {filteredFolders.map((folder, idx) => (
              <ScannerPosterItem key={folder.path || idx} folder={folder} onRelink={openRelinkModal} />
            ))}
          </PosterGrid>
        )}
      </div>

      <Dialog
        open={isActive && relinkFolder !== null}
        onOpenChange={(open) => {
          if (!open) setRelinkFolder(null);
        }}
        title="Vincular Directorio"
        message={relinkFolder?.name ?? ''}
        showFooter={false}
        className="max-w-2xl"
      >
        <div className="flex gap-3 mb-6 -mt-1">
          <div className="relative flex-1 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              aria-label="Buscar anime para vincular"
              placeholder="Buscar anime por nombre..."
              value={relinkQuery}
              onChange={(e) => setRelinkQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && executeSearch()}
              className="w-full bg-background border border-border rounded-lg py-2.5 pl-9 pr-4 text-sm focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          <button
            type="button"
            onClick={executeSearch}
            disabled={isSearching}
            aria-busy={isSearching}
            className="px-6 py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 rounded-lg font-bold text-sm transition-colors flex items-center gap-2"
          >
            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Buscar
          </button>
        </div>

        <div className="overflow-y-auto max-h-[40vh] custom-scrollbar border border-border/30 rounded-lg bg-background/50 p-2">
          {isSearching ? (
            <div
              className="flex flex-col items-center justify-center py-12 text-muted-foreground"
              role="status"
              aria-label="Buscando coincidencias"
            >
              <Loader2 className="w-8 h-8 animate-spin mb-4" aria-hidden="true" />
              <p className="text-sm">Buscando coincidencias...</p>
            </div>
          ) : relinkResults.length > 0 ? (
            <div className="grid grid-cols-1 gap-2">
              {relinkResults.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  aria-label={`Vincular ${item.title}`}
                  className="group flex w-full items-center gap-4 rounded-lg border border-transparent p-3 text-left transition-colors hover:border-border/50 hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                  onClick={() => confirmRelink(item.slug)}
                >
                  <PosterImage
                    src={item.poster}
                    alt={item.title}
                    className="h-14 w-10 rounded bg-secondary object-cover shadow-sm"
                  />
                  <div className="flex-1 min-w-0">
                    <AppTooltip content={item.title} align="start" sideOffset={2}>
                      <h4 className="font-bold text-sm text-foreground truncate w-fit max-w-full group-hover:text-primary transition-colors">
                        {item.title}
                      </h4>
                    </AppTooltip>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                      <span className="uppercase font-bold">{item.category || 'ANIME'}</span>
                      <span>•</span>
                      <span>{item.year || item.status || 'Desconocido'}</span>
                    </div>
                  </div>
                  <div className="px-4 text-xs font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                    VINCULAR
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Link className="w-10 h-10 mb-4 opacity-20" />
              <p className="text-sm">Realiza una búsqueda para encontrar el anime correcto.</p>
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
}
