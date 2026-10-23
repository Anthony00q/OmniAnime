import type { ReactNode } from 'react';
import clsx from 'clsx';

interface PageHeaderProps {
  title: string;
  description?: string | ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  align?: 'start' | 'center';
  className?: string;
}

export function PageHeader({ title, description, actions, children, align = 'start', className }: PageHeaderProps) {
  const isCentered = align === 'center';

  return (
    <header
      className={clsx(
        'relative z-20 shrink-0 bg-background/75 backdrop-blur-sm',
        isCentered ? 'px-4 pb-5 pt-6 text-center sm:px-8 sm:pt-7' : 'px-4 pb-5 pt-6 sm:px-8 sm:pt-7',
        className,
      )}
    >
      <div
        className={clsx(
          isCentered
            ? clsx('relative flex flex-wrap items-center justify-center gap-3', actions && 'sm:px-32')
            : 'flex flex-wrap items-end justify-between gap-4',
        )}
      >
        <div className={clsx('min-w-0', isCentered ? 'max-w-3xl' : 'flex-1')}>
          <h1 className={clsx('break-words font-bold tracking-[-0.025em]', isCentered ? 'text-[32px]' : 'text-[28px]')}>
            {title}
          </h1>
          {description && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>}
        </div>
        {actions && (
          <div className={clsx('shrink-0', isCentered && 'sm:absolute sm:right-0 sm:top-1/2 sm:-translate-y-1/2')}>
            {actions}
          </div>
        )}
      </div>
      {children && <div className={clsx(isCentered ? 'mx-auto mt-4 w-full max-w-md' : 'mt-5')}>{children}</div>}
    </header>
  );
}
