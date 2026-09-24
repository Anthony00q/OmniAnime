import { useEffect, useRef } from 'react';
import { Info } from 'lucide-react';

interface LibraryFolderMenuProps {
  x: number;
  y: number;
  onDetails: () => void;
  onClose: () => void;
}

export function LibraryFolderMenu({ x, y, onDetails, onClose }: LibraryFolderMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    prevFocusRef.current = document.activeElement;
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    const onScroll = () => onClose();
    const onCloseModals = () => onClose();
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('close-modals', onCloseModals);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('close-modals', onCloseModals);
      (prevFocusRef.current as HTMLElement | null)?.focus?.();
    };
  }, [onClose]);

  const posX = Math.max(8, Math.min(x, window.innerWidth - 240));
  const posY = Math.max(8, Math.min(y, window.innerHeight - 140));

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Opciones de la carpeta"
      style={{ left: posX, top: posY }}
      className="fixed z-[80] w-56 rounded-xl border border-border bg-popover p-1.5 shadow-2xl"
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onDetails();
          onClose();
        }}
        onMouseDown={(e) => e.preventDefault()}
        className="flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <Info className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold leading-none text-foreground">Detalles</span>
          <span className="mt-1 block text-xs text-muted-foreground">Títulos y carpeta</span>
        </span>
      </button>
    </div>
  );
}
