import { memo, type MouseEvent as ReactMouseEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { EpisodeThumbnail } from '@/renderer/components/EpisodeThumbnail';
import { AppTooltip } from '@/renderer/components/ui/AppTooltip';
import { buildLibraryEpisodeTitle } from '@/renderer/views/library/libraryEpisodePresentation';

export const EpisodeRow = memo(
  function EpisodeRow({
    ep,
    onPlay,
    onDelete,
    onContextMenu,
    thumbToken = 0,
  }: {
    ep: any;
    onPlay: (path: string) => void;
    onDelete: (path: string) => void;
    onContextMenu: (
      event: ReactMouseEvent<HTMLButtonElement> | ReactKeyboardEvent<HTMLButtonElement>,
      path: string,
    ) => void;
    thumbToken?: number;
  }) {
    const displayName = buildLibraryEpisodeTitle(ep.name, ep.episodeNumber);
    const episodeLabel = `Episodio ${ep.episodeNumber ?? '?'}`;

    return (
      <article className="library-episode-item min-w-0">
        <button
          type="button"
          onClick={() => onPlay(ep.path)}
          onContextMenu={(event) => onContextMenu(event, ep.path)}
          onKeyDown={(event) => {
            if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
              onContextMenu(event, ep.path);
            }
          }}
          aria-label={`Reproducir ${ep.name}`}
          aria-description="Clic derecho para ver los detalles del archivo."
          aria-keyshortcuts="Shift+F10"
          data-keep-focus
          className="library-episode-open group/episode-thumb w-full min-w-0 rounded-lg"
        >
          <EpisodeThumbnail videoPath={ep.path} thumbToken={thumbToken} />
        </button>
        <div className="library-episode-file flex min-w-0 items-start gap-3">
          <div className="library-episode-title min-w-0 select-none">
            <span className="line-clamp-2 text-base font-semibold leading-snug tracking-tight text-foreground/75">
              {displayName}
            </span>
            {displayName !== episodeLabel && (
              <span className="mt-1 block text-[13px] tabular-nums text-muted-foreground">{episodeLabel}</span>
            )}
          </div>
          <AppTooltip content="Eliminar archivo">
            <button
              type="button"
              onClick={() => onDelete(ep.path)}
              aria-label={`Eliminar ${ep.name}`}
              data-keep-focus
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive-fg"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </AppTooltip>
        </div>
      </article>
    );
  },
  (prev, next) =>
    prev.ep.path === next.ep.path &&
    prev.ep.name === next.ep.name &&
    prev.ep.episodeNumber === next.ep.episodeNumber &&
    prev.ep.size === next.ep.size &&
    prev.ep.ext === next.ep.ext &&
    prev.thumbToken === next.thumbToken &&
    prev.onPlay === next.onPlay &&
    prev.onContextMenu === next.onContextMenu &&
    prev.onDelete === next.onDelete,
);
