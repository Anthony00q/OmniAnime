import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Info, RotateCcw } from 'lucide-react';
import { AppTooltip } from '../../../components/ui/AppTooltip';
import { CustomSwitch } from '../../../components/CustomSwitch';

interface ServerOrderCardProps {
  providerLabel: string;
  hint: string;
  iconSrc: string;
  candidates: readonly string[];
  active: readonly string[];
  onReorder: (from: number, to: number) => void;
  onToggle: (name: string) => void;
  onReset: () => void;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Sin umbral, un clic sobre el número movía la fila: el arrastre arranca de verdad al superarlo.
const DRAG_THRESHOLD_PX = 4;

export const ServerOrderCard = memo(function ServerOrderCard({
  providerLabel,
  hint,
  iconSrc,
  candidates,
  active,
  onReorder,
  onToggle,
  onReset,
}: ServerOrderCardProps) {
  const inactive = candidates.filter((name) => !active.includes(name));
  const canReorder = active.length > 1;

  const [session, setSession] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const draggedIndexRef = useRef<number | null>(null);
  const dragOverIndexRef = useRef<number | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const pendingIndexRef = useRef<number | null>(null);
  const armedRef = useRef(false);
  const startRef = useRef({ x: 0, y: 0 });

  const clearDrag = useCallback(() => {
    draggedIndexRef.current = null;
    dragOverIndexRef.current = null;
    pointerIdRef.current = null;
    pendingIndexRef.current = null;
    armedRef.current = false;
    setDraggedIndex(null);
    setDragOverIndex(null);
    setSession(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const updateDragOver = useCallback((clientY: number) => {
    const dragIdx = draggedIndexRef.current;
    if (dragIdx === null || !listRef.current) return;
    const rows = Array.from(listRef.current.querySelectorAll<HTMLElement>('[data-row]'));
    if (rows.length === 0) return;
    let target: number | null = null;
    for (let i = 0; i < rows.length; i++) {
      const rect = rows[i].getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (clientY < mid) {
        target = i;
        break;
      }
      if (i === rows.length - 1) target = i;
    }
    if (target === null) return;
    if (target === dragIdx) {
      dragOverIndexRef.current = null;
      setDragOverIndex(null);
    } else {
      dragOverIndexRef.current = target;
      setDragOverIndex(target);
    }
  }, []);

  // El reordenado se desliza con transform (nunca width/margin): mide antes, anima después.
  const rowEls = useRef(new Map<string, HTMLElement>());
  const pendingFlip = useRef<Map<string, number> | null>(null);

  const runWithFlip = useCallback((action: () => void) => {
    const before = new Map<string, number>();
    rowEls.current.forEach((el, key) => before.set(key, el.getBoundingClientRect().top));
    pendingFlip.current = before;
    action();
  }, []);

  const handleReorder = useCallback(
    (from: number, to: number) => runWithFlip(() => onReorder(from, to)),
    [runWithFlip, onReorder],
  );

  const handleReset = useCallback(() => runWithFlip(onReset), [runWithFlip, onReset]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, idx: number) => {
      if (!canReorder) return;
      if (e.button !== 0) return;
      e.preventDefault();
      pendingIndexRef.current = idx;
      dragOverIndexRef.current = null;
      pointerIdRef.current = e.pointerId;
      startRef.current = { x: e.clientX, y: e.clientY };
      armedRef.current = false;
      setSession(true);
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {}
    },
    [canReorder],
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const idx = pendingIndexRef.current;
      if (idx === null) return;
      if (!armedRef.current) {
        const dx = e.clientX - startRef.current.x;
        const dy = e.clientY - startRef.current.y;
        if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
        armedRef.current = true;
        draggedIndexRef.current = idx;
        setDraggedIndex(idx);
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
      }
      updateDragOver(e.clientY);
    },
    [updateDragOver],
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      const from = draggedIndexRef.current;
      const to = dragOverIndexRef.current;
      if (pointerIdRef.current !== null && e.pointerId !== undefined && e.pointerId !== pointerIdRef.current) {
        if (e.type === 'pointerup') return;
      }
      if (from !== null && to !== null && from !== to && from >= 0 && to >= 0) {
        handleReorder(from, to);
      }
      try {
        if (pointerIdRef.current !== null) {
          const el = document.querySelector('[data-drag-handle][data-dragging="true"]') as HTMLElement | null;
          el?.releasePointerCapture?.(pointerIdRef.current);
        }
      } catch {}
      clearDrag();
    },
    [clearDrag, handleReorder],
  );

  useEffect(() => {
    if (!session) return;
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('pointercancel', handlePointerUp);
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') clearDrag();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerUp);
      document.removeEventListener('keydown', onKey);
    };
  }, [session, handlePointerMove, handlePointerUp, clearDrag]);

  useEffect(() => {
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  useLayoutEffect(() => {
    const before = pendingFlip.current;
    pendingFlip.current = null;
    if (!before || before.size === 0 || prefersReducedMotion()) return;
    before.forEach((top, key) => {
      const el = rowEls.current.get(key);
      if (!el) return;
      const delta = top - el.getBoundingClientRect().top;
      if (Math.abs(delta) < 1) return;
      el.style.transition = 'none';
      el.style.transform = `translateY(${delta}px)`;
      requestAnimationFrame(() => {
        el.style.transition = 'transform 180ms var(--ease-out)';
        el.style.transform = '';
      });
    });
  });

  // Cambiar un switch ya se ve en el propio switch; el flash confirma además que se guardó.
  const [flashName, setFlashName] = useState<string | null>(null);
  const flashTimer = useRef<number | null>(null);
  const handleToggle = useCallback(
    (name: string) => {
      onToggle(name);
      setFlashName(name);
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlashName(null), 800);
    },
    [onToggle],
  );

  useEffect(() => {
    return () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
    };
  }, []);

  return (
    <div className="rounded-xl border border-border/60 bg-background p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <img src={iconSrc} alt="" aria-hidden="true" className="h-[18px] w-[18px] shrink-0 rounded" draggable={false} />
        <span className="text-sm font-semibold">{providerLabel}</span>
        <span className="select-none text-[11px] font-semibold uppercase tracking-[0.09em] text-text-tertiary">
          {hint}
        </span>
        <span className="ml-auto shrink-0 select-none text-[13px] font-medium tabular-nums text-text-tertiary">
          {active.length} de {candidates.length} activos
        </span>
        <AppTooltip content="Apagado se salta y no se intenta. Si lo vuelves a activar, se añade al final.">
          <span
            aria-hidden="true"
            className="inline-flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground"
          >
            <Info className="h-3.5 w-3.5" />
          </span>
        </AppTooltip>
      </div>

      <div ref={listRef} role="list" aria-label={`Servidores de ${providerLabel}`}>
        {active.map((name, idx) => {
          const isDragging = draggedIndex === idx;
          const isDragOver = dragOverIndex === idx && draggedIndex !== null && draggedIndex !== idx;
          return (
            <div
              key={name}
              ref={(el) => {
                if (el) rowEls.current.set(name, el);
                else rowEls.current.delete(name);
              }}
              data-row
              role="listitem"
              className={`group/server-row relative border-b border-border/40 last:border-b-0 transition-[background-color,opacity] duration-150 ease-out ${
                isDragging ? 'opacity-60' : 'opacity-100'
              } ${isDragOver ? 'bg-primary/[0.04]' : 'hover:bg-secondary/40'}`}
            >
              {isDragOver && draggedIndex !== null && draggedIndex > idx && (
                <span
                  aria-hidden="true"
                  className="animate-in fade-in pointer-events-none absolute inset-x-2 top-0 h-0.5 rounded-full bg-primary/70"
                />
              )}
              {isDragOver && draggedIndex !== null && draggedIndex < idx && (
                <span
                  aria-hidden="true"
                  className="animate-in fade-in pointer-events-none absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary/70"
                />
              )}

              <div className="flex items-stretch gap-2.5 px-2">
                <div className="relative flex w-6 shrink-0 items-center justify-center">
                  {idx > 0 && (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-1/2 left-1/2 top-0 mb-3 w-px -translate-x-1/2 bg-border"
                    />
                  )}
                  {idx < active.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-0 left-1/2 top-1/2 mt-3 w-px -translate-x-1/2 bg-border"
                    />
                  )}
                  <button
                    type="button"
                    data-drag-handle
                    data-dragging={isDragging ? 'true' : 'false'}
                    tabIndex={-1}
                    onPointerDown={(e) => handlePointerDown(e, idx)}
                    aria-label={`Posición ${idx + 1}: ${name}`}
                    style={{ touchAction: 'none' }}
                    className={`app-region-no-drag relative flex h-6 w-6 shrink-0 select-none items-center justify-center rounded-full text-[11px] font-semibold tabular-nums transition-[background-color,border-color,color,transform] duration-150 ease-out after:absolute after:-inset-2.5 after:rounded-full after:content-[''] active:scale-95 ${
                      canReorder ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'
                    } ${
                      idx === 0
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border bg-background text-text-tertiary'
                    }`}
                  >
                    {idx + 1}
                  </button>
                </div>

                <div className="flex min-w-0 flex-1 items-center gap-2 py-3">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</span>
                  <span
                    role="group"
                    aria-label={`Ordenar ${name} en ${providerLabel}`}
                    className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within/server-row:opacity-100 group-hover/server-row:opacity-100"
                  >
                    <button
                      type="button"
                      onClick={() => handleReorder(idx, idx - 1)}
                      disabled={idx === 0}
                      aria-label={`Subir ${name} en ${providerLabel}`}
                      className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReorder(idx, idx + 1)}
                      disabled={idx === active.length - 1}
                      aria-label={`Bajar ${name} en ${providerLabel}`}
                      className="relative inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors after:absolute after:-inset-2 after:content-[''] hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </span>
                  <CustomSwitch
                    checked
                    onChange={() => handleToggle(name)}
                    ariaLabel={`Desactivar ${name} en ${providerLabel}`}
                  />
                </div>
              </div>

              {flashName === name && (
                <span
                  aria-hidden="true"
                  className="settings-row-flash pointer-events-none absolute inset-0 bg-primary/10"
                />
              )}
            </div>
          );
        })}
      </div>

