// Alturas del Detalle por episodio (Downloader): tirador redimensionable con
// encaje por filas. Puro y testeable, sin dependencias de React.
export const DETAIL_ROW_H = 48;
export const DETAIL_MIN_H = DETAIL_ROW_H * 2;
// Tope de 7 filas: suficiente para una temporada media sin estirar la card.
export const DETAIL_MAX_ROWS = 7;
export const DETAIL_MAX_H = DETAIL_ROW_H * DETAIL_MAX_ROWS;
// 3 filas exactas al abrir: múltiplo de ROW_H para encajar en la retícula.
// Con 2 o menos filas se ciñe al contenido (sin hueco ni tirador).
// ROW_H es la fila con acciones (botones h-7 de 28px mandan: 4+28+4+8+4);
// completadas/canceladas son más bajas, el snap es aproximado en mixtas.
export const DETAIL_DEFAULT_H = DETAIL_ROW_H * 3;

function rowCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

// Tope de arrastre por descarga: nunca más alto que el contenido ni que el
// techo absoluto de 7 filas. Evita estados fantasma con pocos episodios.
export function detailMaxForRows(rows: unknown): number {
  return Math.max(DETAIL_MIN_H, Math.min(DETAIL_MAX_H, rowCount(rows) * DETAIL_ROW_H));
}

// El tirador se oculta solo en listas cortas al tamaño por defecto; si el
// usuario estiró por encima del default, queda contenido oculto o está
// arrastrando, permanece visible (sin esto desaparecía al llegar al tope).
export function shouldShowDetailResizer(rows: unknown, height: unknown, isResizing: unknown): boolean {
  if (isResizing === true) return true;
  const h = typeof height === 'number' && Number.isFinite(height) ? height : DETAIL_DEFAULT_H;
  return h > DETAIL_DEFAULT_H || h < detailMaxForRows(rows);
}

function clampHeight(value: unknown, cap: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : DETAIL_DEFAULT_H;
  return Math.max(DETAIL_MIN_H, Math.min(cap, n));
}

// Encaja a filas completas para no dejar medias filas cortadas.
export function snapDetailHeight(value: unknown, maxHeight: unknown = DETAIL_MAX_H): number {
  const capSource = typeof maxHeight === 'number' && Number.isFinite(maxHeight) ? maxHeight : DETAIL_MAX_H;
  const cap = Math.max(DETAIL_MIN_H, Math.min(DETAIL_MAX_H, capSource));
  return Math.round(clampHeight(value, cap) / DETAIL_ROW_H) * DETAIL_ROW_H;
}
