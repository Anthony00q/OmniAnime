import { SkeletonCard } from '../ui/Skeleton';

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
    <div className="space-y-3" role="status" aria-label="Cargando episodios" aria-busy="true">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="library-episode-item flex min-w-0 flex-col gap-3 rounded-xl border border-transparent bg-transparent p-3 sm:flex-row sm:items-center"
          aria-hidden="true"
        >
          <div className="h-24 w-full shrink-0 animate-pulse rounded-lg bg-secondary/60 sm:h-[108px] sm:w-48" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-24 animate-pulse rounded bg-secondary/40" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-secondary/60" />
            <div className="h-3 w-full animate-pulse rounded bg-secondary/30" />
          </div>
          <div className="hidden h-8 w-20 shrink-0 animate-pulse rounded-full bg-secondary/50 sm:block" />
        </div>
      ))}
    </div>
  );
}

export function QueueSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div
      className="mx-auto w-full max-w-4xl space-y-2.5 xl:max-w-6xl 2xl:max-w-7xl"
      role="status"
      aria-label="Cargando descargas"
      aria-busy="true"
    >
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm"
          aria-hidden="true"
        >
          <div className="flex min-w-0 flex-row">
            <div className="w-16 shrink-0 self-stretch animate-pulse bg-secondary/40 sm:w-[72px] min-h-[108px]" />
            <div className="min-w-0 flex-1 p-3">
              <div className="mb-2 h-4 w-2/3 animate-pulse rounded bg-secondary/60" />
              <div className="mb-2 flex gap-1.5">
                <div className="h-5 w-16 animate-pulse rounded-full bg-secondary/50" />
                <div className="h-5 w-20 animate-pulse rounded-md bg-secondary/50" />
              </div>
              <div className="h-1.5 w-full animate-pulse rounded-full bg-secondary/50" />
              <div className="mt-1.5 h-3 w-1/3 animate-pulse rounded bg-secondary/30" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function HistorySkeleton({ count = 5 }: { count?: number }) {
  return (
    <div
      className="mx-auto w-full max-w-5xl space-y-3 xl:max-w-6xl 2xl:max-w-7xl"
      role="status"
      aria-label="Cargando historial"
      aria-busy="true"
    >
      <div
        className="hidden overflow-hidden rounded-xl border border-border/50 bg-card shadow-sm lg:block"
        aria-hidden="true"
      >
        <div className="h-10 animate-pulse bg-secondary/50" />
        {Array.from({ length: count }).map((_, idx) => (
          <div key={`t-${idx}`} className="flex items-center gap-4 border-t border-border/30 px-4 py-3.5">
            <div className="h-7 w-7 animate-pulse rounded-md bg-secondary/40" />
            <div className="h-3 w-20 animate-pulse rounded bg-secondary/40" />
            <div className="h-5 w-16 animate-pulse rounded-md bg-secondary/30" />
            <div className="h-4 flex-1 max-w-[260px] animate-pulse rounded bg-secondary/50" />
            <div className="h-6 w-20 animate-pulse rounded-md bg-secondary/40" />
            <div className="h-5 w-16 animate-pulse rounded-full bg-secondary/30" />
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
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="h-4 w-32 animate-pulse rounded bg-secondary/60" />
              <div className="h-5 w-16 animate-pulse rounded-full bg-secondary/40" />
            </div>
            <div className="h-5 w-48 animate-pulse rounded bg-secondary/50" />
            <div className="mt-3 flex gap-2">
              <div className="h-6 w-20 animate-pulse rounded-md bg-secondary/40" />
              <div className="h-6 w-24 animate-pulse rounded-md bg-secondary/30" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
