import type { ReactNode } from 'react';
import clsx from 'clsx';

export type StatusVariant = 'success' | 'danger' | 'warning' | 'info' | 'cancelled' | 'neutral';

interface StatusBadgeProps {
  label: string;
  variant: StatusVariant;
  icon?: ReactNode;
  className?: string;
}

const variantClasses: Record<StatusVariant, string> = {
  success: 'border-success/20 bg-success/10 text-success',
  danger: 'border-destructive/20 bg-destructive/10 text-destructive-fg',
  warning: 'border-warning/20 bg-warning/10 text-warning',
  info: 'border-info/20 bg-info/10 text-info',
  cancelled: 'border-border/70 bg-secondary text-muted-foreground',
  neutral: 'border-border/70 bg-secondary text-muted-foreground',
};

export function StatusBadge({ label, variant, icon, className }: StatusBadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
        variantClasses[variant],
        className,
      )}
    >
      {icon}
      {label}
    </span>
  );
}
