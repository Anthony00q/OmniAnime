import { Suspense, useRef, type ReactNode } from 'react';
import { useLocation } from '@tanstack/react-router';
import clsx from 'clsx';
import { ErrorBoundary } from './ErrorBoundary';
import { useScrollMemory } from '@/renderer/hooks/useScrollMemory';

// El offset del titlebar solo se omite cuando la vista va a sangre (ficha y librería).
export function ViewPanel({
  scope,
  children,
  titlebarOffset = true,
  animateEntry = true,
}: {
  scope: string;
  children: ReactNode;
  titlebarOffset?: boolean;
  animateEntry?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  useScrollMemory(containerRef, pathname);

  return (
    <ErrorBoundary scope={scope}>
      <div
        ref={containerRef}
        className={clsx(
          'flex-1 overflow-hidden flex flex-col',
          animateEntry && 'view-enter',
          titlebarOffset && 'pt-10',
        )}
      >
        <Suspense fallback={null}>{children}</Suspense>
      </div>
    </ErrorBoundary>
  );
}
