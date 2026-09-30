import { type DetailRow } from '@/renderer/utils/downloaderRows';

export function formatEpisodeList(episodes: number[]): string {
  if (!episodes || episodes.length === 0) return '—';

  const sorted = [...episodes].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
      start = sorted[i];
      end = sorted[i];
    }
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`);

  return ranges.join(', ');
}

export const EMPTY_DETAIL_ROWS: DetailRow[] = [];
