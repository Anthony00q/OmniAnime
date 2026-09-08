import { useEffect, useRef } from 'react';
import { Check, LayoutGrid, List } from 'lucide-react';
import type { EpisodeView } from '../../../utils/episodeView';

interface EpisodeViewMenuProps {
  x: number;
  y: number;
  view: EpisodeView;
  onSelect: (view: EpisodeView) => void;
  onClose: () => void;
}

const OPTIONS: Array<{ value: EpisodeView; label: string; desc: string; Icon: typeof LayoutGrid }> = [
  { value: 'cards', label: 'Miniaturas', desc: 'Fichas con imagen', Icon: LayoutGrid },
  { value: 'list', label: 'Lista', desc: 'Números sin imagen', Icon: List },
];

export function EpisodeViewMenu({ x, y, view, onSelect, onClose }: EpisodeViewMenuProps) {
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
      aria-label="Vista de episodios"
      style={{ left: posX, top: posY }}
      className="fixed z-[80] w-56 rounded-xl border border-border bg-popover p-1.5 shadow-2xl"
    >
      {OPTIONS.map(({ value, label, desc, Icon }) => {
        const active = view === value;
        return (
          <button
            key={value}
            type="button"
            role="menuitemradio"
            aria-checked={active}
            onClick={() => {
              onSelect(value);
              onClose();
            }}
            className="flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold leading-none text-foreground">{label}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{desc}</span>
            </span>
            {active && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
