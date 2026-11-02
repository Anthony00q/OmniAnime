import clsx from 'clsx';

interface SkeletonProps {
  className?: string;
  ariaLabel?: string;
}

export function Skeleton({ className, ariaLabel }: SkeletonProps) {
  return (
    <div
      className={clsx('animate-pulse rounded-md bg-secondary/60', className)}
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      role={ariaLabel ? 'status' : undefined}
    />
  );
}

export function SkeletonCard() {
  return (
    <div
      className="poster-list-item relative aspect-[2/3] w-full min-w-0 overflow-hidden rounded-xl bg-background"
      aria-hidden="true"
    >
      <div className="poster-card-image absolute inset-0 animate-pulse bg-secondary/40" />
      <div className="poster-card-caption absolute inset-x-0 bottom-0 min-w-0 p-3">
        <div className="flex h-10 flex-col gap-2 py-1">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
        <Skeleton className="mt-2 h-5 w-2/3" />
      </div>
    </div>
  );
}
