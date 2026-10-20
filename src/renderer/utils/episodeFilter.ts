import { parseEpisodeNumber } from '@/utils/episodeNumber';

export function parseEpisodeFilter(query: unknown, availableEpisodes?: readonly number[]): Set<number> | null {
  const raw = String(query || '').trim();
  if (!raw) return null;
  const out = new Set<number>();
  for (const part of raw.split(/[,\s;]+/)) {
    if (!part) continue;
    const range = part.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
    if (range) {
      let from = Number(range[1]);
      let to = Number(range[2]);
      if (from > to) [from, to] = [to, from];
      if (availableEpisodes) {
        for (const n of availableEpisodes) {
          if (n > 0 && n <= 5000 && n >= from && n <= to) out.add(n);
        }
        continue;
      }
      for (let n = Math.ceil(from); n <= to && n <= 5000; n++) {
        if (n > 0) out.add(n);
      }
      continue;
    }
    const n = parseEpisodeNumber(part);
    if (n !== null && n > 0 && n <= 5000) out.add(n);
  }
  return out;
}
