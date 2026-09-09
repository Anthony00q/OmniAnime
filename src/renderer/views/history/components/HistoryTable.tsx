import { Fragment, memo } from 'react';
import { Trash2, FolderOpen, ChevronRight, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { AppTooltip } from '../../../components/ui/AppTooltip';
import { HistoryEpisodesBadge } from './HistoryEpisodesBadge';
import { ProviderBadge } from './ProviderBadge';
import {
  deriveGroupDisplay,
  formatHistoryReason,
  getGroupDisplayReason,
  getGroupStatus,
  type HistoryGroup,
} from '../model/historyModel';

interface HistoryTableProps {
  grouped: HistoryGroup[];
  expandedGroups: Set<string>;
  expandedReasons: Set<string>;
  activeProvider?: string;
  onSelectAnime?: (slug: string) => void;
  onToggleGroup: (key: string) => void;
  onToggleReason: (key: string) => void;
  onOpenFolder: (fullPath: string, isDirectory?: boolean) => void;
  onDeleteGroup: (key: string) => void;
}

// Pura en props: el memo exige props estables.
export const HistoryTable = memo(function HistoryTable({
  grouped,
  expandedGroups,
  expandedReasons,
  activeProvider,
  onSelectAnime,
  onToggleGroup,
  onToggleReason,
  onOpenFolder,
  onDeleteGroup,
}: HistoryTableProps) {
  return (
    <div
      className="mx-auto hidden w-full max-w-5xl overflow-x-auto rounded-xl border border-border/50 bg-card shadow-sm lg:block xl:max-w-6xl 2xl:max-w-7xl"
      role="region"
      aria-label="Historial agrupado por anime — tabla"
    >
      <table className="w-full min-w-[860px] border-collapse text-left" aria-label="Historial agrupado por anime">
        <caption className="sr-only">Historial agrupado por anime, proveedor y destino</caption>
        <thead>
          <tr className="bg-secondary/50 text-muted-foreground text-xs uppercase tracking-wider">
            <th scope="col" className="p-4 font-semibold w-12"></th>
            <th scope="col" className="p-4 font-semibold">
              Fecha
            </th>
            <th scope="col" className="p-4 font-semibold">
              Proveedor
            </th>
            <th scope="col" className="p-4 font-semibold">
              Anime
            </th>
            <th scope="col" className="p-4 font-semibold">
              Episodios
            </th>
            <th scope="col" className="p-4 font-semibold">
              Estado
            </th>
            <th scope="col" className="p-4 font-semibold">
              Motivo
            </th>
            <th scope="col" className="p-4 font-semibold text-center">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {grouped.map((group) => {
            const isExpanded = expandedGroups.has(group.key);
            const status = getGroupStatus(group);
            const { text: groupReason, extra: groupReasonExtra } = getGroupDisplayReason(group);
            const { folderPath, folderIsDirectory, visibleRecords } = deriveGroupDisplay(group);
            const canOpenDetails = Boolean(
              onSelectAnime && group.slug && group.providerId && group.providerId === activeProvider,
            );
            const groupProviderName =
              group.providerId === 'jkanime'
                ? 'JkAnime'
                : group.providerId === 'animeav1'
                  ? 'AnimeAV1'
                  : 'el proveedor original';

            return (
              <Fragment key={group.key}>
                <tr className="history-row hover:bg-secondary/30 transition-colors group border-b border-border/20">
                  <td className="px-4 py-3.5">
                    <AppTooltip content={isExpanded ? 'Colapsar' : 'Desglosar'}>
                      <button
                        type="button"
                        onClick={() => onToggleGroup(group.key)}
                        aria-expanded={isExpanded}
                        aria-label={isExpanded ? 'Colapsar grupo' : 'Expandir grupo'}
                        className="relative inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        )}
                      </button>
                    </AppTooltip>
                  </td>
                  <td className="px-4 py-3.5 text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                    {group.lastDate}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <ProviderBadge providerId={group.providerId} />
                  </td>
                  <td className="px-4 py-3.5">
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
                      aria-describedby={!canOpenDetails && group.providerId ? `hint-table-${group.key}` : undefined}
                      className={`sala-poster-title line-clamp-2 max-w-[260px] text-left text-[15px] font-semibold leading-snug transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                        canOpenDetails
                          ? 'text-foreground hover:text-primary cursor-pointer'
                          : 'text-foreground/70 hover:text-foreground cursor-pointer'
                      }`}
                    >
                      {group.anime}
                    </button>
                    {!canOpenDetails && group.providerId && (
                      <span id={`hint-table-${group.key}`} className="sr-only">
                        Cambia al proveedor {groupProviderName} para abrir los detalles
                      </span>
                    )}
                    {group.dirLabel && (
                      <AppTooltip content={group.dirFullPath} side="bottom" align="start">
                        <div className="mt-1 flex max-w-full items-center gap-1 text-[11px] text-muted-foreground">
                          <FolderOpen className="w-3 h-3 shrink-0" />
                          <span className="truncate max-w-[180px]">{group.dirLabel}</span>
                        </div>
                      </AppTooltip>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <HistoryEpisodesBadge
                      requestedCount={group.requestedCount}
                      failCount={group.failCount}
                      cancelledCount={group.cancelledCount}
                      unstartedCount={group.unstartedCount}
                    />
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge label={status.label} variant={status.variant} />
                  </td>
                  <td className="px-4 py-3.5">
                    {groupReason ? (
                      <div className="max-w-[180px]">
                        <AppTooltip content={groupReason}>
                          <span className="line-clamp-2 block w-fit max-w-full break-words text-xs leading-relaxed text-muted-foreground select-text">
                            {groupReason}
                          </span>
                        </AppTooltip>
                        {groupReasonExtra > 0 && (
                          <span className="mt-0.5 inline-block text-[11px] font-medium text-destructive-fg">
                            +{groupReasonExtra} más
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground/30" aria-hidden="true">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenFolder(folderPath || '', folderIsDirectory)}
                        disabled={!folderPath}
                        className="inline-flex h-7 items-center justify-center gap-1.5 rounded-md bg-secondary px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                      >
                        <FolderOpen className="w-3.5 h-3.5" /> Abrir
                      </button>
                      <AppTooltip content="Eliminar grupo">
                        <button
                          type="button"
                          onClick={() => onDeleteGroup(group.key)}
                          aria-label={`Eliminar historial de ${group.anime}`}
                          className="relative inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/80 transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-destructive/10 hover:text-destructive-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/60"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </AppTooltip>
                    </div>
                  </td>
                </tr>

                <tr>
                  <td colSpan={8} className="p-0">
                    <div className="history-detail-shell" data-state={isExpanded ? 'open' : 'closed'}>
                      <div className="history-detail-shell-content">
                        <ul className="space-y-2 px-4 pb-4 pt-1">
                          {visibleRecords.map(({ record, originalIndex }) => {
                            const isQueueEvent = record.scope === 'queue';
                            const queueLabel =
                              group.unstartedCount > 0
                                ? `Cola · ${group.unstartedCount} no iniciados`
                                : 'Cola cancelada';
                            const recordVariant =
                              record.status === 'ok'
                                ? 'success'
                                : record.status === 'cancelled'
                                  ? 'cancelled'
                                  : 'danger';
                            const recordReason = formatHistoryReason(record);
                            return (
                              <li
                                key={record._dbId ?? originalIndex}
                                className="history-detail-row flex items-center justify-between gap-3 rounded-lg border border-border/40 bg-card/50 px-3 py-2.5"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-foreground">
                                    {isQueueEvent ? queueLabel : `Episodio ${record.episode}`}
                                  </p>
                                  <p className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">{record.date}</p>
                                  {recordReason ? (
                                    <div className="mt-1">
                                      <AppTooltip content={recordReason}>
                                        <span
                                          className={
                                            expandedReasons.has(String(record._dbId ?? originalIndex))
                                              ? 'block w-fit max-w-full break-words text-xs leading-relaxed text-muted-foreground select-text'
                                              : 'line-clamp-2 block w-fit max-w-full break-words text-xs leading-relaxed text-muted-foreground select-text'
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
                                        >
                                          {expandedReasons.has(String(record._dbId ?? originalIndex))
                                            ? 'Ver menos'
                                            : 'Ver más'}
                                        </button>
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                                <StatusBadge
                                  label={
                                    record.status === 'ok'
                                      ? 'Éxito'
                                      : record.status === 'cancelled'
                                        ? 'Cancelado'
                                        : 'Falló'
                                  }
                                  variant={recordVariant}
                                  className="shrink-0 px-2 py-0.5 text-[11px]"
                                />
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </div>
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});
