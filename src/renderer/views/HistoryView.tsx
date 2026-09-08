import { useState, useEffect, useMemo } from 'react';
import { Trash2, History, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog } from '../components/Dialog';
import { useHistory, useHistoryActions } from '../hooks/useQueries';
import { PageHeader } from '../components/ui/PageHeader';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { HistorySkeleton } from '../components/anime/PosterGridSkeleton';
import { groupHistory, type HistoryGroup } from './history/model/historyModel';
import { HistoryGroupCard } from './history/components/HistoryGroupCard';
import { HistoryTable } from './history/components/HistoryTable';
import { useHistoryExpansion } from './history/hooks/useHistoryExpansion';

interface HistoryViewProps {
  isActive?: boolean;
  activeProvider?: string;
  onSelectAnime?: (slug: string) => void;
}

export function HistoryView({ isActive, activeProvider, onSelectAnime }: HistoryViewProps) {
  const { data: history = [], isLoading, isFetching, isError, refetch } = useHistory(isActive ?? false);
  const actions = useHistoryActions();

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

  const handleClearHistory = async () => {
    setClearModal(false);
    actions.clearHistory.mutate(undefined, {
      onSuccess: () => {
        toast.success('Historial limpiado');
        collapseAll();
      },
      onError: () => toast.error('Error al limpiar el historial'),
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
        onError: () => toast.error('Error al eliminar el grupo'),
      },
    );
  };

  const handleOpenFolder = async (fullPath: string, isDirectory = false) => {
    if (!fullPath) return;
    try {
      const sep = fullPath.includes('\\') ? '\\' : '/';
      const folderPath = isDirectory ? fullPath : fullPath.substring(0, fullPath.lastIndexOf(sep));
      const res = await window.api.invoke('open-folder', folderPath || fullPath);
      if (res && res.success === false) {
        toast.error(res.error || 'No se pudo abrir el directorio');
      }
    } catch {
      toast.error('No se pudo abrir el directorio');
    }
  };

  const handleExpandAll = () => expandAll(grouped.map((g) => g.key));

  const pendingDeleteGroup = deleteGroupKey ? grouped.find((g) => g.key === deleteGroupKey) : undefined;

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <PageHeader
        title="Historial"
        description={
          <span className="inline-flex items-center gap-2">
            <span>
              {totalGroups > 0
                ? `${totalGroups} anime${totalGroups !== 1 ? 's' : ''} · ${totalEpisodes} episodio${totalEpisodes !== 1 ? 's' : ''} en total`
                : 'Registro de los resultados de tus descargas'}
            </span>
            {isFetching && !isLoading && totalGroups > 0 && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Actualizando historial" />
            )}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            {totalGroups > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleExpandAll}
                  className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 sm:flex"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>Expandir</span>
                </button>
                <button
                  type="button"
                  onClick={collapseAll}
                  className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 sm:flex"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                  <span>Colapsar</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setClearModal(true)}
              disabled={history.length === 0}
              className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive-fg transition-colors hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/60"
            >
              <Trash2 className="w-4 h-4" />
              <span>Limpiar Todo</span>
            </button>
          </div>
        }
      />

      <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {isLoading ? (
          <HistorySkeleton count={4} />
        ) : isError ? (
          <ErrorState
            title="No se pudo cargar el historial"
            description="No pudimos leer el historial de descargas."
            onRetry={() => refetch()}
          />
        ) : history.length === 0 ? (
          <EmptyState
            icon={<History className="h-6 w-6" aria-hidden="true" />}
            title="Registro aún en blanco"
            description="Los resultados de tus descargas aparecerán aquí cuando completes la primera."
          />
        ) : (
          <>
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
          </>
        )}
      </div>

      <Dialog
        open={clearModal}
        onOpenChange={setClearModal}
        title="Limpiar historial"
        message="Se eliminarán todos los registros del historial de descargas. Esta acción no se puede deshacer."
        confirmLabel="Limpiar Todo"
        onConfirm={handleClearHistory}
      />

      {pendingDeleteGroup && (
        <Dialog
          open={!!pendingDeleteGroup}
          onOpenChange={() => setDeleteGroupKey(null)}
          title="Eliminar grupo"
          message={`¿Eliminar "${pendingDeleteGroup.anime}" y sus ${pendingDeleteGroup.records.length} registro${pendingDeleteGroup.records.length !== 1 ? 's' : ''} del historial?`}
          confirmLabel="Eliminar Grupo"
          onConfirm={() => handleRemoveGroup(pendingDeleteGroup)}
        />
      )}
    </div>
  );
}
