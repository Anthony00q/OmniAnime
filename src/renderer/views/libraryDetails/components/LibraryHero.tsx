import { FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import { PosterImage } from '../../../components/anime/PosterImage';

interface LibraryHeroProps {
  title: string;
  bannerSrc?: string | null;
  posterLocal?: string | null;
  episodeCount: number;
  metaSlug?: string | null;
  providerId?: string | null;
  activeProvider?: string;
  onSelectAnime?: (slug: string) => void;
}

export function LibraryHero({
  title,
  bannerSrc,
  posterLocal,
  episodeCount,
  metaSlug,
  providerId,
  activeProvider,
  onSelectAnime,
}: LibraryHeroProps) {
  const isProviderMatch = !providerId || providerId === activeProvider;
  const providerName = providerId === 'jkanime' ? 'JkAnime' : 'AnimeAV1';

  return (
    <>
      {bannerSrc && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 w-full h-[40vh] z-0 overflow-hidden"
        >
          <PosterImage
            src={bannerSrc}
            alt={`Banner de ${title}`}
            fallbackLabel={title}
            className="h-full w-full scale-105 object-cover opacity-20 blur-[2px]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/60 to-background"></div>
        </div>
      )}

      <div className="relative z-10 flex shrink-0 flex-col gap-4 px-4 pb-5 sm:flex-row sm:gap-6 sm:px-8 sm:pb-6 md:px-10">
        <button
          type="button"
          aria-label={`Abrir detalles de ${title}`}
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
          className={`relative aspect-[2/3] w-28 shrink-0 self-center overflow-hidden rounded-xl border border-white/10 bg-secondary/50 px-2 text-center shadow-2xl transition-transform duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 sm:w-32 sm:self-end ${metaSlug && isProviderMatch ? 'cursor-pointer motion-safe:hover:scale-105 hover:ring-2 hover:ring-primary hover:shadow-primary/30' : metaSlug ? 'cursor-help' : ''}`}
        >
          <FolderOpen className="absolute left-1/2 top-1/2 z-0 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-muted-foreground/30" />
          <PosterImage
            src={posterLocal || null}
            alt={title}
            fallbackLabel={title}
            className="absolute inset-0 z-10 h-full w-full object-cover"
          />
        </button>
        <div className="flex min-w-0 flex-col justify-center text-center sm:text-left">
          <h1 className="mb-1.5 line-clamp-2 break-words text-2xl font-black leading-tight tracking-tight text-white sm:text-3xl">
            {title}
          </h1>
          <p className="text-[13px] font-medium tabular-nums text-muted-foreground">
            {episodeCount} {episodeCount === 1 ? 'episodio' : 'episodios'} · {providerName}
          </p>
        </div>
      </div>
    </>
  );
}
