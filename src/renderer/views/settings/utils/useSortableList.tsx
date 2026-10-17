import { useCallback, useEffect, useRef, useState } from 'react';
import { useReorderMotion } from '@/renderer/utils/motion';
import { exceedsDragThreshold, resolveDropIndex, resolveDropLine } from './sortableList';

interface UseSortableListOptions {
  /** Nº de filas arrastrables; con 1 o menos el agarre se desactiva. */
  count: number;
  /** Apaga el arrastre aunque haya filas (p. ej. sin callback de reorden). */
  disabled?: boolean;
  /** Aviso solo si el destino cambia de verdad. */
  onReorder: (from: number, to: number) => void;
}

export function useSortableList({ count, disabled = false, onReorder }: UseSortableListOptions) {
  const canReorder = count > 1 && !disabled;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  const [session, setSession] = useState(false);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const { registerRow, prepareFlip } = useReorderMotion();

  const pendingRef = useRef<number | null>(null);
  const draggingRef = useRef<number | null>(null);
  const dropRef = useRef<number | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const handleElRef = useRef<HTMLElement | null>(null);
  const startRef = useRef({ x: 0, y: 0 });
  const armedRef = useRef(false);

  const clearDrag = useCallback(() => {
    pendingRef.current = null;
    draggingRef.current = null;
    dropRef.current = null;
    pointerIdRef.current = null;
    handleElRef.current = null;
    armedRef.current = false;
    setDraggingIndex(null);
    setDropIndex(null);
    setSession(false);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const updateDrop = useCallback((clientY: number) => {
    const from = draggingRef.current;
    if (from === null || !listRef.current) return;
    const rows = Array.from(listRef.current.querySelectorAll<HTMLElement>('[data-row]'));
    const rects = rows.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, height: r.height };
    });
    const target = resolveDropIndex(rects, clientY, from);
    if (dropRef.current === target) return;
    dropRef.current = target;
    setDropIndex(target);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, idx: number) => {
      if (!canReorder || e.button !== 0) return;
      e.preventDefault();
      pendingRef.current = idx;
      dropRef.current = null;
      pointerIdRef.current = e.pointerId;
      handleElRef.current = e.currentTarget as HTMLElement;
      startRef.current = { x: e.clientX, y: e.clientY };
      armedRef.current = false;
      setSession(true);
      try {
        handleElRef.current.setPointerCapture(e.pointerId);
      } catch {}
    },
    [canReorder],
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      const idx = pendingRef.current;
      if (idx === null) return;
      if (!armedRef.current) {
        const dx = e.clientX - startRef.current.x;
        const dy = e.clientY - startRef.current.y;
        if (!exceedsDragThreshold(dx, dy)) return;
        armedRef.current = true;
        draggingRef.current = idx;
        setDraggingIndex(idx);
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
      }
      updateDrop(e.clientY);
    },
    [updateDrop],
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      const from = draggingRef.current;
      const to = dropRef.current;
      if (pointerIdRef.current !== null && e.pointerId !== undefined && e.pointerId !== pointerIdRef.current) {
        if (e.type === 'pointerup') return;
      }
      if (from !== null && to !== null && from !== to && from >= 0 && to >= 0) {
        prepareFlip();
        onReorderRef.current(from, to);
      }
      try {
        if (pointerIdRef.current !== null) handleElRef.current?.releasePointerCapture?.(pointerIdRef.current);
      } catch {}
      clearDrag();
    },
    [clearDrag, prepareFlip],
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

  // Arriba de la fila destino, o debajo de la última al caer al final.
  const getDropLine = useCallback(
    (idx: number) => resolveDropLine(idx, draggingIndex, dropIndex),
    [draggingIndex, dropIndex],
  );

  return {
    canReorder,
    listRef,
    draggingIndex,
    dropIndex,
    handlePointerDown,
    registerRow,
    getDropLine,
    prepareFlip,
  };
}
