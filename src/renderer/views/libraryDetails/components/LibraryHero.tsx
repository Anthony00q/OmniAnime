import type { MouseEvent as ReactMouseEvent } from 'react';
import { FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import { PosterImage } from '../../../components/anime/PosterImage';
import { getLibraryPrimaryAlternative } from '../../../utils/libraryFilter';

interface LibraryHeroBannerProps {
  title: string;
  bannerSrc?: string | null;
  onDimNode?: (node: HTMLDivElement | null) => void;
}

// Fondo fijo del hero: vive fuera del scroller para que el banner no se mueva.
export function LibraryHeroBanner({ title, bannerSrc, onDimNode }: LibraryHeroBannerProps) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 z-0 h-[46vh] min-h-[240px] w-full overflow-hidden bg-background"
    >
      {bannerSrc && (
        <div ref={onDimNode} className="absolute inset-0">
          <PosterImage
            src={bannerSrc}
            alt={`Banner de ${title}`}
            fallbackLabel={title}
            className="h-full w-full object-cover object-[center_20%]"
          />
        </div>
      )}
      {bannerSrc ? (
        <>
          <div aria-hidden="true" className="absolute inset-0 bg-black/20" />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-r from-background/80 via-background/35 to-transparent"
          />
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-b from-transparent to-background"
          />
        </>
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-b from-secondary/20 via-background/60 to-background"
        />
      )}
    </div>
  );
}

interface LibraryHeroProps {
  title: string;
  posterLocal?: string | null;
  episodeCount: number;
  metaSlug?: string | null;
  providerId?: string | null;
  secondaryTitle?: string | null;
  alternativeTitles?: string[];
  activeProvider?: string;
  onSelectAnime?: (slug: string) => void;
  onPosterContextMenu?: (event: ReactMouseEvent) => void;
}

export function LibraryHero({
  title,
  posterLocal,
  episodeCount,
  metaSlug,
  providerId,
  secondaryTitle,
  alternativeTitles,
  activeProvider,
  onSelectAnime,
  onPosterContextMenu,
}: LibraryHeroProps) {
  const isProviderMatch = !providerId || providerId === activeProvider;
  const providerName = providerId === 'jkanime' ? 'JkAnime' : 'AnimeAV1';
  const primaryAlternative = getLibraryPrimaryAlternative({ title, secondaryTitle, alternativeTitles, providerId });

  return (
    <div className="relative z-10 flex shrink-0 flex-col gap-4 px-4 pb-5 sm:flex-row sm:gap-6 sm:px-8 sm:pb-6 md:px-10">
      <button
        type="button"
        aria-label={`Abrir detalles de ${title}${onPosterContextMenu ? '. Clic derecho para más opciones.' : ''}`}
        onClick={() => {
          if (metaSlug && onSelectAnime) {
            if (isProviderMatch) {
              onSelectAnime(metaSlug);
            } else {
              toast.info(
                `Cambia al proveedor ${providerName} en el panel izquierdo para ver la información de este anime.`,
              );
            }
          } else if (!metaSlug) {
            toast.error('Anime no identificado con el catálogo online.');
          }
        }}
        onContextMenu={onPosterContextMenu}
        className={`group relative z-10 aspect-[2/3] w-28 shrink-0 self-center overflow-hidden rounded-xl border border-white/10 bg-secondary/50 px-2 text-center shadow-2xl transition-shadow duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 sm:w-32 sm:self-end ${metaSlug && isProviderMatch ? 'cursor-pointer hover:ring-2 hover:ring-primary' : metaSlug ? 'cursor-help' : ''}`}
      >
        <FolderOpen className="absolute left-1/2 top-1/2 z-0 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-muted-foreground/30" />
        <PosterImage
          src={posterLocal || null}
          alt={title}
          fallbackLabel={title}
          className="absolute inset-0 z-10 h-full w-full transform-gpu object-cover transition-transform duration-300 ease-out motion-safe:group-hover:scale-105"
        />
      </button>
      <div className="relative z-10 flex min-w-0 flex-col justify-center text-center sm:text-left">
        <h1 className="mb-1.5 line-clamp-2 cursor-text select-text break-words text-2xl font-bold leading-tight tracking-[-0.025em] text-white sm:text-3xl">
          {title}
        </h1>
        {primaryAlternative && (
          <h2
            title={primaryAlternative}
            className="mb-1.5 line-clamp-1 select-text cursor-text break-words text-base font-medium text-white/65 sm:text-xl"
          >
            {primaryAlternative}
          </h2>
        )}
        <p className="text-[13px] font-medium tabular-nums text-muted-foreground">
          {episodeCount} {episodeCount === 1 ? 'episodio' : 'episodios'}{' '}
          <span aria-hidden="true" className="text-border-strong">
            |
          </span>{' '}
          {providerName}
        </p>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-b from-transparent to-background"
      />
    </div>
  );
}
