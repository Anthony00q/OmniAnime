// Filtro de episodios por números: '7', '5,6,7', '5-7', '1-3,7'.
// null = sin filtro (query vacía). Basura se ignora, rangos invertidos
// se normalizan. Solo vista: no toca selección ni datos.
export function parseEpisodeFilter(query: unknown): Set<number> | null {
  const raw = String(query || '').trim();
  if (!raw) return null;
  const out = new Set<number>();
  for (const part of raw.split(/[,\s;]+/)) {
    if (!part) continue;
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      let from = parseInt(range[1], 10);
      let to = parseInt(range[2], 10);
      if (from > to) [from, to] = [to, from];
      for (let n = from; n <= to && n <= 5000; n++) {
        if (n > 0) out.add(n);
      }
      continue;
    }
    if (/^\d+$/.test(part)) {
      const n = parseInt(part, 10);
      if (n > 0 && n <= 5000) out.add(n);
    }
  }
  return out;
}