      {active.length === 0 && (
        <div
          role="note"
          className="mt-2 flex gap-1.5 rounded-lg border border-warning/10 bg-warning/5 px-3 py-2 text-xs text-warning"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Sin servidores activos, {providerLabel} no descargará nada.</span>
        </div>
      )}

      {inactive.length > 0 && (
        <>
          <div className="mt-3 border-t border-border/40 pt-3">
            <span className="select-none text-[11px] font-semibold uppercase tracking-[0.09em] text-text-tertiary">
              Se saltan
            </span>
          </div>
          <div role="list" aria-label={`Servidores desactivados de ${providerLabel}`}>
            {inactive.map((name) => (
              <div
                key={name}
                role="listitem"
                className="group/server-row flex items-center gap-2.5 border-b border-border/40 px-2 last:border-b-0"
              >
                <span className="flex w-6 shrink-0 items-center justify-center select-none text-xs tabular-nums text-text-tertiary">
                  –
                </span>
                <span className="min-w-0 flex-1 truncate py-3 text-sm font-medium text-muted-foreground">{name}</span>
                <CustomSwitch
                  checked={false}
                  onChange={() => handleToggle(name)}
                  ariaLabel={`Activar ${name} en ${providerLabel}`}
                />
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-3 flex items-center justify-end">
        <AppTooltip content="Vuelve al orden por defecto.">
          <button
            type="button"
            onClick={handleReset}
            aria-label={`Restablecer servidores de ${providerLabel}`}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Restablecer
          </button>
        </AppTooltip>
      </div>
    </div>
  );
});
