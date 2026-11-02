import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
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
  actionTone?: 'primary' | 'secondary';
  disabled?: boolean;
  describedBy?: string;
  priority?: boolean;
  ariaLabel?: string;
  progress?: number;
  onClick: () => void;
  onContextMenu?: (event: ReactMouseEvent) => void;
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
  actionTone = 'primary',
  disabled = false,
  describedBy,
  priority = false,
  ariaLabel,
  progress,
  onClick,
  onContextMenu,
}: PosterCardProps) {
  const clampedProgress =
    typeof progress === 'number' && Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : undefined;
  const showProgress = clampedProgress !== undefined && clampedProgress > 0;
  return (
    <button
      type="button"
      disabled={disabled}
      aria-describedby={describedBy}
      onClick={onClick}
      onContextMenu={onContextMenu}
      aria-label={
        onContextMenu
          ? `${ariaLabel || `Abrir ${title}`}. Clic derecho para más opciones.`
          : ariaLabel || `Abrir ${title}`
      }
      className={clsx(
        'anime-poster-card poster-list-item group relative isolate aspect-[2/3] w-full min-w-0 overflow-hidden bg-background text-left focus-visible:outline-none',
        actionLabel && 'poster-card-with-action',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
      )}
    >
      <div className="poster-card-image absolute inset-0 overflow-hidden">
        <PosterImage
          src={poster}
          alt={title}
          fallbackLabel={fallbackLabel}
          priority={priority}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>
      <div className="poster-card-caption absolute inset-x-0 bottom-0 z-10 min-w-0 p-3">
        {actionLabel && (
          <div
            className={clsx(
              'poster-card-action mb-3 transition-opacity duration-(--duration-motion-micro) motion-reduce:transition-none',
              actionAlwaysVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
            )}
          >
            <span
              className={clsx(
                'block rounded-lg px-3 py-2 text-center text-xs font-semibold',
                disabled
                  ? 'bg-surface-elevated text-muted-foreground'
                  : actionTone === 'secondary'
                    ? 'border border-border-strong bg-surface-elevated text-foreground'
                    : 'bg-primary/90 text-primary-foreground',
              )}
            >
              {actionLabel}
            </span>
          </div>
        )}
        <h3 className="sala-poster-title font-sans line-clamp-2 min-h-10 break-words text-[14px] font-semibold leading-5 text-foreground">
          {title}
        </h3>
        <div className="poster-card-meta mt-2 flex h-5 min-w-0 items-center gap-1 overflow-hidden">
          {badge}
          {meta}
        </div>
      </div>
      <div
        aria-hidden="true"
        className={clsx(
          'poster-card-outline pointer-events-none absolute inset-0 z-20 rounded-xl border border-transparent transition-colors duration-(--duration-motion-micro) motion-reduce:transition-none',
          !disabled &&
            'group-hover:border-foreground/32 group-focus-visible:border-2 group-focus-visible:border-primary',
        )}
      />
      {showProgress && (
        <div aria-hidden="true" className="absolute inset-x-0 top-0 z-30 h-[3px] bg-white/10">
          <div className="h-full w-full origin-left bg-primary" style={{ transform: `scaleX(${clampedProgress})` }} />
        </div>
      )}
      {topOverlay && <div className="absolute inset-x-3 top-3 z-30">{topOverlay}</div>}
    </button>
  );
}
