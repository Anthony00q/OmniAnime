import type { DownloadSettings } from '../types/settings';
import {
  SERVER_CANDIDATES_ANIMEAV1,
  SERVER_CANDIDATES_JKANIME,
  SERVER_ORDER_ANIMEAV1_DEFAULT,
  SERVER_ORDER_JKANIME_DEFAULT,
  resolveServerOrderList,
} from './serverUtils';

export const DEFAULT_DOWNLOAD_SETTINGS: DownloadSettings = {
  maxParallelEpisodes: 1,
  retries: 10,
  startTimeoutSec: 90,
  allowContinue: true,
  cleanCacheOnComplete: false,
  mediafireConnections: 1,
  mp4uploadConnections: 1,
  voeConnections: 4,
  megaConnections: 6,
  hlsConnections: 10,
  serverOrderAnimeav1: [...SERVER_ORDER_ANIMEAV1_DEFAULT],
  serverOrderJkanime: [...SERVER_ORDER_JKANIME_DEFAULT],
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
    startTimeoutSec: clampInt(raw.startTimeoutSec, 30, 120, DEFAULT_DOWNLOAD_SETTINGS.startTimeoutSec),
    allowContinue: toBoolean(raw.allowContinue, DEFAULT_DOWNLOAD_SETTINGS.allowContinue),
    cleanCacheOnComplete: toBoolean(raw.cleanCacheOnComplete, DEFAULT_DOWNLOAD_SETTINGS.cleanCacheOnComplete),
    mediafireConnections: clampInt(raw.mediafireConnections, 1, 8, DEFAULT_DOWNLOAD_SETTINGS.mediafireConnections),
    mp4uploadConnections: clampInt(raw.mp4uploadConnections, 1, 8, DEFAULT_DOWNLOAD_SETTINGS.mp4uploadConnections),
    voeConnections: clampInt(raw.voeConnections, 1, 8, DEFAULT_DOWNLOAD_SETTINGS.voeConnections),
    megaConnections: clampInt(raw.megaConnections, 1, 8, DEFAULT_DOWNLOAD_SETTINGS.megaConnections),
    hlsConnections: clampInt(raw.hlsConnections, 1, 16, DEFAULT_DOWNLOAD_SETTINGS.hlsConnections),
    serverOrderAnimeav1: resolveServerOrderList(
      raw.serverOrderAnimeav1,
      DEFAULT_DOWNLOAD_SETTINGS.serverOrderAnimeav1,
      SERVER_CANDIDATES_ANIMEAV1,
    ),
    serverOrderJkanime: resolveServerOrderList(
      raw.serverOrderJkanime,
      DEFAULT_DOWNLOAD_SETTINGS.serverOrderJkanime,
      SERVER_CANDIDATES_JKANIME,
    ),
  };
}
