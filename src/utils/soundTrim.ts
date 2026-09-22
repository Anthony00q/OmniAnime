export const MAX_TRIM_SEC = 15;
export const MIN_TRIM_SEC = 0.5;

export interface TrimWindow {
  trimStartSec: number;
  trimSec: number;
}

export function defaultTrimFor(durationSec: number): TrimWindow {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return { trimStartSec: 0, trimSec: MIN_TRIM_SEC };
  }
  return { trimStartSec: 0, trimSec: Math.min(MAX_TRIM_SEC, durationSec) };
}

export function clampTrim(startSec: number, trimSec: number, durationSec: number): TrimWindow {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return { trimStartSec: 0, trimSec: MIN_TRIM_SEC };
  }
  const maxWindow = Math.min(MAX_TRIM_SEC, durationSec);
  const minWindow = Math.min(MIN_TRIM_SEC, durationSec);
  let start = Number.isFinite(startSec) ? startSec : 0;
  let window = Number.isFinite(trimSec) ? trimSec : maxWindow;
  window = Math.min(maxWindow, Math.max(minWindow, window));
  start = Math.min(Math.max(0, start), durationSec - window);
  return { trimStartSec: round3(start), trimSec: round3(window) };
}

export function peaksFromSamples(samples: ArrayLike<number>, buckets: number): number[] {
  const count = Number.isFinite(buckets) ? Math.floor(buckets) : 0;
  if (count <= 0) return [];
  const out = new Array<number>(count).fill(0);
  const n = samples?.length ?? 0;
  if (n === 0) return out;
  let peak = 0;
  for (let i = 0; i < count; i += 1) {
    const from = Math.floor((i * n) / count);
    const to = Math.max(from + 1, Math.floor(((i + 1) * n) / count));
    let bucket = 0;
    for (let j = from; j < to && j < n; j += 1) {
      const v = Math.abs(samples[j] ?? 0);
      if (Number.isFinite(v) && v > bucket) bucket = v;
    }
    out[i] = bucket;
    if (bucket > peak) peak = bucket;
  }
  if (peak > 0) {
    for (let i = 0; i < count; i += 1) out[i] = Math.round((out[i] / peak) * 1000) / 1000;
  }
  return out;
}

export function clampPlayhead(sec: number, windowStartSec: number, windowEndSec: number): number {
  if (!Number.isFinite(windowEndSec) || windowEndSec <= windowStartSec) {
    return Number.isFinite(windowStartSec) ? windowStartSec : 0;
  }
  if (!Number.isFinite(sec)) return windowStartSec;
  return Math.min(windowEndSec, Math.max(windowStartSec, sec));
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
