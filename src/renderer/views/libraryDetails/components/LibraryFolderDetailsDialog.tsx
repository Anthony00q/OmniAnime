import { Dialog } from '../../../components/Dialog';
import { formatLibraryFolderDetails } from '../../../utils/libraryFilter';

interface LibraryFolderDetailsDialogProps {
  item: any | null;
  onOpenChange: (open: boolean) => void;
}

export function LibraryFolderDetailsDialog({ item, onOpenChange }: LibraryFolderDetailsDialogProps) {
  const details = item ? formatLibraryFolderDetails(item) : null;
  return (
    <Dialog
      open={item !== null}
      onOpenChange={onOpenChange}
      title={details?.title || 'Detalles'}
      showFooter={false}
      hideDefaultIcon
      className="max-w-2xl"
    >
      {details && (
        <ul className="-mt-1 text-sm">
          <li className="flex items-center justify-between gap-3 border-b border-border/40 py-2.5 last:border-0">
            <span className="shrink-0 text-[13px] text-muted-foreground">Título</span>
            <span className="min-w-0 select-text text-right text-sm font-medium text-foreground">{details.title}</span>
          </li>
          <li className="flex items-start justify-between gap-4 border-b border-border/40 py-2.5 last:border-0">
            <span className="shrink-0 pt-0.5 text-[13px] text-muted-foreground">Títulos alternativos</span>
            {details.alternatives.length > 0 ? (
              <span className="flex min-w-0 max-w-[60%] flex-1 flex-col items-end gap-1.5 text-right">
                {details.alternatives.map((alt) => (
                  <span
                    key={alt}
                    className="block w-fit max-w-full cursor-text select-text whitespace-normal break-words text-sm font-medium leading-[1.55] text-foreground"
                  >
                    {alt}
                  </span>
                ))}
              </span>
            ) : (
              <span className="text-sm font-medium text-muted-foreground">Sin títulos alternativos registrados</span>
            )}
          </li>
          <li className="flex items-center justify-between gap-3 border-b border-border/40 py-2.5 last:border-0">
            <span className="shrink-0 text-[13px] text-muted-foreground">Fuente</span>
            <span className="cursor-text select-text text-sm font-medium text-foreground">{details.providerName}</span>
          </li>
          <li className="flex items-center justify-between gap-3 border-b border-border/40 py-2.5 last:border-0">
            <span className="shrink-0 text-[13px] text-muted-foreground">Carpeta</span>
            <span className="min-w-0 cursor-text truncate select-text font-mono text-xs text-foreground">
              {details.folderName}
            </span>
          </li>
          <li className="flex items-center justify-between gap-3 py-2.5">
            <span className="shrink-0 text-[13px] text-muted-foreground">Episodios</span>
            <span className="cursor-text select-text text-sm font-medium tabular-nums text-foreground">
              {details.episodeCount ?? '—'}
            </span>
          </li>
        </ul>
      )}
    </Dialog>
  );
}
