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
        'relative z-20 shrink-0 border-b border-border/40 bg-background/75 backdrop-blur-sm',
        isCentered ? 'px-4 pb-6 pt-8 text-center sm:px-8 sm:pb-7 sm:pt-10' : 'px-4 pb-5 pt-6 sm:px-8 sm:pt-7',
        className,
      )}
    >
      <div
        className={clsx(isCentered ? 'flex flex-col items-center' : 'flex flex-wrap items-end justify-between gap-4')}
      >
        <div className={clsx('min-w-0', isCentered ? 'max-w-3xl' : 'flex-1')}>
          <h1
            className={clsx(
              'break-words font-extrabold tracking-tight',
              isCentered ? 'text-3xl sm:text-4xl' : 'text-3xl',
            )}
          >
            {title}
          </h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className={clsx('shrink-0', isCentered && 'mt-5')}>{actions}</div>}
      </div>
      {children && <div className={clsx(isCentered ? 'mx-auto mt-6 w-full max-w-md sm:mt-7' : 'mt-5')}>{children}</div>}
    </header>
  );
}
