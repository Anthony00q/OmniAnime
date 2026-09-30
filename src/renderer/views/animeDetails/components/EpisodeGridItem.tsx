import { memo, type MouseEvent as ReactMouseEvent } from 'react';
import { CheckSquare } from 'lucide-react';
import { PosterImage } from '@/renderer/components/anime/PosterImage';

interface EpisodeGridItemProps {
  num: number;
  title?: string;
  thumbnail?: string;
  isChecked: boolean;
  isListView: boolean;
  onToggle: (num: number) => void;
  onContextMenu?: (event: ReactMouseEvent) => void;
}

export const EpisodeGridItem = memo(
  function EpisodeGridItem({
    num,
    title,
    thumbnail,
    isChecked,
    isListView,
    onToggle,
    onContextMenu,
  }: EpisodeGridItemProps) {
    return (
      <button
        type="button"
        onClick={() => onToggle(num)}
        onContextMenu={onContextMenu}
        aria-pressed={isChecked}
        aria-label={`Episodio ${num}${title && title !== 'Sin título' ? `: ${title}` : ''}. Clic derecho para cambiar la vista.`}
        className={`${isListView ? 'details-episode-row' : 'details-episode-card'} group relative flex flex-col overflow-hidden rounded-xl border text-left transition-[background-color,border-color,box-shadow,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${
          isChecked
            ? isListView
              ? 'bg-primary/15 border-primary/70 shadow-[0_8px_24px_rgba(0,0,0,0.35)]'
              : 'bg-primary/10 border-primary shadow-[0_8px_24px_rgba(0,0,0,0.35)]'
            : 'bg-card border-border/50 hover:border-primary/50 hover:bg-secondary/50'
        }`}
      >
        <span className="relative block aspect-video w-full shrink-0 overflow-hidden bg-secondary/50">
          {thumbnail ? (
            <PosterImage
              src={thumbnail}
              alt=""
              className="h-full w-full object-cover"
              fallbackLabel={`EP ${num}`}
              draggable={false}
            />
          ) : (
            <span
              className={`flex h-full w-full flex-col items-center justify-center gap-0.5 py-2 text-center ${isListView ? 'px-7' : 'px-2'}`}
            >
              <span className="max-w-full truncate text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Episodio
              </span>
              <span
                className={`max-w-full truncate text-xl font-bold tabular-nums sm:text-2xl ${isListView && isChecked ? 'text-primary' : 'text-foreground'}`}
              >
                {num}
              </span>
            </span>
          )}
          {isListView ? (
            isChecked && (
              <span className="absolute right-1.5 top-1.5 rounded-full bg-primary p-1 text-primary-foreground shadow-md">
                <CheckSquare className="h-3.5 w-3.5" />
              </span>
            )
          ) : (
            <>
              <span
                aria-hidden="true"
                className={`absolute inset-0 bg-black/45 transition-opacity duration-150 [transition-timing-function:var(--ease-out)] ${
                  isChecked ? 'opacity-100' : 'pointer-events-none opacity-0'
                }`}
              />
              <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white backdrop-blur-sm">
                EP {num}
              </span>
              <span
                aria-hidden="true"
                className={`absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-150 [transition-timing-function:var(--ease-out)] ${
                  isChecked ? 'scale-100 opacity-100' : 'pointer-events-none scale-90 opacity-0'
                }`}
              >
                <span className="rounded-full bg-primary p-2 text-primary-foreground shadow-lg">
                  <CheckSquare className="h-4 w-4" />
                </span>
              </span>
            </>
          )}
        </span>
        {title && title !== 'Sin título' && (
          <span className="block w-full truncate px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground">
            {title}
          </span>
        )}
      </button>
    );
  },
  (prev, next) =>
    prev.isChecked === next.isChecked &&
    prev.num === next.num &&
    prev.title === next.title &&
    prev.thumbnail === next.thumbnail &&
    prev.isListView === next.isListView &&
    prev.onToggle === next.onToggle &&
    prev.onContextMenu === next.onContextMenu,
);
