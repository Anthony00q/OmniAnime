export interface SpeedWindow {
  bytes: number;
  at: number;
  speedBps?: number;
}

export function updateSpeedWindow(
  prev: SpeedWindow | undefined,
  loadedBytes: unknown,
  now: number,
): { window: SpeedWindow; speedBps?: number } {
  const loaded =
    typeof loadedBytes === 'number' && Number.isFinite(loadedBytes) && loadedBytes >= 0 ? loadedBytes : NaN;
  const at = typeof now === 'number' && Number.isFinite(now) && now >= 0 ? now : 0;
  if (Number.isNaN(loaded)) return prev ? { window: prev, speedBps: prev.speedBps } : { window: { bytes: 0, at } };
  if (!prev) return { window: { bytes: loaded, at } };
  if (loaded < prev.bytes) return { window: { bytes: loaded, at } };
  const dt = (at - prev.at) / 1000;
  if (!(dt >= 1)) return { window: prev, speedBps: prev.speedBps };
  return { window: { bytes: loaded, at, speedBps: (loaded - prev.bytes) / dt }, speedBps: (loaded - prev.bytes) / dt };
}
