import type { DownloadSettings } from '../types/settings';

export const DEFAULT_DOWNLOAD_SETTINGS: DownloadSettings = {
  maxParallelEpisodes: 1,
  retries: 10,
  socketTimeout: 30,
  startTimeoutSec: 90,
  allowContinue: true,
  cleanCacheOnComplete: false,
  directConnections: 1,
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : (value as number);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n as number);
  return Math.max(min, Math.min(max, rounded));
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeDownloadSettings(input: unknown): DownloadSettings {
  const raw = (input && typeof input === 'object' ? input : {}) as Partial<DownloadSettings>;
  return {
    maxParallelEpisodes: clampInt(raw.maxParallelEpisodes, 1, 3, DEFAULT_DOWNLOAD_SETTINGS.maxParallelEpisodes),
    retries: clampInt(raw.retries, 0, 10, DEFAULT_DOWNLOAD_SETTINGS.retries),
    socketTimeout: clampInt(raw.socketTimeout, 10, 60, DEFAULT_DOWNLOAD_SETTINGS.socketTimeout),
    startTimeoutSec: clampInt(raw.startTimeoutSec, 30, 120, DEFAULT_DOWNLOAD_SETTINGS.startTimeoutSec),
    allowContinue: toBoolean(raw.allowContinue, DEFAULT_DOWNLOAD_SETTINGS.allowContinue),
    cleanCacheOnComplete: toBoolean(raw.cleanCacheOnComplete, DEFAULT_DOWNLOAD_SETTINGS.cleanCacheOnComplete),
    directConnections: clampInt(raw.directConnections, 1, 4, DEFAULT_DOWNLOAD_SETTINGS.directConnections),
  };
}
