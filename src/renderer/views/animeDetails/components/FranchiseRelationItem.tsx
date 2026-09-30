import { useLayoutEffect, useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAtomValue } from 'jotai';
import { activeProviderAtom } from '@/renderer/store/atoms';
import { prefetchAnimeDetails } from '@/renderer/hooks/useQueries';
import { AppTooltip } from '@/renderer/components/ui/AppTooltip';
import { PosterImage } from '@/renderer/components/anime/PosterImage';

export function FranchiseRelationItem({
  rel,
  onSelectAnime,
}: {
  rel: { slug?: string; title?: string; poster?: string | null; type?: string };
  onSelectAnime?: (slug: string) => void;
}) {
  const titleRef = useRef<HTMLSpanElement | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const queryClient = useQueryClient();
  const providerId = useAtomValue(activeProviderAtom);

  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const check = () => {
      setIsTruncated(el.scrollHeight > el.clientHeight + 1);
    };
    check();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [rel.title]);

  const row = (
    <button
      type="button"
      onClick={() => {
        if (rel.slug) {
          prefetchAnimeDetails(queryClient, providerId, rel.slug);
          if (onSelectAnime) onSelectAnime(rel.slug);
          else if ((window as any).openAnime) (window as any).openAnime(rel.slug);
        } else {
          toast.error('No se pudo navegar: falta el identificador');
        }
      }}
      className="-mx-2 flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      <PosterImage
        src={rel.poster}
        alt={rel.title ?? ''}
        fallbackLabel={rel.title}
        className="h-16 w-12 shrink-0 rounded-md bg-secondary object-cover"
      />
      <div className="flex flex-col min-w-0">
        <span className="text-[11px] font-bold text-primary uppercase tracking-wider">{rel.type}</span>
        <span ref={titleRef} className="text-sm font-medium text-foreground line-clamp-2 leading-tight">
          {rel.title}
        </span>
      </div>
    </button>
  );

  if (!isTruncated || !rel.title) return row;
  return (
    <AppTooltip content={rel.title} side="top" align="start">
      {row}
    </AppTooltip>
  );
}
