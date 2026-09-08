import type { ReactNode } from 'react';
import clsx from 'clsx';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  className?: string;
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
}: EmptyStateProps) {
  return (
    <div
      className={clsx(
        'flex h-64 flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground select-none',
        className,
      )}
      role="region"
      aria-label={title}
    >
      {icon && (
        <div className="sala-empty-icon mb-2 shrink-0" aria-hidden="true">
          {icon}
        </div>
      )}
      <div>
        <p className="font-['Plus_Jakarta_Sans',system-ui,sans-serif] text-lg font-extrabold tracking-tight text-foreground">
          {title}
        </p>
        {description && <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed">{description}</p>}
      </div>
      {(actionLabel && onAction) || (secondaryActionLabel && onSecondaryAction) ? (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {actionLabel && onAction && (
            <button
              type="button"
              onClick={onAction}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              {actionLabel}
            </button>
          )}
          {secondaryActionLabel && onSecondaryAction && (
            <button
              type="button"
              onClick={onSecondaryAction}
              className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-secondary px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              {secondaryActionLabel}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
