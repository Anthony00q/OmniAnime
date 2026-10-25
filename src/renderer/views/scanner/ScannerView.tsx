import { memo, useCallback, useState, useEffect, useMemo, useRef, useId } from 'react';
import { ScanSearch, RefreshCcw, AlertTriangle, Link, Link2, Search, Loader2, LockKeyhole } from 'lucide-react';
import { toast } from 'sonner';
import { useAtomValue } from 'jotai';
import { useAtomCallback } from 'jotai/utils';
import { activeProviderAtom, settingsAtom } from '@/renderer/store/atoms';
import type { LibraryFolder } from '@/services/library/LibraryFileService';
import { resolveScannerRelinkProvider } from '@/renderer/views/scanner/model/relinkPolicy';
import { Dialog } from '@/renderer/components/Dialog';
import { useAppNavigation } from '@/renderer/hooks/useAppNavigation';
import { useLibrary, useSearchAnime, useLibraryActions } from '@/renderer/hooks/useQueries';
import { isIpcFailError } from '@/renderer/hooks/queries/unwrap';
import { PosterCard } from '@/renderer/components/anime/PosterCard';
import { PosterImage } from '@/renderer/components/anime/PosterImage';
import { PosterGrid } from '@/renderer/components/anime/PosterGrid';
import { PosterGridSkeleton } from '@/renderer/components/anime/PosterGridSkeleton';
import { ErrorState } from '@/renderer/components/ui/ErrorState';
import { EmptyState } from '@/renderer/components/ui/EmptyState';
import { PageHeader } from '@/renderer/components/ui/PageHeader';
import { AppTooltip } from '@/renderer/components/ui/AppTooltip';
import { useStaggerIn } from '@/renderer/utils/motion';

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
    activeProvider,
    disabledReasonId,
    onRelink,
  }: {
    folder: any;
    activeProvider: string;
    disabledReasonId: string;
    onRelink: (folder: LibraryFolder) => void;
  }) {
    const isOrphan = !folder.metaSlug;
    // Jerarquía: título limpio primero, carpeta cruda en tenue. La pastilla
    // superior queda solo para huérfanas; el proveedor vive en la meta.
    const displayTitle = (!isOrphan && folder.metaTitle) || prettifyFolderName(folder.name) || folder.name;
    const providerLabel = folder.providerId === 'jkanime' ? 'JkAnime' : 'AnimeAV1';
    const relinkDisabled = resolveScannerRelinkProvider(folder, activeProvider) === null;

    return (
      <PosterCard
        title={displayTitle}
        poster={folder.posterLocal || folder.poster}
        fallbackLabel={displayTitle}
        actionLabel={relinkDisabled ? undefined : isOrphan ? 'Vincular a un Anime' : 'Cambiar Vínculo'}
        actionAlwaysVisible={isOrphan && !relinkDisabled}
        actionTone="secondary"
        disabled={relinkDisabled}
        describedBy={relinkDisabled ? disabledReasonId : undefined}
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
            <span className="rounded bg-black/40 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white/80">
              {folder.episodeCount} ep.
            </span>
          ) : undefined
        }
        meta={
          relinkDisabled || (!isOrphan && folder.metaTitle && folder.metaTitle !== folder.name) ? (
            <span className="flex min-w-0 items-center gap-1 truncate text-[11px] text-white/70">
              {relinkDisabled ? (
                <LockKeyhole className="h-3 w-3 shrink-0" aria-hidden="true" />
              ) : (
                <Link className="h-3 w-3 shrink-0" aria-hidden="true" />
              )}
              <span className="truncate">
                {providerLabel}
                {!relinkDisabled && (
                  <>
                    {' '}
                    <span aria-hidden="true" className="text-white/30">
                      |
                    </span>{' '}
                    {folder.name}
                  </>
                )}
              </span>
            </span>
          ) : undefined
        }
        onClick={() => onRelink(folder)}
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
    prev.folder.hasProviderMetadata === next.folder.hasProviderMetadata &&
    prev.activeProvider === next.activeProvider &&
    prev.disabledReasonId === next.disabledReasonId &&
    prev.onRelink === next.onRelink,
);

