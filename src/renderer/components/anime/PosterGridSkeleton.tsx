import { useEffect, useState } from 'react';
import { SkeletonCard } from '@/renderer/components/ui/Skeleton';

interface PosterGridSkeletonProps {
  count?: number;
  className?: string;
}

export function PosterGridSkeleton({ count = 12, className }: PosterGridSkeletonProps) {
  return (
    <div
      className={
        className ??
        'grid grid-cols-2 gap-4 gap-y-6 pt-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7'
      }
      role="status"
      aria-label="Cargando contenido"
      aria-busy="true"
    >
      {Array.from({ length: count }).map((_, idx) => (
        <SkeletonCard key={idx} />
      ))}
    </div>
  );
}

export function EpisodeListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="library-episodes-grid" role="status" aria-label="Cargando episodios" aria-busy="true">
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="library-episode-item min-w-0" aria-hidden="true">
          <div className="library-episode-open">
            <div className="aspect-video w-full animate-pulse rounded-lg bg-secondary/60" />
          </div>
          <div className="library-episode-file flex min-w-0 items-start gap-3">
            <div className="library-episode-title min-w-0">
              <div className="h-5 w-3/4 animate-pulse rounded bg-secondary/60" />
            </div>
            <div className="h-11 w-11 shrink-0 animate-pulse rounded-lg bg-secondary/30" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function QueueSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div
      className="mx-auto w-full max-w-[1600px] space-y-3"
      role="status"
      aria-label="Cargando descargas"
      aria-busy="true"
    >
      {Array.from({ length: count }).map((_, idx) => (
        <div key={idx} className="overflow-hidden rounded-xl border border-border/50 bg-card" aria-hidden="true">
          <div className="flex min-w-0 items-start gap-3 px-3 py-3 sm:gap-4 sm:px-4 sm:py-4">
            <div className="aspect-[2/3] w-16 shrink-0 animate-pulse rounded-lg bg-secondary/40 sm:w-[72px]" />
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex flex-wrap justify-between gap-3">
                <div className="min-w-0 flex-[1_1_220px] space-y-2">
                  <div className="h-5 w-2/3 animate-pulse rounded bg-secondary/60" />
                  <div className="h-4 w-3/4 animate-pulse rounded bg-secondary/30" />
                </div>
                <div className="flex gap-0.5">
                  {Array.from({ length: 3 }).map((_, action) => (
                    <div key={action} className="h-11 w-11 animate-pulse rounded-lg bg-secondary/30" />
                  ))}
                </div>
              </div>
              <div className="flex h-5 items-center gap-3">
                <div className="h-2 flex-1 animate-pulse rounded-full bg-secondary/50" />
                <div className="h-4 w-[4ch] animate-pulse rounded bg-secondary/30" />
              </div>
              <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
                <div className="h-4 w-2/3 animate-pulse rounded bg-secondary/30" />
                <div className="h-7 w-24 animate-pulse rounded bg-secondary/30" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ScheduleSkeleton({ count = 7 }: { count?: number }) {
  return (
    <ul className="pt-2" role="status" aria-label="Cargando horario" aria-busy="true">
      {Array.from({ length: count }).map((_, idx) => (
        <li key={idx} aria-hidden="true">
          <div className="flex items-baseline gap-3 pb-1 pt-5">
            <div className="h-4 w-12 animate-pulse rounded bg-secondary/50" />
            <div className="h-px flex-1 self-center bg-secondary/30" />
          </div>
          <div className="schedule-row flex items-center gap-4 border-b border-border/40 px-2 py-4">
            <div className="h-[96px] w-[64px] shrink-0 animate-pulse rounded bg-secondary/40" />
            <div className="min-w-0 flex-1">
              <div className="h-4 w-2/3 animate-pulse rounded bg-secondary/60" />
            </div>
            <div className="h-7 w-32 shrink-0 animate-pulse rounded-full bg-secondary/40" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function HistorySkeleton({ count = 5 }: { count?: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 200);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="mx-auto w-full max-w-2xl space-y-3 lg:max-w-5xl xl:max-w-6xl 2xl:max-w-7xl"
      role="status"
      aria-label="Cargando historial"
      aria-busy="true"
    >
      <div
        className="hidden overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm lg:block"
        aria-hidden="true"
      >
        <div className="h-16 animate-pulse bg-secondary/50" />
        {Array.from({ length: count }).map((_, idx) => (
          <div
            key={`t-${idx}`}
            className="flex min-h-[84px] min-w-[860px] items-center gap-4 border-t border-border/30 px-4 py-3.5"
          >
            <div className="h-7 w-7 shrink-0 animate-pulse rounded-md bg-secondary/40" />
            <div className="h-8 w-24 shrink-0 animate-pulse rounded bg-secondary/40" />
            <div className="h-5 w-24 shrink-0 animate-pulse rounded-md bg-secondary/30" />
            <div className="h-8 min-w-[220px] flex-1 animate-pulse rounded bg-secondary/50" />
            <div className="h-8 w-36 shrink-0 animate-pulse rounded bg-secondary/40" />
            <div className="h-5 w-20 shrink-0 animate-pulse rounded-full bg-secondary/30" />
            <div className="h-7 w-24 shrink-0 animate-pulse rounded-md bg-secondary/40" />
          </div>
        ))}
      </div>
      <div className="space-y-3 lg:hidden">
        {Array.from({ length: count }).map((_, idx) => (
          <div
            key={`c-${idx}`}
            className="overflow-hidden rounded-xl border border-border/50 bg-card p-4 shadow-sm"
            aria-hidden="true"
          >
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 shrink-0 animate-pulse rounded-md bg-secondary/40" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-5 w-2/3 animate-pulse rounded bg-secondary/60" />
                <div className="h-5 w-48 max-w-full animate-pulse rounded bg-secondary/40" />
                <div className="h-3 w-20 animate-pulse rounded bg-secondary/40" />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="h-6 w-32 animate-pulse rounded bg-secondary/40" />
              <div className="h-5 w-20 animate-pulse rounded-full bg-secondary/30" />
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3">
              <div className="h-7 w-20 animate-pulse rounded-md bg-secondary/40" />
              <div className="h-8 w-8 animate-pulse rounded-md bg-secondary/30" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
