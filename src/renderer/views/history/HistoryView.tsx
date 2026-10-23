import { useState, useEffect, useMemo, useCallback } from 'react';
import { Trash2, History, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '@/renderer/components/Dialog';
import { useHistory, useHistoryActions } from '@/renderer/hooks/useQueries';
import { isIpcFailError, unwrap } from '@/renderer/hooks/queries/unwrap';
import { PageHeader } from '@/renderer/components/ui/PageHeader';
import { ErrorState } from '@/renderer/components/ui/ErrorState';
import { EmptyState } from '@/renderer/components/ui/EmptyState';
import { LoadingState } from '@/renderer/components/ui/LoadingState';
import { groupHistory, type HistoryGroup } from './model/historyModel';
import { HistoryGroupCard } from './components/HistoryGroupCard';
import { HistoryTable } from './components/HistoryTable';
import { useDesktopBreakpoint } from '@/renderer/hooks/useDesktopBreakpoint';
import { useHistoryExpansion } from './hooks/useHistoryExpansion';
import { useAppNavigation } from '@/renderer/hooks/useAppNavigation';

interface HistoryViewProps {
  isActive?: boolean;
  activeProvider?: string;
  onSelectAnime?: (slug: string) => void;
}

export function HistoryView({ isActive, activeProvider, onSelectAnime }: HistoryViewProps) {
  const { data: history = [], isLoading, isFetching, isError, refetch } = useHistory(isActive ?? false);
  const actions = useHistoryActions();
  const { navigateToCatalog } = useAppNavigation();

  const [clearModal, setClearModal] = useState(false);
  const [deleteGroupKey, setDeleteGroupKey] = useState<string | null>(null);
  const {
    expandedGroups,
    expandedReasons,
    toggleGroup,
    toggleReason,
    expandAll,
    collapseAll,
    clearReasons,
    setExpandedGroups,
  } = useHistoryExpansion();

  useEffect(() => {
    if (isActive === false) {
      setClearModal(false);
      setDeleteGroupKey(null);
      clearReasons();
    }
  }, [isActive, clearReasons]);

  const grouped = useMemo(() => groupHistory(history), [history]);
  const totalEpisodes = grouped.reduce((total, group) => total + group.requestedCount, 0);
  const totalGroups = grouped.length;
  const isDesktopLayout = useDesktopBreakpoint();

  const handleClearHistory = async () => {
    setClearModal(false);
    actions.clearHistory.mutate(undefined, {
      onSuccess: () => {
        toast.success('Historial limpiado');
        collapseAll();
      },
      onError: (error) => {
        if (!isIpcFailError(error)) toast.error('Error al limpiar el historial');
      },
    });
  };

  const handleRemoveGroup = async (group: HistoryGroup) => {
    setDeleteGroupKey(null);
    const indices = group.records.map((record) => record.originalIndex);
    const recordIds = group.records.map(({ record }) => record._dbId);
    const expectedIds = recordIds.some((id) => typeof id !== 'number') ? undefined : (recordIds as number[]);
    actions.removeHistoryEntries.mutate(
      { indices, expectedIds },
      {
        onSuccess: () => {
          toast.success(`Grupo eliminado (${group.records.length} registro${group.records.length !== 1 ? 's' : ''})`);
          setExpandedGroups((prev) => {
            const next = new Set(prev);
            next.delete(group.key);
            return next;
          });
        },
        onError: (error) => {
          if (!isIpcFailError(error)) toast.error('Error al eliminar el grupo');
        },
      },
    );
  };

  // Estable para que el memo de HistoryTable sea efectivo.
  const handleOpenFolder = useCallback(async (fullPath: string, isDirectory = false) => {
    if (!fullPath) return;
    try {
      const sep = fullPath.includes('\\') ? '\\' : '/';
      const folderPath = isDirectory ? fullPath : fullPath.substring(0, fullPath.lastIndexOf(sep));
      unwrap(await window.api.invoke('open-folder', folderPath || fullPath));
    } catch (error) {
      if (!isIpcFailError(error)) toast.error('No se pudo abrir el directorio');
    }
  }, []);

  const handleExpandAll = () => expandAll(grouped.map((g) => g.key));

  const pendingDeleteGroup = deleteGroupKey ? grouped.find((g) => g.key === deleteGroupKey) : undefined;

  if (isLoading) {
    return <LoadingState className="min-h-0 flex-1 bg-background" label="Cargando historial" />;
  }

  return (
    <div className="empty-state-page flex h-full min-w-0 flex-col bg-background">
      <PageHeader
        className="overflow-y-hidden [scrollbar-gutter:stable] [&>div]:mx-auto [&>div]:w-full [&>div]:max-w-2xl lg:[&>div]:max-w-5xl xl:[&>div]:max-w-6xl 2xl:[&>div]:max-w-7xl"
        title="Historial"
        description={
          <span className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-2">
              <span>
                {totalGroups > 0 ? (
                  <>
                    {totalGroups}
                    {` grupo${totalGroups !== 1 ? 's' : ''} `}
                    <span aria-hidden="true" className="text-border-strong">
                      |
                    </span>{' '}
                    {totalEpisodes}
                    {` episodio${totalEpisodes !== 1 ? 's' : ''} en este historial`}
                  </>
                ) : (
                  'Registro de los resultados de tus descargas'
                )}
              </span>
              {isFetching && !isLoading && totalGroups > 0 && (
                <Loader2
                  className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground"
                  aria-label="Actualizando historial"
                />
              )}
            </span>
            <span className="text-xs">Se conservan los últimos 200 registros.</span>
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            {totalGroups > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleExpandAll}
                  className="hidden min-h-11 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 sm:flex"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>Expandir</span>
                </button>
                <button
                  type="button"
                  onClick={collapseAll}
                  className="hidden min-h-11 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 sm:flex"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                  <span>Colapsar</span>
                </button>
              </>
            )}
            {history.length > 0 && (
              <button
                type="button"
                onClick={() => setClearModal(true)}
                disabled={history.length === 0 || actions.clearHistory.isPending}
                className="flex min-h-11 items-center gap-2 rounded-lg border border-border/60 px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                <Trash2 className="w-4 h-4" />
                <span>Limpiar todo</span>
              </button>
            )}
          </div>
        }
      />

      <div
        data-view-scroller
        className="empty-state-scroller min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:px-8 sm:py-6 [scrollbar-gutter:stable]"
        aria-busy={isLoading}
      >
        {isError ? (
          <ErrorState
            title="No se pudo cargar el historial"
            description="No pudimos leer el historial de descargas."
            onRetry={() => refetch()}
          />
        ) : history.length === 0 ? (
          <EmptyState
            variant="page"
            isActive={isActive}
            icon={<History className="h-6 w-6" aria-hidden="true" />}
            title="Registro aún en blanco"
            description="Aquí aparecerán los resultados de tus descargas, incluidos los fallos y las cancelaciones."
            actionLabel="Explorar catálogo"
            onAction={() => navigateToCatalog()}
          />
        ) : (
          <>
            {isDesktopLayout ? (
              <HistoryTable
                grouped={grouped}
                expandedGroups={expandedGroups}
                expandedReasons={expandedReasons}
                activeProvider={activeProvider}
                onSelectAnime={onSelectAnime}
                onToggleGroup={toggleGroup}
                onToggleReason={toggleReason}
                onOpenFolder={handleOpenFolder}
                onDeleteGroup={setDeleteGroupKey}
              />
            ) : (
              <div className="mx-auto flex max-w-2xl flex-col gap-3 lg:hidden">
                {grouped.map((group) => (
                  <HistoryGroupCard
                    key={group.key}
                    group={group}
                    isExpanded={expandedGroups.has(group.key)}
                    expandedReasons={expandedReasons}
                    activeProvider={activeProvider}
                    onSelectAnime={onSelectAnime}
                    onToggleGroup={toggleGroup}
                    onToggleReason={toggleReason}
                    onOpenFolder={handleOpenFolder}
                    onDeleteGroup={setDeleteGroupKey}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <Dialog
        open={clearModal}
        onOpenChange={setClearModal}
        title="Limpiar historial"
        danger
        message="Se eliminarán todos los registros del historial. Los archivos descargados se conservan. Esta acción no se puede deshacer."
        confirmLabel="Limpiar todo"
        onConfirm={handleClearHistory}
      />

      {pendingDeleteGroup && (
        <Dialog
          open={!!pendingDeleteGroup}
          onOpenChange={() => setDeleteGroupKey(null)}
          title="Eliminar grupo"
          danger
          message={`¿Eliminar ${pendingDeleteGroup.records.length} registro${pendingDeleteGroup.records.length !== 1 ? 's' : ''} de "${pendingDeleteGroup.anime}" del historial? Los archivos descargados se conservan.`}
          confirmLabel="Eliminar grupo"
          onConfirm={() => handleRemoveGroup(pendingDeleteGroup)}
        />
      )}
    </div>
  );
}
