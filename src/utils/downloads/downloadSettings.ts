import * as fs from 'fs';
import * as path from 'path';
import type { AdaptiveConnectionsSettings, AdaptiveServerId, DownloadSettings } from '../../types/settings';
import {
  SERVER_CANDIDATES_ANIMEAV1,
  SERVER_CANDIDATES_JKANIME,
  SERVER_ORDER_ANIMEAV1_DEFAULT,
  SERVER_ORDER_JKANIME_DEFAULT,
  resolveServerOrderList,
} from '../serverUtils';
import { DEFAULT_FOLDER_NAME_SOURCE, normalizeFolderNameSource } from './folderNaming';

// Servidores configurables de Adaptive (minúsculas, como `connectionLevelForServer`).
// HLS y Mega quedan fuera: manual y single-stream fijo.
export const ADAPTIVE_SERVER_IDS = ['mediafire', 'mp4upload', 'voe'] as const;

// Configuración clásica (boolean legacy, defaults y siembra): el global decide y
// los servidores a su bola. `mega` siempre false: la clave es solo de lectura.
export function adaptiveConnectionsAll(enabled: boolean): AdaptiveConnectionsSettings {
  return {
    enabled: enabled === true,
    servers: { mediafire: true, mp4upload: true, voe: true, mega: false },
  };
}

// Única conversión desde lo persistido (legacy boolean u objeto nuevo): cada
// servidor explícito; lo inválido/ausente queda OFF, y el `mega` legacy se fuerza a OFF.
export function normalizeAdaptiveConnections(raw: unknown): AdaptiveConnectionsSettings {
  if (raw === true) return adaptiveConnectionsAll(true);
  if (raw === false || !raw || typeof raw !== 'object' || Array.isArray(raw)) return adaptiveConnectionsAll(false);
  const record = raw as Record<string, unknown>;
  const serversRaw = record.servers;
  const hasServers = !!serversRaw && typeof serversRaw === 'object' && !Array.isArray(serversRaw);
  const servers = {} as AdaptiveConnectionsSettings['servers'];
  for (const id of ADAPTIVE_SERVER_IDS) {
    servers[id] = hasServers ? (serversRaw as Record<string, unknown>)[id] === true : false;
  }
  servers.mega = false;
  return { enabled: record.enabled === true, servers };
}

// ¿Este servidor concreto corre con Adaptive? Global OFF manda sobre todo; HLS,
// Mega y servidores desconocidos nunca.
export function isAdaptiveEnabledForServer(config: AdaptiveConnectionsSettings, server: string | undefined): boolean {
  if (!config || config.enabled !== true) return false;
  const id = String(server ?? '')
    .trim()
    .toLowerCase();
  return (ADAPTIVE_SERVER_IDS as readonly string[]).includes(id) && config.servers[id as AdaptiveServerId] === true;
}

export const DEFAULT_DOWNLOAD_SETTINGS: DownloadSettings = {
  maxParallelEpisodes: 1,
  retries: 10,
  startTimeoutSec: 90,
  allowContinue: true,
  cleanCacheOnComplete: false,
  // Instalaciones nuevas se siembran con ON desde main; sin clave, OFF.
  adaptiveConnections: adaptiveConnectionsAll(false),
  mediafireConnections: 1,
  mp4uploadConnections: 1,
  voeConnections: 4,
  // Mega: single-stream fijo de 1 conexión (decisiones de arquitectura cerradas).
  megaConnections: 1,
  hlsConnections: 10,
  serverOrderAnimeav1: [...SERVER_ORDER_ANIMEAV1_DEFAULT],
  serverOrderJkanime: [...SERVER_ORDER_JKANIME_DEFAULT],
  folderNameSource: DEFAULT_FOLDER_NAME_SOURCE,
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : (value as number);
  if (!Number.isFinite(n)) return fallback;
  const rounded = Math.round(n as number);
  return Math.max(min, Math.min(max, rounded));
}

// ¿Instalación nueva? Solo si no hay rastro de ejecuciones previas. Llamar antes
// de que los servicios creen sus ficheros; ante la duda, instalación existente.
export function detectFreshInstall(userDataDir: string): boolean {
  try {
    if (fs.existsSync(path.join(userDataDir, 'omnianime.db'))) return false;
    if (fs.existsSync(path.join(userDataDir, 'settings.json'))) return false;
    if (fs.existsSync(path.join(userDataDir, 'omnianime_boot.json'))) return false;
    const logDir = path.join(userDataDir, 'logs');
    if (fs.existsSync(logDir)) {
      for (const name of fs.readdirSync(logDir)) {
        if (name.startsWith('sesion-')) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

// Nivel medio de la escalera: margen para explorar hacia arriba y hacia abajo.
const FRESH_INSTALL_CONNECTIONS = 4;

// Instalación nueva: Adaptive ON y conexiones que dejan explorar. Con 1 corre
// el camino simple y el modo adaptativo se queda sin medir.
export function seedFreshInstallDownloadSettings(download: unknown): DownloadSettings {
  return {
    ...normalizeDownloadSettings(download),
    adaptiveConnections: adaptiveConnectionsAll(true),
    mediafireConnections: FRESH_INSTALL_CONNECTIONS,
    mp4uploadConnections: FRESH_INSTALL_CONNECTIONS,
    voeConnections: FRESH_INSTALL_CONNECTIONS,
  };
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
    adaptiveConnections: normalizeAdaptiveConnections(raw.adaptiveConnections),
    mediafireConnections: clampInt(raw.mediafireConnections, 1, 8, DEFAULT_DOWNLOAD_SETTINGS.mediafireConnections),
    mp4uploadConnections: clampInt(raw.mp4uploadConnections, 1, 8, DEFAULT_DOWNLOAD_SETTINGS.mp4uploadConnections),
    voeConnections: clampInt(raw.voeConnections, 1, 8, DEFAULT_DOWNLOAD_SETTINGS.voeConnections),
    // Mega es single-stream fijo: cualquier valor heredado (2/4/6/8) o inválido
    // migra a 1 aquí, en el único punto. El chunked queda como legacy interno.
    megaConnections: 1,
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
    folderNameSource: normalizeFolderNameSource(raw.folderNameSource),
  };
}
