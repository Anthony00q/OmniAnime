import { useState, useEffect, useLayoutEffect, useMemo, useId } from 'react';
import { ScanSearch } from 'lucide-react';
import { useAtomValue, useStore } from 'jotai';
import { activeProviderAtom } from '@/renderer/store/atoms';
import type { LibraryFolder } from '@/services/library/LibraryFileService';
import { useAppNavigation } from '@/renderer/hooks/useAppNavigation';
import { useLibrary } from '@/renderer/hooks/useQueries';
import { LibraryMetadataDialog } from '@/renderer/components/anime/LibraryMetadataDialog';
import { ErrorState } from '@/renderer/components/ui/ErrorState';
import { EmptyState } from '@/renderer/components/ui/EmptyState';
import { SearchField } from '@/renderer/components/ui/SearchField';
import { useBusySpin } from '@/renderer/utils/motion';
import { ScannerCollection } from './components/ScannerCollection';
import { ScannerInspector } from './components/ScannerInspector';
import { ScannerLayout } from './components/ScannerLayout';
import { ScannerToolbar, SCANNER_SEARCH_LABEL } from './components/ScannerToolbar';
import { ScannerSkeleton } from './components/ScannerSkeleton';
import { ScannerLinkDialog } from './components/ScannerLinkDialog';
import { useScannerDirectories } from './hooks/useScannerDirectories';
import { resolveScannerRelinkProvider } from './model/relinkPolicy';
import {
  buildScannerSearchIndex,
  filterScannerFolders,
  getScannerCounts,
  resolveScannerSelection,
  type ScannerFolder,
  type ScannerStatusFilter,
} from './model/scannerModel';

export function ScannerView({ isActive = true }: { isActive?: boolean }) {
  const [selectedDirFilter, setSelectedDirFilter] = useState('all');
  const [folderQuery, setFolderQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ScannerStatusFilter>('all');
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ folder: LibraryFolder; providerId: string; refresh: boolean } | null>(null);
  const inspectorId = useId();
  const activeProvider = useAtomValue(activeProviderAtom);
  const store = useStore();
  const dirs = useScannerDirectories();
  const { data: folders = [], isLoading, isError, isFetching, refetch } = useLibrary(dirs);
  const index = useMemo(() => buildScannerSearchIndex(folders as ScannerFolder[]), [folders]);
  const searched = useMemo(
    () => filterScannerFolders(index, selectedDirFilter, folderQuery, 'all'),
    [index, selectedDirFilter, folderQuery],
  );
  const counts = useMemo(() => getScannerCounts(searched), [searched]);
  const filtered = useMemo(
    () =>
      searched.filter(
        (folder) => statusFilter === 'all' || (statusFilter === 'linked' ? Boolean(folder.metaSlug) : !folder.metaSlug),
      ),
    [searched, statusFilter],
  );
  const selected = resolveScannerSelection(filtered, selectedFolderPath);
  const hasWorkspace = !isLoading && !isError && dirs.length > 0 && filtered.length > 0;
  const [contentPresented, setContentPresented] = useState(false);
  useLayoutEffect(() => {
    if (isActive && hasWorkspace && !contentPresented) setContentPresented(true);
  }, [isActive, hasWorkspace, contentPresented]);
  useEffect(() => {
    if (!isLoading && !isError) setSelectedFolderPath(selected?.path ?? null);
  }, [selected?.path, isLoading, isError]);
  useEffect(() => {
    if (selectedDirFilter !== 'all' && !dirs.includes(selectedDirFilter)) setSelectedDirFilter('all');
  }, [dirs, selectedDirFilter]);
  useEffect(() => {
    if (!isActive || (editing && editing.providerId !== activeProvider)) setEditing(null);
  }, [isActive, activeProvider, editing]);
  const refreshScope = useMemo(() => ({ dirs, isActive }), [dirs, isActive]);
  const refreshSpin = useBusySpin(refreshScope);
  const { setView } = useAppNavigation();
  const openEditor = (folder: LibraryFolder, refresh: boolean) => {
    const providerId = resolveScannerRelinkProvider(folder, store.get(activeProviderAtom));
    if (isActive && providerId) setEditing({ folder, providerId, refresh });
  };
  return (
    <>
      <ScannerLayout
        onRefresh={() => refreshSpin.run(() => refetch())}
        refreshRef={refreshSpin.ref}
        refreshDisabled={dirs.length === 0 || !isActive || isFetching || refreshSpin.busy}
        revealContent={contentPresented}
        toolbar={
          <ScannerToolbar
            dirs={dirs}
            counts={counts}
            isLoading={isLoading}
            selectedDirFilter={selectedDirFilter}
            statusFilter={statusFilter}
            onDirectoryChange={setSelectedDirFilter}
            onStatusChange={setStatusFilter}
            search={
              <SearchField
                value={folderQuery}
                onChange={setFolderQuery}
                onClear={() => setFolderQuery('')}
                placeholder={SCANNER_SEARCH_LABEL}
              />
            }
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
        ) : filtered.length === 0 ? (
          <EmptyState
            variant={folders.length === 0 ? 'page' : 'contextual'}
            isActive={isActive}
            icon={<ScanSearch className="h-10 w-10" aria-hidden="true" />}
            title={folders.length === 0 ? 'No se encontraron carpetas' : 'No hay carpetas que coincidan'}
            description={
              folders.length === 0
                ? 'No se encontraron carpetas de anime en las ubicaciones configuradas.'
                : 'Prueba otro nombre o cambia los filtros.'
            }
            actionLabel={folders.length > 0 ? 'Limpiar filtros' : 'Abrir Ajustes'}
            onAction={() => {
              if (!folders.length) return setView('settings');
              setSelectedDirFilter('all');
              setFolderQuery('');
              setStatusFilter('all');
            }}
          />
        ) : (
          <div className="scanner-workspace">
            <ScannerCollection
              folders={filtered}
              selectedPath={selected?.path ?? ''}
              activeProvider={activeProvider}
              inspectorId={inspectorId}
              onSelect={setSelectedFolderPath}
            />
            {selected && (
              <ScannerInspector
                folder={selected}
                activeProvider={activeProvider}
                id={inspectorId}
                isPending={false}
                onRelink={(folder) => openEditor(folder, false)}
                onRefresh={(folder) => openEditor(folder, true)}
              />
            )}
          </div>
        )}
      </ScannerLayout>
      {isActive &&
        editing?.providerId === activeProvider &&
        (editing.refresh && editing.folder.metaSlug ? (
          <LibraryMetadataDialog
            request={{
              folderPath: editing.folder.path,
              providerId: editing.providerId,
              slug: editing.folder.metaSlug,
              refresh: true,
            }}
            requireActiveProvider
            onClose={() => setEditing(null)}
          />
        ) : (
          <ScannerLinkDialog folder={editing.folder} providerId={editing.providerId} onClose={() => setEditing(null)} />
        ))}
    </>
  );
}
