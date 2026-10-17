import { Dialog } from '@/renderer/components/Dialog';
import { buildLibraryEpisodeDetails } from '@/renderer/views/library/libraryEpisodePresentation';

interface LibraryEpisodeDetailsDialogProps {
  episode: Parameters<typeof buildLibraryEpisodeDetails>[0] | null;
  onOpenChange: (open: boolean) => void;
}

export function LibraryEpisodeDetailsDialog({ episode, onOpenChange }: LibraryEpisodeDetailsDialogProps) {
  const details = episode ? buildLibraryEpisodeDetails(episode) : null;
  return (
    <Dialog
      open={episode !== null}
      onOpenChange={onOpenChange}
      title="Detalles del episodio"
      showFooter={false}
      hideDefaultIcon
      className="max-w-lg"
    >
      {details && (
        <dl className="text-sm">
          {[
            ['Episodio', details.episode],
            ['Archivo', details.fileName],
            ['Tamaño', details.size],
            ['Formato', details.format],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex items-start justify-between gap-6 border-b border-border/40 py-3 last:border-0"
            >
              <dt className="shrink-0 text-[13px] text-muted-foreground">{label}</dt>
              <dd
                className={`min-w-0 select-text break-all text-right font-medium text-foreground ${label === 'Archivo' ? 'font-mono text-xs' : 'tabular-nums'}`}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Dialog>
  );
}
