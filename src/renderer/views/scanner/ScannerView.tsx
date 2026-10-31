import { useCallback, useState, useEffect, useMemo, useRef, useId } from 'react';
import { ScanSearch, RefreshCcw, Link, Link2, Search, Loader2 } from 'lucide-react';
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
import { PosterImage } from '@/renderer/components/anime/PosterImage';
import { ErrorState } from '@/renderer/components/ui/ErrorState';
import { EmptyState } from '@/renderer/components/ui/EmptyState';
import { PageHeader } from '@/renderer/components/ui/PageHeader';
import { AppTooltip } from '@/renderer/components/ui/AppTooltip';
import { SearchField } from '@/renderer/components/ui/SearchField';
import { useBusySpin } from '@/renderer/utils/motion';
import { ScannerCollection } from './components/ScannerCollection';
import { ScannerInspector } from './components/ScannerInspector';
import {
  buildScannerSearchIndex,
  filterScannerFolders,
  getScannerCounts,
  getScannerDirectoryLabel,
  resolveScannerSelection,
  type ScannerFolder,
  type ScannerStatusFilter,
} from './model/scannerModel';
import './scanner.css';

export function ScannerView({ isActive = true }: { isActive?: boolean }) {
  const [selectedDirFilter, setSelectedDirFilter] = useState<string>('all');
  const [folderQuery, setFolderQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ScannerStatusFilter>('all');
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null);
  const inspectorId = useId();

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
    <div className="scanner-surface empty-state-page flex flex-col h-full bg-background">
      <PageHeader
        title="Escáner de librería"
        description="Revisa los vínculos de tus carpetas locales"
        className="scanner-header sticky top-0"
        actions={
          <button
            onClick={handleRefresh}
            data-keep-focus
            disabled={dirs.length === 0 || !isActive || isFetching || refreshSpin.busy}
            className="flex min-h-11 items-center gap-2 rounded-lg border border-border/60 px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-default disabled:opacity-50"
          >
            <RefreshCcw ref={refreshSpin.ref} className="w-4 h-4" aria-hidden="true" />
            <span>Escanear directorio</span>
          </button>
        }
      />

      <div data-empty-filters className="scanner-toolbar shrink-0">
        <div className="scanner-locations">
          {dirs.length > 1 && (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Ubicación de las carpetas">
              {['all', ...dirs].map((dir) => (
                <button
                  key={dir}
                  data-keep-focus
                  onClick={() => setSelectedDirFilter(dir)}
                  aria-pressed={selectedDirFilter === dir}
                  className={`relative h-8 max-w-[200px] shrink-0 truncate rounded-full border px-3 text-[13px] font-medium transition-colors after:absolute after:-inset-y-1.5 after:inset-x-0 ${
                    selectedDirFilter === dir
                      ? 'border-primary/30 bg-primary/15 text-primary'
                      : 'border-border/70 bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground'
                  }`}
                >
                  {dir === 'all' ? 'Todas' : getScannerDirectoryLabel(dir)}
                </button>
              ))}
            </div>
          )}
          <span className="ml-auto text-[13px] font-medium tabular-nums text-text-tertiary">
            {isLoading ? '—' : counts.all} {counts.all === 1 ? 'carpeta' : 'carpetas'}
          </span>
        </div>
        <SearchField
          value={folderQuery}
          onChange={setFolderQuery}
          onClear={() => setFolderQuery('')}
          placeholder="Buscar en tus carpetas"
        />
        <div className="scanner-status-filters" role="group" aria-label="Estado del vínculo">
          {(
            [
              ['all', 'Todas'],
              ['missing', 'Sin vínculo'],
              ['linked', 'Vinculadas'],
            ] as const
          ).map(([status, label]) => (
            <button
              key={status}
              data-keep-focus
              className="scanner-status-filter"
              aria-pressed={statusFilter === status}
              onClick={() => setStatusFilter(status)}
            >
              {label}
              <span>{isLoading ? '—' : counts[status]}</span>
            </button>
          ))}
        </div>
      </div>

      <div
        data-view-scroller
        className="scanner-scroller empty-state-scroller min-h-0 flex-1 overflow-y-auto p-4 sm:px-8 sm:py-6 [scrollbar-gutter:stable]"
      >
        {isLoading ? (
          <div className="scanner-workspace" role="status" aria-label="Cargando carpetas">
            <div className="scanner-collection" aria-hidden="true">
              <div className="scanner-section-heading">
                <div className="h-5 w-20 rounded bg-secondary" />
              </div>
              <div className="scanner-folder-list">
                {Array.from({ length: 5 }, (_, index) => (
                  <div key={index} className="scanner-folder-button">
                    <div className="scanner-folder-poster bg-secondary" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-4 w-3/4 rounded bg-secondary" />
                      <div className="h-3 w-1/2 rounded bg-secondary" />
                      <div className="h-3 w-16 rounded bg-secondary" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="scanner-inspector" aria-hidden="true">
              <div className="scanner-inspector-heading">
                <div className="scanner-inspector-poster bg-secondary" />
                <div className="w-full space-y-3">
                  <div className="h-3 w-20 rounded bg-secondary" />
                  <div className="h-6 w-3/4 rounded bg-secondary" />
                </div>
              </div>
              <div className="scanner-inspector-fields space-y-6">
                {Array.from({ length: 4 }, (_, index) => (
                  <div key={index} className="h-12 rounded bg-secondary/50" />
                ))}
              </div>
            </div>
          </div>
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
