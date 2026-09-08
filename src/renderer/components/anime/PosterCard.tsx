import type { ReactNode } from 'react';
import clsx from 'clsx';
import { PosterImage } from './PosterImage';

interface PosterCardProps {
  title: string;
  poster?: string | null;
  fallbackLabel?: string;
  meta?: ReactNode;
  badge?: ReactNode;
  topOverlay?: ReactNode;
  actionLabel?: string;
  actionAlwaysVisible?: boolean;
  priority?: boolean;
  ariaLabel?: string;
  progress?: number;
  onClick: () => void;
}

export function PosterCard({
  title,
  poster,
  fallbackLabel,
  meta,
  badge,
  topOverlay,
  actionLabel,
  actionAlwaysVisible = false,
  priority = false,
  ariaLabel,
  progress,
  onClick,
}: PosterCardProps) {
  const clampedProgress =
    typeof progress === 'number' && Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : undefined;
  const showProgress = clampedProgress !== undefined && clampedProgress > 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel || `Abrir ${title}`}
      className="anime-poster-card sala-frame poster-list-item group relative isolate flex aspect-[2/3] min-w-0 cursor-pointer flex-col overflow-hidden border border-transparent bg-transparent text-left shadow-none transition-[border-color,box-shadow,transform] duration-200 ease-out motion-safe:hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[0_8px_24px_rgba(0,0,0,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <PosterImage
        src={poster}
        alt={title}
        fallbackLabel={fallbackLabel || title}
        priority={priority}
        className="absolute inset-0 z-0 h-full w-full object-cover"
      />

      <div
        aria-hidden="true"
        className="absolute inset-0 z-10 bg-gradient-to-t from-black/90 via-black/40 via-55% to-black/5 opacity-90 transition-opacity duration-200 group-hover:opacity-100"
      />

      {showProgress && (
        <div aria-hidden="true" className="absolute inset-x-0 top-0 z-20 h-[3px] bg-white/10">
          <div className="h-full w-full origin-left bg-primary" style={{ transform: `scaleX(${clampedProgress})` }} />
        </div>
      )}

      {topOverlay && <div className="absolute inset-x-3 top-3 z-20">{topOverlay}</div>}

      {actionLabel && (
        <div
          className={clsx(
            'absolute inset-x-3 bottom-3 z-20 transition-opacity duration-200',
            actionAlwaysVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
          )}
        >
          <span className="block rounded-lg bg-primary/90 px-3 py-2 text-center text-xs font-bold tracking-tight text-primary-foreground shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
            {actionLabel}
          </span>
        </div>
      )}

      <div
        className={clsx(
          'relative z-20 mt-auto min-w-0 p-3.5 transition-[padding-bottom] duration-200 ease-out motion-reduce:transition-none',
          actionLabel && actionAlwaysVisible && 'pb-14',
          // Acción al hover: el texto sube al aparecer el botón en vez de
          // quedar tapado debajo (también con foco por teclado)
          actionLabel && !actionAlwaysVisible && 'group-hover:pb-14 group-focus-visible:pb-14 group-focus-within:pb-14',
        )}
      >
        {badge && <div className="mb-1.5 flex min-w-0 flex-wrap items-center gap-1.5">{badge}</div>}
        {meta && <div className="mb-1.5 flex min-w-0 items-center gap-1.5 overflow-hidden">{meta}</div>}
        <h3 className="sala-poster-title line-clamp-2 min-h-[2.6em] text-[14px] font-semibold leading-snug tracking-tight text-white">
          {title}
        </h3>
      </div>
    </button>
  );
}
