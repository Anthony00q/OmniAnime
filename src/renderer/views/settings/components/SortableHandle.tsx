import { memo } from 'react';
import { GripVertical } from 'lucide-react';

// Agarre único de las listas: grip de 6 puntos con diana táctil a 48px.
// El número queda como badge visual, no interactivo.

interface SortableHandleProps {
  index: number;
  position: number; // posición visible (1-based) para el lector de pantalla
  name: string; // qué se arrastra ("Carpeta 1", "Voe en AnimeAV1"...)
  canReorder: boolean;
  dragging: boolean;
  onPointerDown: (e: React.PointerEvent, index: number) => void;
}

export const SortableHandle = memo(function SortableHandle({
  index,
  position,
  name,
  canReorder,
  dragging,
  onPointerDown,
}: SortableHandleProps) {
  return (
    <button
      type="button"
      data-drag-handle
      data-dragging={dragging ? 'true' : 'false'}
      tabIndex={canReorder ? 0 : -1}
      onPointerDown={(e) => onPointerDown(e, index)}
      disabled={!canReorder}
      aria-label={`Arrastrar ${name}, posición ${position}`}
      aria-roledescription="elemento arrastrable"
      style={{ touchAction: 'none' }}
      className={`app-region-no-drag relative inline-flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-lg border transition-[background-color,border-color,color,transform] duration-150 ease-out after:absolute after:-inset-2 after:rounded-lg after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
        canReorder
          ? 'cursor-grab border-border/50 bg-secondary/60 text-muted-foreground hover:border-border hover:bg-secondary hover:text-foreground active:cursor-grabbing active:scale-95'
          : 'cursor-not-allowed border-transparent bg-secondary/30 text-muted-foreground/40'
      } ${dragging ? 'cursor-grabbing border-primary/40 bg-secondary text-foreground' : ''}`}
    >
      <GripVertical className="pointer-events-none h-3.5 w-3.5" />
    </button>
  );
});
