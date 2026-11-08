import type { ReactNode, Ref } from 'react';
import clsx from 'clsx';

export const POSTER_GRID_CLASSES =
  'grid grid-cols-2 gap-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7';

interface PosterGridProps {
  children: ReactNode;
  className?: string;
  ref?: Ref<HTMLDivElement>;
}

export function PosterGrid({ children, className, ref }: PosterGridProps) {
  return (
    <div ref={ref} className={clsx(POSTER_GRID_CLASSES, 'pt-2', className)}>
      {children}
    </div>
  );
}
