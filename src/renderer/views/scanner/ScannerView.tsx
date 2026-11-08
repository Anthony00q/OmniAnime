import { useCallback, useState, useEffect, useLayoutEffect, useMemo, useRef, useId } from 'react';
import { ScanSearch, Link, Link2, Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAtomValue } from 'jotai';
import { useAtomCallback } from 'jotai/utils';
import { activeProviderAtom } from '@/renderer/store/atoms';
import type { LibraryFolder } from '@/services/library/LibraryFileService';
import { resolveScannerRelinkProvider } from '@/renderer/views/scanner/model/relinkPolicy';
import { Dialog } from '@/renderer/components/Dialog';
import { useAppNavigation } from '@/renderer/hooks/useAppNavigation';
import { useLibrary, useSearchAnime, useLibraryActions } from '@/renderer/hooks/useQueries';
import { isIpcFailError } from '@/renderer/hooks/queries/unwrap';
import { PosterImage } from '@/renderer/components/anime/PosterImage';
import { ErrorState } from '@/renderer/components/ui/ErrorState';
import { EmptyState } from '@/renderer/components/ui/EmptyState';
import { AppTooltip } from '@/renderer/components/ui/AppTooltip';
import { SearchField } from '@/renderer/components/ui/SearchField';
import { useBusySpin } from '@/renderer/utils/motion';
import { ScannerCollection } from './components/ScannerCollection';
import { ScannerInspector } from './components/ScannerInspector';
import { ScannerLayout } from './components/ScannerLayout';
import { ScannerToolbar, SCANNER_SEARCH_LABEL } from './components/ScannerToolbar';
import { ScannerSkeleton } from './components/ScannerSkeleton';
import { useScannerDirectories } from './hooks/useScannerDirectories';
import {
  buildScannerSearchIndex,
  filterScannerFolders,
  getScannerCounts,
  resolveScannerSelection,
  type ScannerFolder,
  type ScannerStatusFilter,
} from './model/scannerModel';

export function ScannerView({ isActive = true }: { isActive?: boolean }) {
  const [selectedDirFilter, setSelectedDirFilter] = useState<string>('all');
  const [folderQuery, setFolderQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ScannerStatusFilter>('all');
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null);
  const inspectorId = useId();

  const activeProvider = useAtomValue(activeProviderAtom);
  const dirs = useScannerDirectories();

  const { data: folders = [], isLoading, isError, isFetching, refetch } = useLibrary(dirs);
  const searchIndex = useMemo(() => buildScannerSearchIndex(folders as ScannerFolder[]), [folders]);
  const searchedFolders = useMemo(
    () => filterScannerFolders(searchIndex, selectedDirFilter, folderQuery, 'all'),
    [searchIndex, selectedDirFilter, folderQuery],
  );
  const counts = useMemo(() => getScannerCounts(searchedFolders), [searchedFolders]);
  const filteredFolders = useMemo(
    () =>
      searchedFolders.filter(
        (folder) => statusFilter === 'all' || (statusFilter === 'linked' ? Boolean(folder.metaSlug) : !folder.metaSlug),
      ),
    [searchedFolders, statusFilter],
  );
  const selectedFolder = resolveScannerSelection(filteredFolders, selectedFolderPath);
  const hasWorkspace = !isLoading && !isError && dirs.length > 0 && filteredFolders.length > 0;
  const [contentPresented, setContentPresented] = useState(false);
  useLayoutEffect(() => {
    if (isActive && hasWorkspace && !contentPresented) setContentPresented(true);
  }, [isActive, hasWorkspace, contentPresented]);
  useEffect(() => {
    if (!isLoading && !isError) setSelectedFolderPath(selectedFolder?.path ?? null);
  }, [selectedFolder?.path, isLoading, isError]);
  const libActions = useLibraryActions();
  const refreshScope = useMemo(() => ({ dirs, isActive }), [dirs, isActive]);
  const refreshSpin = useBusySpin(refreshScope);
  const { setView } = useAppNavigation();

  useEffect(() => {
    if (selectedDirFilter !== 'all' && !dirs.includes(selectedDirFilter)) {
      setSelectedDirFilter('all');
    }
  }, [dirs, selectedDirFilter]);

  const handleRefresh = async () => {
    await refreshSpin.run(() => refetch());
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
    <>
      <ScannerLayout
        onRefresh={handleRefresh}
        refreshRef={refreshSpin.ref}
        refreshDisabled={dirs.length === 0 || !isActive || isFetching || refreshSpin.busy}
        revealContent={contentPresented}
        toolbar={
          <ScannerToolbar
            dirs={dirs}
            counts={counts}
            isLoading={isLoading}
            selectedDirFilter={selectedDirFilter}
            search={
              <SearchField
                value={folderQuery}
                onChange={setFolderQuery}
                onClear={() => setFolderQuery('')}
                placeholder={SCANNER_SEARCH_LABEL}
              />
            }
            statusFilter={statusFilter}
            onDirectoryChange={setSelectedDirFilter}
            onStatusChange={setStatusFilter}
          />
        }
      >
        {isLoading ? (
          <ScannerSkeleton />
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
            variant={folders.length === 0 ? 'page' : 'contextual'}
            isActive={isActive}
            icon={<ScanSearch className="h-10 w-10" aria-hidden="true" />}
            title={folders.length === 0 ? 'No se encontraron carpetas' : 'No hay carpetas que coincidan'}
            description={
              folders.length === 0
                ? 'No se encontraron carpetas de anime en las ubicaciones configuradas. Puedes revisar las carpetas de descarga en Ajustes.'
                : 'Prueba otro nombre o cambia los filtros.'
            }
            actionLabel={folders.length > 0 ? 'Limpiar filtros' : 'Abrir Ajustes'}
            onAction={() => {
              if (folders.length === 0) return setView('settings');
              setSelectedDirFilter('all');
              setFolderQuery('');
              setStatusFilter('all');
            }}
          />
        ) : (
          <div className="scanner-workspace">
            <ScannerCollection
              folders={filteredFolders}
              selectedPath={selectedFolder?.path ?? ''}
              activeProvider={activeProvider}
              inspectorId={inspectorId}
              onSelect={setSelectedFolderPath}
            />
            {selectedFolder && (
              <ScannerInspector
                folder={selectedFolder}
                activeProvider={activeProvider}
                id={inspectorId}
                isPending={libActions.relinkFolder.isPending}
                onRelink={openRelinkModal}
              />
            )}
          </div>
        )}
      </ScannerLayout>

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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              aria-label="Buscar anime para vincular"
              placeholder="Buscar anime por nombre..."
              value={relinkQuery}
              onChange={(e) => setRelinkQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && executeSearch()}
              className="search-input h-10 w-full rounded-lg border border-border bg-surface py-0 pl-9 pr-4 text-sm focus:outline-none transition-[border-color,background-color] hover:border-border-strong"
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
    </>
  );
}
