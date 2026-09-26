// Geometría del reordenado (Carpetas y Servidores), pura y sin React.
// La fila queda en flujo: se mide con todas presentes.

/** Un clic no mueve: el arrastre arranca al superar 4px. */
export const SORTABLE_DRAG_THRESHOLD_PX = 4;

export interface SortableRowRect {
  top: number;
  height: number;
}

/**
 * Fila bajo el puntero, o `null` si es su sitio (no marca Guardar).
 * Devuelve el índice en `rows`, listo para `onReorder(from, to)`.
 */
export function resolveDropIndex(rows: readonly SortableRowRect[], clientY: number, fromIndex: number): number | null {
  // El índice viaja con cada fila para no descuadrar al filtrar inválidas.
  const validas = rows
    .map((r, index) => ({ top: r.top, height: r.height, index }))
    .filter((r) => Number.isFinite(r.top) && Number.isFinite(r.height) && r.height > 0);
  if (validas.length === 0 || !Number.isFinite(clientY)) return null;

  // Sobre su propia fila no hay destino: soltar ahí es no mover.
  const propia = rows[fromIndex];
  if (
    propia &&
    Number.isFinite(propia.top) &&
    Number.isFinite(propia.height) &&
    clientY >= propia.top &&
    clientY < propia.top + propia.height
  ) {
    return null;
  }

  let at = validas.length - 1;
  for (let i = 0; i < validas.length; i++) {
    const mid = validas[i].top + validas[i].height / 2;
    if (clientY < mid) {
      at = i;
      break;
    }
  }
  const target = validas[at].index;
  return target === fromIndex ? null : target;
}

/** Borde de la fila `idx` donde pintar la línea de inserción, o `null`. */
export function resolveDropLine(
  idx: number,
  draggingIndex: number | null,
  dropIndex: number | null,
): 'above' | 'below' | null {
  if (draggingIndex === null || dropIndex === null || idx === draggingIndex) return null;
  return dropIndex === idx ? (dropIndex < draggingIndex ? 'above' : 'below') : null;
}

export function exceedsDragThreshold(dx: number, dy: number): boolean {
  return Math.abs(dx) >= SORTABLE_DRAG_THRESHOLD_PX || Math.abs(dy) >= SORTABLE_DRAG_THRESHOLD_PX;
}
