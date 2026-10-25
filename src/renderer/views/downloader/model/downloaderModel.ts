import { type DetailRow } from '@/renderer/utils/downloaderRows';
import { isEpisodeNumber } from '@/utils/episodeNumber';

export interface QueueFailure {
  episode: number | null;
  reason: string;
}

export function buildQueueFailures(failedEps: unknown, failureReasons: unknown, isFailed = false): QueueFailure[] {
  const episodes = Array.isArray(failedEps)
    ? [...new Set(failedEps.filter(isEpisodeNumber))].sort((a, b) => a - b)
    : [];
  const reasons =
    failureReasons && typeof failureReasons === 'object' && !Array.isArray(failureReasons)
      ? (failureReasons as Record<string, unknown>)
      : {};
  const fallback = 'No se pudo completar la descarga.';
  if (!episodes.length) return isFailed ? [{ episode: null, reason: fallback }] : [];
  return episodes.map((episode) => {
    const reason = Object.hasOwn(reasons, String(episode)) ? reasons[String(episode)] : undefined;
    return { episode, reason: typeof reason === 'string' && reason.trim() ? reason.trim() : fallback };
  });
}

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
