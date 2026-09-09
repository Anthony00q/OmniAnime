import clsx from 'clsx';

interface ProgressBarProps {
  value?: number;
  indeterminate?: boolean;
  variant?: 'primary' | 'success' | 'danger' | 'warning' | 'neutral';
  label?: string;
  showValue?: boolean;
  className?: string;
  'aria-valuetext'?: string;
}

const fillClasses = {
  primary: 'bg-primary',
  success: 'bg-success',
  danger: 'bg-destructive',
  warning: 'bg-warning',
  // Estado en reposo (pausa/cola): visible sin voz de aviso.
  neutral: 'bg-muted-foreground/60',
};

export function ProgressBar({
  value = 0,
  indeterminate = false,
  variant = 'primary',
  label,
  showValue = false,
  className,
  'aria-valuetext': ariaValueText,
}: ProgressBarProps) {
  const safeValue = Math.max(0, Math.min(100, value));

  return (
    <div className={clsx('flex items-center gap-3', className)}>
      <div
        className="h-2 flex-1 overflow-hidden rounded-full bg-secondary"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : safeValue}
        aria-valuetext={ariaValueText}
      >
        <div
          className={clsx(
            'h-full w-full rounded-full progress-fill transition-transform duration-300 ease-out',
            fillClasses[variant],
            indeterminate && 'progress-indeterminate opacity-60',
          )}
          style={indeterminate ? undefined : { transform: `scaleX(${safeValue / 100})` }}
        />
      </div>
      {showValue && <span className="w-10 text-right text-xs font-bold text-muted-foreground">{safeValue}%</span>}
    </div>
  );
}
