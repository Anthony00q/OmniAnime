import type { ReactNode } from 'react';
import clsx from 'clsx';

interface PosterGridProps {
  children: ReactNode;
  className?: string;
}

export function PosterGrid({ children, className }: PosterGridProps) {
  return (
    <div
      className={clsx(
        'grid grid-cols-2 gap-4 gap-y-6 pt-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7',
        className,
      )}
    >
      {children}
    </div>
  );
}
