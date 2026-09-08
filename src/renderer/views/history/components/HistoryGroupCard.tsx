import { memo } from 'react';
import { Trash2, FolderOpen, ChevronRight, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { AppTooltip } from '../../../components/ui/AppTooltip';
import { HistoryEpisodesBadge } from './HistoryEpisodesBadge';
import { ProviderBadge } from './ProviderBadge';
import { deriveGroupDisplay, formatHistoryReason, getGroupStatus, type HistoryGroup } from '../model/historyModel';

interface HistoryGroupCardProps {
  group: HistoryGroup;
  isExpanded: boolean;
  expandedReasons: Set<string>;
  activeProvider?: string;
  onSelectAnime?: (slug: string) => void;
  onToggleGroup: (key: string) => void;
  onToggleReason: (key: string) => void;
  onOpenFolder: (fullPath: string, isDirectory?: boolean) => void;
  onDeleteGroup: (key: string) => void;
}

export const HistoryGroupCard = memo(function HistoryGroupCard({
  group,
  isExpanded,
  expandedReasons,
  activeProvider,
  onSelectAnime,
  onToggleGroup,
  onToggleReason,
  onOpenFolder,
  onDeleteGroup,
}: HistoryGroupCardProps) {
  const status = getGroupStatus(group);
  const { folderPath, folderIsDirectory, visibleRecords } = deriveGroupDisplay(group);
  const canOpenDetails = Boolean(
    onSelectAnime && group.slug && group.providerId && group.providerId === activeProvider,
  );
  const groupProviderName =
    group.providerId === 'jkanime' ? 'JkAnime' : group.providerId === 'animeav1' ? 'AnimeAV1' : 'el proveedor original';
  return (
    <article className="history-row overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => onToggleGroup(group.key)}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? 'Colapsar grupo' : 'Expandir grupo'}
            className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => {
                if (canOpenDetails) onSelectAnime?.(group.slug);
                else if (group.providerId)
                  toast.info(`Cambia al proveedor ${groupProviderName} para ver los detalles de este anime.`);
              }}
              aria-label={
                canOpenDetails
                  ? `Abrir detalles de ${group.anime}`
                  : `Cambiar a ${groupProviderName} para ver detalles de ${group.anime}`
              }
              aria-describedby={!canOpenDetails && group.providerId ? `hint-card-${group.key}` : undefined}
              className={`sala-poster-title line-clamp-2 text-left text-[15px] font-semibold leading-snug transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${canOpenDetails ? 'text-foreground hover:text-primary' : 'text-foreground/70 hover:text-foreground'}`}
            >
              {group.anime}
            </button>
            {!canOpenDetails && group.providerId && (
              <span id={`hint-card-${group.key}`} className="sr-only">
                Cambia al proveedor {groupProviderName} para abrir los detalles
              </span>
            )}
            {!canOpenDetails && group.providerId && (
              <p className="mt-0.5 text-[11px] font-medium text-warning">Cambiar a {groupProviderName}</p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs tabular-nums text-muted-foreground">
              <span>{group.lastDate}</span>
              <span aria-hidden="true">•</span>
              <ProviderBadge providerId={group.providerId} />
            </div>
            {group.dirLabel && (
              <AppTooltip content={group.dirFullPath} side="bottom" align="start">
                <div className="mt-1 inline-flex min-w-0 max-w-full items-center gap-1 text-[11px] text-muted-foreground">
                  <FolderOpen className="h-3 w-3 shrink-0" />
                  <span className="truncate">{group.dirLabel}</span>
                </div>
              </AppTooltip>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <HistoryEpisodesBadge
            requestedCount={group.requestedCount}
            failCount={group.failCount}
            cancelledCount={group.cancelledCount}
            unstartedCount={group.unstartedCount}
          />
          <StatusBadge label={status.label} variant={status.variant} />
        </div>
        <div className="mt-3 flex items-center gap-2 border-t border-border/50 pt-3">
          <button
            type="button"
            onClick={() => onOpenFolder(folderPath || '', folderIsDirectory)}
            disabled={!folderPath}
            className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <FolderOpen className="h-3.5 w-3.5" /> Abrir
          </button>
          <button
            type="button"
            onClick={() => onDeleteGroup(group.key)}
            aria-label={`Eliminar historial de ${group.anime}`}
            className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/60"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div
        className="history-detail-shell border-t border-transparent"
        data-state={isExpanded ? 'open' : 'closed'}
        aria-hidden={!isExpanded}
      >
        <div className="history-detail-shell-content">
          <div className="px-4 pb-4 pt-1">
            <div className="space-y-2">
              {visibleRecords.map(({ record, originalIndex }) => {
                const isQueueEvent = record.scope === 'queue';
                const queueLabel =
                  group.unstartedCount > 0 ? `Cola · ${group.unstartedCount} no iniciados` : 'Cola cancelada';
                const recordReason = formatHistoryReason(record);
                const recordVariant =
                  record.status === 'ok' ? 'success' : record.status === 'cancelled' ? 'cancelled' : 'danger';
                return (
                  <div
                    key={record._dbId ?? originalIndex}
                    className="history-detail-row flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-card/50 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {isQueueEvent ? queueLabel : `Episodio ${record.episode}`}
                      </p>
                      <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">{record.date}</p>
                      {recordReason && (
                        <div className="mt-1 min-w-0 text-xs leading-relaxed text-muted-foreground">
                          <AppTooltip content={recordReason}>
                            <span
                              className={
                                expandedReasons.has(String(record._dbId ?? originalIndex))
                                  ? 'block w-fit max-w-full break-words select-text'
                                  : 'line-clamp-2 block w-fit max-w-full break-words select-text'
                              }
                            >
                              {recordReason}
                            </span>
                          </AppTooltip>
                          {recordReason.length > 80 && (
                            <button
                              type="button"
                              onClick={() => onToggleReason(String(record._dbId ?? originalIndex))}
                              className="mt-1 text-[11px] font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
                              aria-expanded={expandedReasons.has(String(record._dbId ?? originalIndex))}
                            >
                              {expandedReasons.has(String(record._dbId ?? originalIndex)) ? 'Ver menos' : 'Ver más'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <StatusBadge
                      label={record.status === 'ok' ? 'Éxito' : record.status === 'cancelled' ? 'Cancelado' : 'Falló'}
                      variant={recordVariant}
                      className="shrink-0 px-2 py-0.5 text-[11px]"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
});
