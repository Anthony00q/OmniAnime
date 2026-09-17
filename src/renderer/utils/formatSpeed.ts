export const SPEED_STALE_MS = 3000;

export function formatSpeedBps(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '';
  const units: Array<[number, string]> = [
    [1024 * 1024 * 1024, 'GB/s'],
    [1024 * 1024, 'MB/s'],
    [1024, 'KB/s'],
  ];
  for (const [size, label] of units) {
    if (value >= size) return `${(value / size).toFixed(1).replace('.', ',')} ${label}`;
  }
  return `${Math.round(value)} B/s`;
}

export function totalSpeedBps(activeEps: unknown, now: number = Date.now()): number {
  if (!Array.isArray(activeEps)) return 0;
  const at = typeof now === 'number' && Number.isFinite(now) ? now : 0;
  let total = 0;
  for (const e of activeEps as Array<{ speedBps?: unknown; at?: unknown }>) {
    if (!e || typeof e !== 'object') continue;
    const speed = typeof e.speedBps === 'number' && Number.isFinite(e.speedBps) && e.speedBps > 0 ? e.speedBps : 0;
    const seen = typeof e.at === 'number' && Number.isFinite(e.at) ? e.at : NaN;
    if (speed > 0 && !Number.isNaN(seen) && at - seen < SPEED_STALE_MS) total += speed;
  }
  return total;
}
