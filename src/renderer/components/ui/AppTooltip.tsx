import type { ReactNode } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import clsx from 'clsx';

interface AppTooltipProviderProps {
  children: ReactNode;
  /** Retraso antes de mostrar el tooltip (ms). */
  delayDuration?: number;
}

/** Proveedor global — montar una sola vez en la raíz (App). */
export function AppTooltipProvider({ children, delayDuration = 350 }: AppTooltipProviderProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration} skipDelayDuration={200}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

interface AppTooltipProps {
  /** Texto del tooltip. Si está vacío, no envuelve (evita tooltips vacíos). */
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  className?: string;
}

/**
 * Tooltip global de la app (Radix). Reemplaza al `title=` nativo en hovers:
 * respeta el tema, evita el estilo default del SO y reposiciona en bordes.
 * Usar `asChild`: el hijo debe ser un único elemento (no botones `disabled`
 * directos — envolverlos en un `span`).
 */
export function AppTooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  sideOffset = 6,
  className,
}: AppTooltipProps) {
  if (content === undefined || content === null || content === '') return <>{children}</>;
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={8}
          className={clsx(
            'z-[10000] max-w-[260px] select-none rounded-lg border border-border/70 bg-popover px-2.5 py-1.5 text-xs leading-relaxed text-popover-foreground shadow-xl motion-origin-popper animate-in fade-in zoom-in-95 duration-150',
            className,
          )}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-popover" width={10} height={5} />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
