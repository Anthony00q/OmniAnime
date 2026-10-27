import { Suspense, useRef, type ReactNode } from 'react';
import { useLocation } from '@tanstack/react-router';
import clsx from 'clsx';
import { ErrorBoundary } from './ErrorBoundary';
import { LoadingState } from './ui/LoadingState';
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
  useScrollMemory(containerRef, pathname, { rememberPosition: scope !== 'ui:settings' });

  return (
    <ErrorBoundary scope={scope}>
      <div
        ref={containerRef}
        data-titlebar-offset={titlebarOffset || undefined}
        className={clsx(
          'flex-1 overflow-hidden flex flex-col',
          animateEntry && 'view-enter',
          titlebarOffset && 'pt-10',
        )}
      >
        <Suspense fallback={<LoadingState className="min-h-0 flex-1" />}>{children}</Suspense>
      </div>
    </ErrorBoundary>
  );
}