export function ScannerView({ isActive = true }: { isActive?: boolean }) {
  const [selectedDirFilter, setSelectedDirFilter] = useState<string>('all');

  const globalSettings = useAtomValue(settingsAtom);
  const activeProvider = useAtomValue(activeProviderAtom);
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
  const staggerKeys = useMemo(
    () => filteredFolders.map((folder) => (typeof folder.path === 'string' && folder.path.trim() ? folder.path : null)),
    [filteredFolders],
  );
  const staggerScopeKey = useMemo(() => ({ dirs, selectedDirFilter }), [dirs, selectedDirFilter]);
  const gridRef = useStaggerIn<HTMLDivElement>(staggerKeys, { scopeKey: staggerScopeKey });

  const hasBlockedLinks = useMemo(
    () => filteredFolders.some((folder) => resolveScannerRelinkProvider(folder, activeProvider) === null),
    [filteredFolders, activeProvider],
  );
  const blockedProviderLabel = activeProvider === 'jkanime' ? 'AnimeAV1' : 'JkAnime';
  const disabledReasonId = useId();
  const libActions = useLibraryActions();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { setView } = useAppNavigation();

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

  const [relinkFolder, setRelinkFolder] = useState<{ path: string; name: string; providerId: string } | null>(null);
  const [relinkQuery, setRelinkQuery] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [relinkResults, setRelinkResults] = useState<any[]>([]);
  const isActiveRef = useRef(isActive);
  const relinkAllowed = relinkFolder !== null && relinkFolder.providerId === activeProvider;

  // La búsqueda de vínculo va contra el proveedor de la carpeta, no el activo.
  const {
    data: searchData,
    isFetching: isSearching,
    isError: isSearchError,
  } = useSearchAnime(
    submittedSearch,
    isActive && relinkAllowed && submittedSearch.trim().length >= 3,
    relinkFolder?.providerId ?? null,
  );

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    if (!isActive || !relinkAllowed) {
      setRelinkFolder(null);
      setRelinkQuery('');
      setSubmittedSearch('');
      setRelinkResults([]);
    }
  }, [isActive, relinkAllowed]);

  useEffect(() => {
    if (!relinkAllowed || !searchData) return;
    setRelinkResults(searchData);
  }, [searchData, relinkAllowed]);

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

  const openRelinkModal = useAtomCallback(
    useCallback((get, _set, folder: LibraryFolder) => {
      if (!isActiveRef.current) return;
      const providerId = resolveScannerRelinkProvider(folder, get(activeProviderAtom));
      if (!providerId) return;
      setRelinkFolder({ path: folder.path, name: folder.name, providerId });
      const cleanName = folder.name
        .replace(/\[.*?\]|\(.*?\)/g, '')
        .replace(/[_-]/g, ' ')
        .trim();
      setRelinkQuery(cleanName);
      setSubmittedSearch('');
      setRelinkResults([]);
    }, []),
  );

  const executeSearch = useAtomCallback(
    useCallback(
      (get) => {
        if (!isActiveRef.current || !relinkFolder || relinkFolder.providerId !== get(activeProviderAtom)) return;
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
      },
      [relinkFolder, relinkQuery, submittedSearch, searchData],
    ),
  );

  const confirmRelink = useAtomCallback(
    useCallback(
      (get, _set, slug: string) => {
        if (!isActiveRef.current || !relinkFolder || libActions.relinkFolder.isPending) return;
        const providerId = resolveScannerRelinkProvider(relinkFolder, get(activeProviderAtom));
        if (providerId !== relinkFolder.providerId) return;
        libActions.relinkFolder.mutate(
          { folderPath: relinkFolder.path, slug, providerId },
          {
            onSuccess: () => {
              toast.success('Carpeta vinculada exitosamente');
              setRelinkFolder((current) => (current === relinkFolder ? null : current));
            },
            onError: (error) => {
              if (!isIpcFailError(error)) toast.error('Error al vincular la carpeta');
            },
          },
        );
      },
      [relinkFolder, libActions.relinkFolder],
    ),
  );

  return (
    <div className="empty-state-page flex flex-col h-full bg-background">
      <PageHeader
        title="Escáner de Librería"
        description="Detecta problemas de vinculación en tus carpetas locales"
        className="sticky top-0"
        actions={
          <button
            onClick={handleRefresh}
            disabled={dirs.length === 0 || isFetching || isRefreshing}
            className="flex min-h-11 items-center gap-2 rounded-lg border border-border/60 px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCcw className={`w-4 h-4 ${isFetching || isRefreshing ? 'animate-spin' : ''}`} />
            <span>Escanear Directorio</span>
          </button>
        }
      />

      {dirs.length > 1 && (
        <div data-empty-filters className="px-4 py-2 sm:px-8 flex items-center gap-2 flex-wrap">
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

      <div
        data-view-scroller
        className="empty-state-scroller min-h-0 flex-1 overflow-y-auto p-4 sm:px-8 sm:py-6 [scrollbar-gutter:stable]"
      >
        {(isLoading || (!isError && filteredFolders.length > 0)) && (
          <div className="mb-3 min-h-10 sm:min-h-6">
            {!isLoading && hasBlockedLinks && (
              <p
                id={disabledReasonId}
                role="note"
                className="flex items-start gap-2 text-[13px] leading-5 text-muted-foreground"
              >
                <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Para modificar vínculos de {blockedProviderLabel}, cambia a ese proveedor.</span>
              </p>
            )}
          </div>
        )}
        {isLoading ? (
          <PosterGridSkeleton
            count={12}
            className="grid w-full grid-cols-2 gap-4 gap-y-6 pt-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7"
          />
        ) : dirs.length === 0 ? (
          <EmptyState
            variant="page"
            isActive={isActive}
            icon={<ScanSearch className="h-10 w-10" aria-hidden="true" />}
            title="No hay carpetas configuradas"
            description="Configura al menos una carpeta de descarga en Ajustes para escanear tu librería."
            actionLabel="Abrir Ajustes"
            onAction={() => setView('settings')}
          />
        ) : isError ? (
          <ErrorState
            title="No se pudo escanear esta ubicación"
            description="Comprueba las carpetas configuradas e inténtalo de nuevo."
            onRetry={() => refetch()}
          />
        ) : filteredFolders.length === 0 ? (
          <EmptyState
            variant={selectedDirFilter === 'all' ? 'page' : 'contextual'}
            isActive={isActive}
            icon={<ScanSearch className="h-10 w-10" aria-hidden="true" />}
            title={selectedDirFilter === 'all' ? 'No se encontraron carpetas' : 'No hay carpetas en esta ubicación'}
            description={
              selectedDirFilter === 'all'
                ? 'No se encontraron carpetas de anime en las ubicaciones configuradas. Puedes revisar las carpetas de descarga en Ajustes.'
                : 'No hay carpetas que coincidan con el filtro seleccionado. Prueba con otra ubicación.'
            }
            actionLabel={selectedDirFilter !== 'all' ? 'Ver todas' : 'Abrir Ajustes'}
            onAction={() => (selectedDirFilter !== 'all' ? setSelectedDirFilter('all') : setView('settings'))}
          />
        ) : (
          <PosterGrid ref={gridRef} className="w-full">
            {filteredFolders.map((folder, idx) => (
              <ScannerPosterItem
                key={folder.path || idx}
                folder={folder}
                activeProvider={activeProvider}
                disabledReasonId={disabledReasonId}
                onRelink={openRelinkModal}
              />
            ))}
          </PosterGrid>
        )}
      </div>

      <Dialog
        open={isActive && relinkAllowed}
        onOpenChange={(open) => {
          if (!open) setRelinkFolder(null);
        }}
        title="Vincular directorio"
        message={
          relinkFolder
            ? `${relinkFolder.name}${relinkFolder.providerId ? ` | ${relinkFolder.providerId === 'jkanime' ? 'JkAnime' : 'AnimeAV1'}` : ''}`
            : ''
        }
        icon={<Link2 className="h-5 w-5" aria-hidden="true" />}
        showFooter={false}
        className="max-w-2xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const input = (event.currentTarget as HTMLElement).querySelector('input');
          if (input) {
            input.focus({ preventScroll: true });
            input.setSelectionRange(input.value.length, input.value.length);
          }
        }}
      >
        <div className="flex gap-3 mb-4 -mt-1">
          <div className="relative flex-1 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <input
              type="text"
              aria-label="Buscar anime para vincular"
              placeholder="Buscar anime por nombre..."
              value={relinkQuery}
              onChange={(e) => setRelinkQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && executeSearch()}
              className="search-input h-10 w-full rounded-lg border border-border bg-surface py-0 pl-9 pr-4 text-sm focus:outline-none transition-[border-color,box-shadow] hover:border-border-strong"
            />
          </div>
          <button
            type="button"
            onClick={executeSearch}
            disabled={isSearching}
            aria-busy={isSearching}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color-mix(in_srgb,var(--color-primary)_88%,black)] disabled:opacity-50"
          >
            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Buscar
          </button>
        </div>

        <div className="max-h-[48vh] overflow-y-auto custom-scrollbar px-1">
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
              {relinkResults.map((item, idx) => {
                const category = item.category?.toLowerCase() === 'anime' ? null : item.category;
                const detail = item.year || item.status;
                const visibleDetail = detail && detail !== 'Desconocido' ? detail : null;

                return (
                  <button
                    key={idx}
                    type="button"
                    aria-label={`Vincular ${item.title}`}
                    disabled={libActions.relinkFolder.isPending || !relinkAllowed}
                    className="group flex w-full items-center gap-4 rounded-lg p-3 text-left transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50"
                    onClick={() => confirmRelink(item.slug)}
                  >
                    <PosterImage
                      src={item.poster}
                      alt={item.title}
                      className="h-24 w-16 shrink-0 rounded-lg bg-secondary object-cover sm:h-30 sm:w-20"
                    />
                    <div className="flex min-w-0 flex-1 flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                      <div className="min-w-0 flex-1">
                        <AppTooltip content={item.title} align="start" sideOffset={2}>
                          <h4 className="line-clamp-2 break-words text-base font-semibold leading-snug text-foreground">
                            {item.title}
                          </h4>
                        </AppTooltip>
                        {(category || visibleDetail) && (
                          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
                            {category && <span className="shrink-0 font-bold uppercase">{category}</span>}
                            {category && visibleDetail && (
                              <span aria-hidden="true" className="shrink-0 text-border-strong">
                                |
                              </span>
                            )}
                            {visibleDetail && <span className="break-words">{visibleDetail}</span>}
                          </div>
                        )}
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-primary">Vincular</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground" role="status">
              <Link className="w-10 h-10 mb-4 opacity-20" aria-hidden="true" />
              <p className="text-sm text-center">
                {isSearchError
                  ? 'No se pudo completar la búsqueda. Inténtalo de nuevo.'
                  : submittedSearch
                    ? `No se encontraron resultados para «${submittedSearch}». Prueba con otro nombre.`
                    : 'Realiza una búsqueda para encontrar el anime correcto.'}
              </p>
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
}
