import type { ReactNode } from 'react';
import clsx from 'clsx';
import { useEmptyBreathing } from '@/renderer/utils/motion';
import { EMPTY_ICON_OPACITY } from '@/renderer/utils/motion/tokens';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  className?: string;
  variant?: 'page' | 'contextual' | 'compact';
  breathing?: boolean;
  isActive?: boolean;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  className,
  variant = 'compact',
  breathing = true,
  isActive = true,
}: EmptyStateProps) {
  const isPage = variant === 'page';
  const iconRef = useEmptyBreathing(isPage && breathing && isActive && !!icon);

  return (
    <div
      className={clsx(
        'empty-state-enter flex min-w-0 flex-col items-center justify-center text-center text-muted-foreground select-none',
        isPage
          ? 'flex-1 shrink-0 gap-5 px-6 py-12'
          : variant === 'contextual'
            ? 'min-h-80 gap-4 px-6 py-10'
            : 'min-h-64 gap-3 p-6',
        className,
      )}
      role="region"
      aria-label={title}
      data-empty-variant={variant}
    >
      {icon && (
        <div className="empty-state-enter-icon mb-2 shrink-0" aria-hidden="true">
          <div
            ref={iconRef}
            className={clsx('empty-state-icon', isPage ? 'text-primary' : 'text-muted-foreground opacity-55')}
            style={isPage ? { opacity: EMPTY_ICON_OPACITY } : undefined}
          >
            {icon}
          </div>
        </div>
      )}
      <div className="w-full max-w-md">
        <p
          className={clsx('font-display font-bold tracking-[-0.015em] text-foreground', isPage ? 'text-xl' : 'text-lg')}
        >
          {title}
        </p>
        {description && (
          <p className={clsx('mx-auto text-sm leading-relaxed', isPage ? 'mt-3' : 'mt-1 max-w-sm')}>{description}</p>
        )}
      </div>
      {(actionLabel && onAction) || (secondaryActionLabel && onSecondaryAction) ? (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {actionLabel && onAction && (
            <button
              type="button"
              onClick={onAction}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-[color-mix(in_srgb,var(--color-primary)_88%,black)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              {actionLabel}
            </button>
          )}
          {secondaryActionLabel && onSecondaryAction && (
            <button
              type="button"
              onClick={onSecondaryAction}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border/60 bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              {secondaryActionLabel}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
