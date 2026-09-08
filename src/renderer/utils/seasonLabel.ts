// Solo display: la web/proveedor entrega 'Temporada Verano' y la fila ya
// etiqueta 'Temporada'. Sin esto se lee 'Temporada Temporada Verano'.
export function normalizeSeasonLabel(season: unknown): string {
  const raw = String(season || '').trim();
  if (!raw) return '';
  return raw.replace(/^temporada\s+/i, '').trim();
}
