// Alturas del Detalle por episodio (Downloader): tirador redimensionable con
// encaje por filas. Puro y testeable, sin dependencias de React.
export const DETAIL_ROW_H = 52;
export const DETAIL_MIN_H = DETAIL_ROW_H * 2;
export const DETAIL_MAX_H = 480;
// 4 filas exactas: múltiplo de ROW_H para encajar en la retícula desde el inicio.
export const DETAIL_DEFAULT_H = DETAIL_ROW_H * 4;

function clampHeight(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : DETAIL_DEFAULT_H;
  return Math.max(DETAIL_MIN_H, Math.min(DETAIL_MAX_H, n));
}

// Encaja a filas completas para no dejar medias filas cortadas.
export function snapDetailHeight(value: unknown): number {
  return Math.round(clampHeight(value) / DETAIL_ROW_H) * DETAIL_ROW_H;
}
