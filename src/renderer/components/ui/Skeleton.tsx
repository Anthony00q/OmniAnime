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
      className="poster-list-item flex aspect-[2/3] flex-col overflow-hidden rounded-[12px] border border-transparent bg-transparent"
      aria-hidden="true"
    >
      <div className="relative flex-1 overflow-hidden bg-secondary/40">
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-secondary/60 via-secondary/30 to-secondary/60" />
        <div className="absolute bottom-0 left-0 right-0 p-3.5">
          <Skeleton className="mb-2 h-2.5 w-16 rounded-full bg-white/10" />
          <Skeleton className="h-3 w-full rounded bg-white/15" />
          <Skeleton className="mt-1.5 h-3 w-3/4 rounded bg-white/10" />
        </div>
      </div>
    </div>
  );
}
