import { memo } from 'react';
import { Play, Trash2 } from 'lucide-react';
import { EpisodeThumbnail } from '../../../components/EpisodeThumbnail';
import { AppTooltip } from '../../../components/ui/AppTooltip';

export type EpisodeDensity = 'comfortable' | 'compact';

// Nombre legible para el titular; el filename crudo vive en la línea mono.
function prettifyEpisodeName(name: unknown): string {
  const withoutExt = String(name || '').replace(/\.[a-z0-9]{2,5}$/i, '');
  return withoutExt
    .replace(/[_-]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export const EpisodeRow = memo(
  function EpisodeRow({
    ep,
    onPlay,
    onDelete,
    density = 'comfortable',
  }: {
    ep: any;
    onPlay: (path: string) => void;
    onDelete: (path: string) => void;
    density?: EpisodeDensity;
  }) {
    const isCompact = density === 'compact';
    const displayName = prettifyEpisodeName(ep.name) || String(ep.name || '');

    return (
      <div className="library-episode-item group flex min-w-0 flex-col gap-3 rounded-xl border border-transparent bg-transparent p-3 transition-colors hover:bg-secondary/40 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => onPlay(ep.path)}
          aria-label={`Reproducir ${ep.name}`}
          className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 sm:w-auto"
        >
          <EpisodeThumbnail videoPath={ep.path} className={isCompact ? 'sm:w-40' : ''} />
        </button>

        <button
          type="button"
          onClick={() => onPlay(ep.path)}
          title={displayName}
          className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 sm:ml-6"
        >
          <span className="mb-1 block truncate text-[12px] font-medium tabular-nums text-muted-foreground">
            Episodio {ep.episodeNumber || '?'} · {ep.size}
          </span>
          <h4 className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight text-foreground">
            {displayName}
          </h4>
          {!isCompact && (
            <span className="select-text mt-1 block truncate font-mono text-[12px] text-muted-foreground/60">
              {ep.name}
            </span>
          )}
        </button>

        <div className="flex items-center justify-end gap-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <AppTooltip content="Reproducir">
            <button
              type="button"
              onClick={() => onPlay(ep.path)}
              aria-label={`Reproducir ${ep.name}`}
              className="rounded-full bg-primary p-3 text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
            >
              <Play className="h-5 w-5 fill-current" />
            </button>
          </AppTooltip>
          <AppTooltip content="Eliminar archivo">
            <button
              type="button"
              onClick={() => onDelete(ep.path)}
              aria-label={`Eliminar ${ep.name}`}
              className="ml-2 rounded-full p-3 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/60"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </AppTooltip>
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.ep.path === next.ep.path &&
    prev.ep.name === next.ep.name &&
    prev.ep.episodeNumber === next.ep.episodeNumber &&
    prev.ep.size === next.ep.size &&
    prev.ep.ext === next.ep.ext &&
    prev.density === next.density &&
    prev.onPlay === next.onPlay &&
    prev.onDelete === next.onDelete,
);
