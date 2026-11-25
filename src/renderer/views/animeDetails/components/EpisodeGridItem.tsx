import { memo } from 'react';
import { Ban, CheckSquare, TriangleAlert, VolumeX } from 'lucide-react';
import { PosterImage } from '@/renderer/components/anime/PosterImage';
import { AppTooltip } from '@/renderer/components/ui/AppTooltip';
import type { EpisodeAvailability } from '@/types/anime';

interface EpisodeGridItemProps {
  num: number;
  title?: string;
  thumbnail?: string;
  isChecked: boolean;
  isListView: boolean;
  availability?: EpisodeAvailability | 'pending';
  onToggle: (num: number) => void;
}

export const EpisodeGridItem = memo(
  function EpisodeGridItem({
    num,
    title,
    thumbnail,
    isChecked,
    isListView,
    availability,
    onToggle,
  }: EpisodeGridItemProps) {
    const blocked = availability !== undefined && availability !== 'available';
    const showThumbnail = !isListView && Boolean(thumbnail);
    const stateLabel =
      availability === 'pending'
        ? 'DUB sin comprobar'
        : availability === 'unavailable'
          ? 'Sin DUB'
          : availability === 'unsupported'
            ? 'Sin servidor compatible'
            : availability === 'error'
              ? 'No se pudo comprobar DUB'
              : '';
    const StateIcon =
      availability === 'unavailable'
        ? VolumeX
        : availability === 'unsupported'
          ? Ban
          : availability === 'error'
            ? TriangleAlert
            : null;
    return (
      <AppTooltip
        content={stateLabel || `Episodio ${num}`}
        enabled={availability === 'unsupported' || availability === 'error'}
      >
        <button
          type="button"
          onClick={() => {
            if (!blocked) onToggle(num);
          }}
          aria-pressed={isChecked}
          aria-disabled={blocked || undefined}
          aria-describedby={availability ? 'dub-availability-note' : undefined}
          data-episode-number={num}
          aria-label={`Episodio ${num}${title && title !== 'Sin título' ? `: ${title}` : ''}${stateLabel ? `. ${stateLabel}` : ''}`}
          className={`${isListView ? 'details-episode-row' : 'details-episode-card'} ${blocked ? 'cursor-not-allowed' : ''} @container/episode-tile group relative flex flex-col overflow-hidden rounded-xl border text-left transition-[background-color,border-color,box-shadow,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${
            isChecked
              ? isListView
                ? 'bg-primary/15 border-primary/70 shadow-[0_8px_24px_rgba(0,0,0,0.35)]'
                : 'bg-primary/10 border-primary shadow-[0_8px_24px_rgba(0,0,0,0.35)]'
              : blocked
                ? 'bg-card border-border/50'
                : 'bg-card border-border/50 hover:border-primary/50 hover:bg-secondary/50'
          }`}
        >
          <span
            className={`relative aspect-video w-full shrink-0 overflow-hidden bg-secondary/50 ${showThumbnail ? 'block' : isListView ? 'flex min-h-12' : 'flex min-h-[76px] @[128px]/episode-tile:min-h-[60px]'}`}
          >
            {showThumbnail ? (
              <PosterImage src={thumbnail} alt="" className="h-full w-full object-cover" />
            ) : (
              <span
                className={`flex w-full flex-col items-center justify-center gap-0.5 px-1.5 text-center ${isListView ? '' : 'pt-6 pb-1.5 @[128px]/episode-tile:py-2'}`}
              >
                <span
                  className={`text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground ${isListView ? 'max-w-[calc(100%-2.75rem)] truncate leading-3.5' : 'max-w-full leading-4'}`}
                >
                  Episodio
                </span>
                <span
                  className={`max-w-full text-xl font-bold tabular-nums ${isListView ? 'leading-6 sm:text-2xl/6' : 'leading-7 sm:text-2xl/7'} ${isChecked ? 'text-primary' : blocked ? 'text-muted-foreground' : 'text-foreground'}`}
                >
                  {num}
                </span>
              </span>
            )}
            {showThumbnail && (
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute inset-0 bg-background/50 transition-opacity duration-[var(--duration-motion-micro)] motion-reduce:transition-none ${blocked ? 'opacity-100' : 'opacity-0'}`}
              />
            )}
            {!showThumbnail ? (
              isChecked && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute right-1.5 top-1.5 rounded-full bg-primary p-0.5 text-primary-foreground shadow-md @[128px]/episode-tile:p-1"
                >
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
                  className={`pointer-events-none absolute inset-0 flex items-start justify-end p-1.5 transition-[opacity,transform] duration-150 [transition-timing-function:var(--ease-out)] @[160px]/episode-tile:items-center @[160px]/episode-tile:justify-center ${
                    isChecked ? 'scale-100 opacity-100' : 'scale-90 opacity-0'
                  }`}
                >
                  <span className="rounded-full bg-primary p-1 text-primary-foreground shadow-md @[160px]/episode-tile:p-2 @[160px]/episode-tile:shadow-lg">
                    <CheckSquare className="size-3.5 @[160px]/episode-tile:size-4" />
                  </span>
                </span>
              </>
            )}
            {StateIcon && (
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute right-1.5 top-1.5 ${showThumbnail ? '' : '@[128px]/episode-tile:top-auto @[128px]/episode-tile:bottom-1.5'} flex size-5 items-center justify-center rounded-md bg-background/90 text-muted-foreground`}
              >
                <StateIcon className="h-3 w-3" />
              </span>
            )}
          </span>
          {title && title !== 'Sin título' && (
            <span className="block w-full truncate px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground">
              {title}
            </span>
          )}
        </button>
      </AppTooltip>
    );
  },
  (prev, next) =>
    prev.isChecked === next.isChecked &&
    prev.num === next.num &&
    prev.title === next.title &&
    prev.thumbnail === next.thumbnail &&
    prev.isListView === next.isListView &&
    prev.availability === next.availability &&
    prev.onToggle === next.onToggle,
);
