import { app, BrowserWindow, shell, Notification, protocol } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';
import { createMainContext } from './appContext';
import { setupHardwareAcceleration } from './bootstrap/hardwareAcceleration';
import { checkConnectivity, getConnectivityStatus as getConnectivityStatusImpl } from './bootstrap/connectivity';
import { registerOmniMediaProtocol } from './bootstrap/protocol';
import { setupContextMenu } from './bootstrap/contextMenu';
import { getAppHtmlPath, getAppIconPath, getSplashHtmlPath, getToolsDir, getFfmpegTools } from './runtimePaths';
import { ProviderManager } from '../services/ProviderManager';
import { DownloadService } from '../services/DownloadService';
import { EpisodeDownloadAttemptService } from '../services/EpisodeDownloadAttemptService';
import { DownloadQueueProcessor } from '../services/DownloadQueueProcessor';
import { AppLogger, type LogScope, type ScopedLogger } from '../services/AppLogger';
import { effectiveMinLevel, normalizeLoggingSettings } from '../utils/loggingSettings';
import { EpisodeFileService } from '../services/EpisodeFileService';
import { HistoryService } from '../services/HistoryService';
import { LibraryAssetService } from '../services/LibraryAssetService';
import { LibraryFileService } from '../services/LibraryFileService';
import { QueueStore } from '../services/QueueStore';
import { PausedProgressStore, applyStoredSnapshot } from '../services/PausedProgressStore';
import { AppUpdateService } from '../services/AppUpdateService';
import { ServerStatsStore } from '../services/ServerStatsStore';
import { ThumbnailService } from '../services/ThumbnailService';
import { createRuntimeDirectories } from '../services/RuntimeDirectories';
import { SettingsManager } from '../services/SettingsManager';
import { DatabaseManager } from '../services/DatabaseManager';
import { StorageService } from '../services/StorageService';
import { terminateChildProcessTree } from '../utils/processUtils';
import type { DownloadAnimeDetails, AnimeSearchResult } from '../types/anime';
import type { HistoryWriteRecord } from '../types/history';
import type { FolderLibraryMeta } from '../types/library';
import type { DownloadProvider, ProviderDownloadLink, QueueItem } from '../types/queue';
import { computeTitleMatchScore } from '../utils/titleUtils';
import {
  getServerPriorityOrder as getServerPriorityOrderUtil,
  isBlockedServer as isBlockedServerUtil,
  normalizeServerName as normalizeServerNameUtil,
} from '../utils/serverUtils';
import { buildCanonicalEpisodeFileName as buildCanonicalEpisodeFileNameUtil } from '../utils/episodeUtils';
import { normalizeDownloadSettings } from '../utils/downloadSettings';
import { USER_AGENT } from '../utils/windowUtils';
import { WindowLifecycleService, type PreloadedData } from './WindowLifecycleService';
import { registerIpcHandlers } from './IpcRegistry';
import anitomy from 'anitomy';

// Register privileged custom scheme for local posters/banners with webSecurity:true
// Must be before app.whenReady(). Allows <img src="omni-media://..."> from both file:// and http:// (dev)
try {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'omni-media',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        allowServiceWorkers: false,
      },
    },
  ]);
} catch {}

const runtimeDirectories = createRuntimeDirectories(app.getPath('userData'));
const appLogger = new AppLogger(runtimeDirectories, { appVersion: app.getVersion() });
const writeGlobalLog = (error: unknown, isRenderer = false): void => appLogger.write(error, isRenderer);
const scopedLog = (scope: LogScope): ScopedLogger => appLogger.child(scope);
function applyLoggingSettings(): void {
  try {
    const raw = SettingsManager.get().logging;
    appLogger.setMinLevel(effectiveMinLevel(normalizeLoggingSettings(raw)));
  } catch {
    appLogger.setMinLevel('info');
  }
}
const sessionStartIso = new Date().toISOString();
try {
  appLogger.pruneOldSessions();
} catch {}
try {
  appLogger.writeSessionHeader({
    version: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    userData: app.getPath('userData'),
  });
} catch {}
applyLoggingSettings();
DatabaseManager.setLogger(appLogger.child('db'));
SettingsManager.setLogger(appLogger.child('settings'));

setupHardwareAcceleration({ logger: appLogger.child('app') });

const providerManager = new ProviderManager({ logger: appLogger.child('provider') });
const downloadService = new DownloadService({ logger: appLogger.child('download') });
const activeChildProcesses = new Set<import('child_process').ChildProcess>();

app.on('before-quit', () => {
  try {
    downloadService.abort();
    for (const proc of activeChildProcesses) {
      terminateChildProcessTree(proc);
    }
  } catch {
    /* shutdown must continue even if cleanup fails */
  }
});

setupContextMenu();

function sendOSNotification(
  title: string,
  body: string,
  eventType:
    'showDownloadStarted' | 'showDownloadFinished' | 'showDownloadError' | 'showSystemMessages' = 'showSystemMessages',
) {
  try {
    const settings = SettingsManager.get();
    if (settings.notificationSettings && settings.notificationSettings[eventType] === false) {
      return;
    }
    if (Notification.isSupported()) {
      const notif = new Notification({
        title,
        body,
        icon: getAppIconPath(),
        silent: !settings.notificationsSound,
      });
      notif.show();
    }
  } catch (e) {
    scopedLog('window').error(`notification: ${e}`);
  }
}

const HLS_PLAYER_REFERER = 'https://player.zilla-networks.com/';

let isQuitting = false;
let windowLifecycleService: WindowLifecycleService | null = null;

function getMainWindow(): BrowserWindow | null {
  return windowLifecycleService?.getMainWindow() || null;
}

function getDevServerUrl(): string {
  return process.env.OMNIANIME_DEV_SERVER_URL || 'http://localhost:5173';
}
const mainContext = createMainContext({
  providerManager,
  downloadService,
  database: DatabaseManager.getInstance(),
});
const { database, homeFeedService, providerGateway } = mainContext;

const preloadedData: PreloadedData = {
  providerId: 'animeav1',
  home: null,
  filters: null,
  catalog: null,
  libraryMeta: null,
};

function writeFolderLibraryMeta(folderPath: string, data: FolderLibraryMeta): void {
  libraryAssetService.writeFolderLibraryMeta(folderPath, data);
}

function ensureFolderPoster(folderPath: string, posterUrl: string | null | undefined): Promise<string | null> {
  return libraryAssetService.ensureFolderPoster(folderPath, posterUrl);
}

function ensureFolderBanner(folderPath: string, bannerUrl: string | null | undefined): Promise<string | null> {
  return libraryAssetService.ensureFolderBanner(folderPath, bannerUrl);
}

function buildLibrarySearchVariants(rawName: string): string[] {
  const base = String(rawName || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\(.*?\)|\[.*?\]|\{.*?\}/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  let anitomyTitle = '';
  try {
    const parsed = anitomy.parse(rawName + '.mkv');
    if (parsed && parsed.title) {
      anitomyTitle = parsed.title.replace(/[_-]+/g, ' ').trim();
    }
  } catch {}

  const cleaned = base
    .replace(/\b(season|temporada|part|cour|sub|dub|final|completo)\b/gi, ' ')
    .replace(/\b\d{1,2}\b/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const variants = [base];
  if (anitomyTitle && anitomyTitle !== base) {
    variants.push(anitomyTitle);
  }
  variants.push(cleaned);

  return Array.from(new Set(variants.map((v) => v.trim()).filter(Boolean))).slice(0, 3);
}

async function mapLimit<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;

  const runners = new Array(Math.max(1, concurrency)).fill(0).map(async () => {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= items.length) break;
      try {
        out[idx] = await worker(items[idx], idx);
      } catch (error) {
        writeGlobalLog(error);
        // Preserve slot as null-equivalent to avoid hiding via filter(Boolean) ambiguity
        (out as unknown as Array<R | null>)[idx] = null as unknown as R;
      }
    }
  });

  await Promise.all(runners);
  return out;
}

export interface LibraryMetaPreloadRow {
  folderName: string;
  folderPath: string;
  sourceDir: string;
  sourceDirIndex: number;
  birthtime: number;
  episodeCount: number;
  slug: string | null;
  title: string;
  poster: string | null;
  banner: string | null;
  category?: string;
  year?: string;
  status?: string;
  season?: string;
  providerId?: string | null;
  updatedAt: number;
}

async function buildLibraryMetaPreload(
  baseDirs: string[],
  maxFolders = 0,
  onProgress?: (info: { processed: number; total: number; matched: number }) => void,
  allowRemoteLookup = true,
): Promise<LibraryMetaPreloadRow[]> {
  try {
    const videoExts = new Set(['.mp4', '.mkv', '.avi', '.flv', '.webm']);
    const allFolders: Array<{
      name: string;
      folderPath: string;
      sourceDir: string;
      sourceDirIndex: number;
      birthtime: number;
      episodeCount: number;
      localPoster: string | null;
      localBanner: string | null;
      localMeta: FolderLibraryMeta | null;
    }> = [];

    for (const [dirIndex, baseDir] of baseDirs.entries()) {
      if (!baseDir) continue;
      try {
        await fs.promises.stat(baseDir);
      } catch {
        continue;
      }

      let dirents: fs.Dirent[];
      try {
        dirents = (await fs.promises.readdir(baseDir, { withFileTypes: true })) as unknown as fs.Dirent[];
      } catch (error) {
        writeGlobalLog(`No se pudo leer ${baseDir} durante el precargado: ${error}`);
        continue;
      }
      for (const d of await mapLimit(
        dirents.filter((x) => x.isDirectory()),
        16,
        async (d) => {
          const folderPath = path.join(baseDir, d.name);
          // Conteo en la misma lectura que detecta video: sin I/O extra
          let episodeCount = 0;
          try {
            const entries = (await fs.promises.readdir(folderPath, {
              withFileTypes: true,
            })) as unknown as fs.Dirent[];
            episodeCount = entries.reduce(
              (acc, e) => (e.isFile() && videoExts.has(path.extname(e.name).toLowerCase()) ? acc + 1 : acc),
              0,
            );
          } catch (error) {
            writeGlobalLog(`No se pudo leer ${folderPath} durante el precargado: ${error}`);
          }
          if (episodeCount === 0) return null;

          let birthtime = 0;
          try {
            const st = await fs.promises.stat(folderPath);
            birthtime = st.birthtimeMs || 0;
          } catch (error) {
            writeGlobalLog(`No se pudo obtener la fecha de ${folderPath}: ${error}`);
          }
          const [localPoster, localBanner, localMeta] = await Promise.all([
            libraryAssetService.getFolderPosterFileUrlAsync(folderPath),
            libraryAssetService.getFolderBannerFileUrlAsync(folderPath),
            libraryAssetService.readFolderLibraryMetaAsync(folderPath),
          ]);
          return {
            name: d.name,
            folderPath,
            sourceDir: baseDir,
            sourceDirIndex: dirIndex,
            birthtime,
            episodeCount,
            localPoster,
            localBanner,
            localMeta,
          };
        },
      )) {
        if (!d) continue;
        allFolders.push(d);
      }
    }

    let runRetro = false;
    try {
      runRetro = SettingsManager.get().autoRenameRetroactive === true;
    } catch {}
    const resetRetroOnce = () => {
      if (!runRetro) return;
      try {
        SettingsManager.clearAutoRenameRetroactiveOnce();
      } catch (error) {
        writeGlobalLog(`No se pudo desactivar el renombrado retroactivo: ${error}`);
      }
    };

    if (allFolders.length === 0) {
      resetRetroOnce();
      return [];
    }

    const sorted = allFolders.sort((a, b) => b.birthtime - a.birthtime);
    const targets = maxFolders > 0 ? sorted.slice(0, maxFolders) : sorted;
    if (!targets.length) {
      resetRetroOnce();
      return [];
    }

    const searchCache = new Map<string, AnimeSearchResult[]>();
    let processed = 0;
    let matched = 0;
    let lastProgressEmit = 0;
    onProgress?.({ processed: 0, total: targets.length, matched: 0 });

    const rows = await mapLimit(targets, 3, async (folder) => {
      if (runRetro) {
        try {
          await normalizeEpisodeFilesInFolder(folder.folderPath);
        } catch (e) {
          scopedLog('app').error(`preload rename: ${e}`);
        }
      }
      if (folder.localMeta?.slug && (folder.localPoster || folder.localBanner)) {
        processed += 1;
        matched += 1;
        if (onProgress && (processed % 3 === 0 || processed === targets.length)) {
          onProgress({ processed, total: targets.length, matched });
        }

        return {
          folderName: folder.name,
          folderPath: folder.folderPath,
          sourceDir: folder.sourceDir,
          sourceDirIndex: folder.sourceDirIndex,
          birthtime: folder.birthtime,
          episodeCount: folder.episodeCount,
          slug: folder.localMeta.slug || null,
          title: folder.localMeta.title || folder.name,
          poster: folder.localPoster,
          banner: folder.localBanner,
          category: folder.localMeta.category || '',
          year: folder.localMeta.year || '',
          status: folder.localMeta.status || '',
          season: folder.localMeta.season || '',
          providerId: folder.localMeta.providerId ?? null,
          updatedAt: Date.now(),
        };
      }

      if (folder.localPoster && folder.localMeta && !folder.localMeta.slug) {
        processed += 1;
        matched += 1;
        if (onProgress && (processed % 3 === 0 || processed === targets.length)) {
          onProgress({ processed, total: targets.length, matched });
        }

        return {
          folderName: folder.name,
          folderPath: folder.folderPath,
          sourceDir: folder.sourceDir,
          sourceDirIndex: folder.sourceDirIndex,
          birthtime: folder.birthtime,
          episodeCount: folder.episodeCount,
          slug: null,
          title: folder.localMeta.title || folder.name,
          poster: folder.localPoster,
          banner: folder.localBanner,
          category: folder.localMeta.category || '',
          year: folder.localMeta.year || '',
          status: folder.localMeta.status || '',
          season: folder.localMeta.season || '',
          providerId: folder.localMeta.providerId ?? null,
          updatedAt: Date.now(),
        };
      }

      // Sin lookup remoto (splash) o sin conexión: fila básica completa en vez
      // de null, para que la siembra ['library', dirs] no oculte carpetas.
      const buildBasicRow = (): LibraryMetaPreloadRow => ({
        folderName: folder.name,
        folderPath: folder.folderPath,
        sourceDir: folder.sourceDir,
        sourceDirIndex: folder.sourceDirIndex,
        birthtime: folder.birthtime,
        episodeCount: folder.episodeCount,
        slug: folder.localMeta?.slug || null,
        title: folder.localMeta?.title || folder.name,
        poster: folder.localPoster,
        banner: folder.localBanner,
        category: folder.localMeta?.category || '',
        year: folder.localMeta?.year || '',
        status: folder.localMeta?.status || '',
        season: folder.localMeta?.season || '',
        providerId: folder.localMeta?.providerId ?? null,
        updatedAt: Date.now(),
      });

      if (!allowRemoteLookup || !(await checkConnectivity())) {
        processed += 1;
        const now = Date.now();
        if (onProgress && (processed % 4 === 0 || now - lastProgressEmit > 450 || processed === targets.length)) {
          lastProgressEmit = now;
          onProgress({ processed, total: targets.length, matched });
        }
        return buildBasicRow();
      }

      const variants = buildLibrarySearchVariants(folder.name);
      const matchingProvider = providerGateway.activeProvider;
      const matchingProviderId = matchingProvider.id;
      let best: AnimeSearchResult | null = null;
      let bestScore = -1;

      for (const q of variants) {
        if (!q) continue;
        const searchCacheKey = `${matchingProviderId}:${q}`;
        if (!searchCache.has(searchCacheKey)) {
          try {
            const found = await matchingProvider.search(q);
            searchCache.set(searchCacheKey, found || []);
          } catch {
            searchCache.set(searchCacheKey, []);
          }
        }

        const list = searchCache.get(searchCacheKey) || [];
        for (const item of list.slice(0, 10)) {
          const title = String(item.title || '').trim();
          const score = computeTitleMatchScore(q, title || '');
          if (score > bestScore) {
            bestScore = score;
            best = item;
          }
        }
      }

      processed += 1;
      const now = Date.now();
      if (onProgress && (processed % 4 === 0 || now - lastProgressEmit > 450 || processed === targets.length)) {
        lastProgressEmit = now;
        onProgress({ processed, total: targets.length, matched });
      }

      // Sin match remoto: conservar la carpeta con fila básica (no ocultar)
      if (!best || bestScore < 38) return buildBasicRow();

      let details: DownloadAnimeDetails | null = null;
      try {
        details = await matchingProvider.getDetails(String(best.slug || ''));
      } catch (error) {
        writeGlobalLog(`No se pudieron obtener detalles de ${String(best.slug || '')}: ${error}`);
      }

      const posterUrl = details?.poster || best.poster || null;
      const localPoster = await ensureFolderPoster(folder.folderPath, posterUrl);
      const localBanner = await ensureFolderBanner(folder.folderPath, posterUrl);

      writeFolderLibraryMeta(folder.folderPath, {
        slug: String(best.slug || ''),
        title: String(details?.title || best.title || folder.name),
        category: details?.category || '',
        year: details?.year || '',
        status: details?.status || '',
        season: details?.season || '',
        providerId: matchingProviderId,
      });

      matched += 1;
      if (onProgress && (processed % 3 === 0 || processed === targets.length)) {
        onProgress({ processed, total: targets.length, matched });
      }

      return {
        folderName: folder.name,
        folderPath: folder.folderPath,
        sourceDir: folder.sourceDir,
        sourceDirIndex: folder.sourceDirIndex,
        birthtime: folder.birthtime,
        episodeCount: folder.episodeCount,
        slug: String(best.slug || ''),
        title: String(details?.title || best.title || folder.name),
        poster: localPoster || best.poster || null,
        banner: localBanner || posterUrl,
        category: details?.category || '',
        year: details?.year || '',
        status: details?.status || '',
        season: details?.season || '',
        providerId: matchingProviderId,
        updatedAt: Date.now(),
      };
    });

    resetRetroOnce();
    return rows.filter(Boolean) as LibraryMetaPreloadRow[];
  } catch {
    return [];
  }
}

async function getAnimeDetailsBySlug(
  slug: string,
  providerId?: DownloadProvider,
): Promise<DownloadAnimeDetails | null> {
  const provider = providerId ? providerManager.getProvider(providerId) : providerGateway.activeProvider;
  if (!provider) return null;
  const details = await provider.getDetails(slug);
  if (!details) return null;
  return {
    ...details,
    banner: null,
    downloadSourceSlug: slug,
    downloadSourceTitle: details.title || null,
  };
}

function updateTrayTooltip(text?: string) {
  windowLifecycleService?.updateTrayTooltip(text);
}

function createTray() {
  windowLifecycleService?.createTray();
}

function destroyTray() {
  windowLifecycleService?.destroyTray();
}

const RESTART_MARKER = '--omnianime-restart';

// Una sola instancia: evita doble SQLite/userData (segunda instancia con la
// DB ocupada arrancaba en animeav1 de fábrica y clavaba el selector).
// Si venimos de "Reiniciar ahora", la anterior aún está saliendo: se reintenta
// el candado unos segundos en vez de cerrar.
function acquireSingleInstanceLock(): Promise<boolean> {
  try {
    if (app.requestSingleInstanceLock()) return Promise.resolve(true);
  } catch {
    return Promise.resolve(true);
  }
  if (!process.argv.includes(RESTART_MARKER)) return Promise.resolve(false);
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      try {
        if (app.requestSingleInstanceLock()) {
          clearInterval(timer);
          resolve(true);
          return;
        }
      } catch {
        clearInterval(timer);
        resolve(true);
        return;
      }
      if (Date.now() - startedAt > 10000) {
        clearInterval(timer);
        resolve(false);
      }
    }, 300);
  });
}

app.on('second-instance', () => {
  try {
    const mainWindow = getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  } catch {}
});

app.whenReady().then(async () => {
  const gotLock = await acquireSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }
  registerOmniMediaProtocol({ logger: appLogger.child('protocol') });
  windowLifecycleService?.configureYouTubeEmbedIdentity();
  windowLifecycleService?.start();
});

app.on('before-quit', () => {
  try {
    flushQueueUpdate();
    preloadedData.libraryMeta = null;
    homeFeedService.clearFreshCache();
  } catch {}
});

const libraryAssetService = new LibraryAssetService({
  database,
  userDataDir: app.getPath('userData'),
  httpClient: axios,
  userAgent: USER_AGENT,
  log: writeGlobalLog,
  getAllowedBaseDirs: () => {
    try {
      const s = SettingsManager.get();
      return s.outputDirs || [s.defaultOutputDir];
    } catch {
      return [];
    }
  },
});
const historyService = new HistoryService({
  store: database,
  getDirInfo: (targetPath) => getDirInfo(targetPath),
  notifyUpdated: () => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('history-updated');
    }
  },
  logError: writeGlobalLog,
  notifyError: (message) => sendLog(message, 'error'),
});
const libraryFileService = new LibraryFileService({
  assetService: libraryAssetService,
  getAllowedBaseDirs: () => {
    const settings = SettingsManager.get();
    return settings.outputDirs || [settings.defaultOutputDir];
  },
  queueOwnsFolder: (folderPath) =>
    downloadQueue.some(
      (item) =>
        (item.status === 'pending' || item.status === 'downloading' || item.status === 'paused') &&
        path.resolve(item.targetPath).toLowerCase() === path.resolve(folderPath).toLowerCase(),
    ),
  getAnimeDetails: (slug) => getAnimeDetailsBySlug(slug),
  getActiveProviderId: () => providerGateway.activeProviderIdName,
  openPath: (targetPath) => shell.openPath(targetPath),
  userDataDir: app.getPath('userData'),
  log: writeGlobalLog,
});
const episodeFileService = new EpisodeFileService({
  getSettings: () => SettingsManager.get(),
  assetService: libraryAssetService,
  log: writeGlobalLog,
  onFilesRenamed: (pairs) => thumbnailService.moveThumbnailsStaged(pairs),
});
const thumbnailService = new ThumbnailService({
  toolsDir: getToolsDir(),
  userDataDir: app.getPath('userData'),
  registerProcess: (child) => activeChildProcesses.add(child),
  unregisterProcess: (child) => activeChildProcesses.delete(child),
  log: writeGlobalLog,
});

function cleanupThumbnails() {
  thumbnailService.cleanupThumbnails();
}

process.on('uncaughtException', (err) => writeGlobalLog(err));
process.on('unhandledRejection', (reason) => writeGlobalLog(reason));

function writeHistory(record: HistoryWriteRecord): boolean {
  return historyService.writeHistory(record);
}

const queueStore = new QueueStore({
  database,
  getSettings: () => SettingsManager.get(),
  canBroadcast: () => {
    const mainWindow = getMainWindow();
    return !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible();
  },
  sendQueueUpdate: (items) => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
      mainWindow.webContents.send('queue-update', items);
      return true;
    }
    return false;
  },
  sendQueueProgress: (delta) => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
      mainWindow.webContents.send('queue-progress', delta);
      return true;
    }
    return false;
  },
  logError: writeGlobalLog,
});
const downloadQueue = queueStore.items;
const appUpdateService = new AppUpdateService({
  hasActiveDownloads: () => downloadQueue.some((item) => item.status === 'downloading'),
  sendStatus: (state) => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app-update-status', state);
    }
  },
  log: writeGlobalLog,
});
// % congelado al pausar: JSON propio en userData (no toca SQLite)
const pausedProgressStore = new PausedProgressStore(path.join(app.getPath('userData'), 'paused-progress.json'));
// Observabilidad por servidor: contadores sanitizados en userData (no toca SQLite)
const serverStatsStore = new ServerStatsStore(path.join(app.getPath('userData'), 'server-stats.json'));
serverStatsStore.load();

const storageService = new StorageService({
  database,
  userDataDir: app.getPath('userData'),
  getAllowedBaseDirs: () => {
    const settings = SettingsManager.get();
    return settings.outputDirs || [settings.defaultOutputDir];
  },
  queueOwnsFolder: (folderPath) =>
    downloadQueue.some(
      (item) =>
        (item.status === 'pending' || item.status === 'downloading' || item.status === 'paused') &&
        path.resolve(item.targetPath).toLowerCase() === path.resolve(folderPath).toLowerCase(),
    ),
  log: writeGlobalLog,
});

function getDirInfo(targetPath: string): { label: string; fullPath: string } {
  return queueStore.getDirInfo(targetPath);
}

function flushQueueUpdate(): void {
  queueStore.flush();
}

function scheduleQueueUpdate(): void {
  queueStore.scheduleUpdate();
}

function scheduleQueueProgress(
  item: QueueItem,
  activeEps?: import('../services/QueueStore').ActiveEpisodeProgress[],
): void {
  queueStore.scheduleProgress(item, activeEps);
}

function sendQueueUpdateImmediate(): void {
  queueStore.flush();
}

function loadQueue(): void {
  queueStore.load();
  // % congelado al pausar (módulo aislado; QueueStore/DB no cambian)
  try {
    const saved = pausedProgressStore.load();
    for (const item of downloadQueue) applyStoredSnapshot(item, saved[item.id]);
  } catch {
    /* degradado: Pausado sin % */
  }
}

function sendQueueUpdate() {
  sendQueueUpdateImmediate();
}

const sendLog = (msg: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') => {
  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('dl-log', { msg, type, time: new Date().toLocaleTimeString() });
    // No enviamos dl-status aquí para evitar que el texto de estado
    // pise el área de logs en el renderer o cause duplicidad visual
  }
};

const sendStatus = (msg: string, isBatch: boolean = false) => {
  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('dl-status', { msg, isBatch });
  }
};

const getNormalizedDownloadSettings = () => {
  try {
    return normalizeDownloadSettings(SettingsManager.get().download);
  } catch {
    return normalizeDownloadSettings(undefined);
  }
};

const episodeDownloadAttemptService = new EpisodeDownloadAttemptService({
  downloadService,
  getFfmpegTools: getFfmpegTools,
  userAgent: USER_AGENT,
  hlsPlayerReferer: HLS_PLAYER_REFERER,
  log: sendLog,
  logError: writeGlobalLog,
  getDownloadSettings: getNormalizedDownloadSettings,
});

const SERVER_SPEED: Record<string, string> = {
  Mega: 'rápido ⚡',
  HLS: 'streaming ⚡',
};

function normalizeServerName(serverRaw: string): string {
  return normalizeServerNameUtil(serverRaw);
}

function isBlockedServer(canonicalServer: string): boolean {
  return isBlockedServerUtil(canonicalServer);
}

function getServerPriorityOrder(providerId?: string): string[] {
  return getServerPriorityOrderUtil(providerId);
}

function getAllowedServersForProvider(_provider: DownloadProvider, order: string[]): string[] {
  return [...order];
}

// Traza diagnóstica por servidor (found/normalized/blocked/deduplicated/
// allowlisted). Solo activa con OMNIANIME_SERVER_TRACE=1; nunca loguea URLs.
function isServerTraceEnabled(): boolean {
  return process.env.OMNIANIME_SERVER_TRACE === '1';
}

function traceServerStage(ep: number, providerId: string, server: string, stage: string): void {
  if (!isServerTraceEnabled()) return;
  sendLog(`[server-trace] EP ${ep} ${providerId} ${server} ${stage}`, 'info');
}

async function getEpisodeLinksFromProviders(
  item: QueueItem,
  ep: number,
  signal?: AbortSignal,
): Promise<ProviderDownloadLink[]> {
  const slug = String(item.downloadSlug || item.slug || '').trim();
  // DUB desactivado: solo SUB
  const lang = item.lang === 'DUB' ? 'SUB' : item.lang || 'SUB';
  if (!slug || signal?.aborted) return [];

  // Usa providerId del QueueItem, no el activo global (§2 persistente)
  const targetProviderId = (item.providerId || providerManager.activeProviderIdName) as DownloadProvider;
  const order = getServerPriorityOrder(targetProviderId);
  const provider = providerManager.getProvider(targetProviderId) || providerManager.activeProvider;
  sendLog(`🔎 EP ${ep}: buscando servidores en ${targetProviderId}...`, 'info');

  const providerLinks: ProviderDownloadLink[] = [];
  const dedupe = new Set<string>();
  const allowedServers = new Set(getAllowedServersForProvider(targetProviderId, order));
  const rows = await provider.getLinks(slug, ep, lang, signal).catch(() => []);
  if (signal?.aborted) return [];

  for (const l of rows) {
    const rawName = String(l.server || '').trim() || '?';
    traceServerStage(ep, targetProviderId, rawName, 'found');
    serverStatsStore.recordFound(targetProviderId, rawName);
    const canonicalServer = normalizeServerName(l.server);
    if (canonicalServer !== rawName) {
      traceServerStage(ep, targetProviderId, `${rawName}->${canonicalServer}`, 'normalized');
    }
    if (!l.url) {
      traceServerStage(ep, targetProviderId, canonicalServer, 'blocked:empty-url');
      continue;
    }
    if (isBlockedServer(canonicalServer)) {
      traceServerStage(ep, targetProviderId, canonicalServer, 'blocked:security');
      continue;
    }
    if (!allowedServers.has(canonicalServer)) {
      traceServerStage(ep, targetProviderId, canonicalServer, 'blocked:allowlist');
      continue;
    }

    const key = `${slug}|${ep}|${canonicalServer.toLowerCase()}|${l.url}`;
    if (dedupe.has(key)) {
      traceServerStage(ep, targetProviderId, canonicalServer, 'deduplicated');
      continue;
    }
    dedupe.add(key);
    traceServerStage(ep, targetProviderId, canonicalServer, 'allowlisted');
    serverStatsStore.recordAllowlisted(targetProviderId, canonicalServer);

    providerLinks.push({
      server: canonicalServer,
      url: l.url,
      provider: targetProviderId,
      canonicalServer,
      sourceSlug: slug,
      sourceEpisode: ep,
    });
  }

  if (providerLinks.length > 0) {
    const names = Array.from(new Set(providerLinks.map((link) => link.canonicalServer)));
    sendLog(
      `✅ EP ${ep}: en ${targetProviderId} se encontraron ${providerLinks.length} servidor(es): ${names.join(', ')}`,
      'info',
    );
    return providerLinks;
  }

  sendLog(`⚠ EP ${ep}: en ${targetProviderId} no se encontró servidor disponible.`, 'warn');
  return [];
}

function buildQueueEpisodePath(item: QueueItem, episode: number): string {
  // DUB desactivado: solo SUB
  const lang = item.lang === 'DUB' ? 'SUB' : item.lang || 'SUB';
  return path.join(
    item.targetPath,
    buildCanonicalEpisodeFileName(episode, '.mp4', path.basename(item.targetPath), undefined, lang as 'SUB' | 'DUB'),
  );
}

const queueProcessor = new DownloadQueueProcessor({
  queueStore,
  attemptService: episodeDownloadAttemptService,
  abortDownloadService: () => downloadService.abort(),
  pausedProgress: pausedProgressStore,
  getDownloadSettings: getNormalizedDownloadSettings,
  getEpisodeLinks: getEpisodeLinksFromProviders,
  getServerPriorityOrder,
  getServerSpeed: (server) => SERVER_SPEED[server] || '–',
  buildEpisodePath: buildQueueEpisodePath,
  writeHistory,
  sendLog,
  sendProgressLog: (logId, message) => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('dl-log-progress', {
        logId,
        msg: message,
        time: new Date().toLocaleTimeString(),
      });
    }
  },
  sendStatus,
  updateTray: updateTrayTooltip,
  scheduleQueueUpdate,
  scheduleQueueProgress,
  sendQueueUpdate,
  recordServerOutcome: (outcome) => serverStatsStore.recordOutcome(outcome),
  sendDownloadStarted: (item) => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('download-started', {
        animeTitle: item.animeTitle,
        episodesCount: item.episodes.length,
      });
    }
  },
  sendEpisodeDownloaded: (item, episode, success) => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('episode-downloaded', {
        slug: item.slug,
        episode,
        success,
        animeTitle: item.animeTitle,
      });
    }
  },
  sendNotification: sendOSNotification,
  isMainWindowFocused: () => {
    const mainWindow = getMainWindow();
    return !mainWindow || mainWindow.isFocused();
  },
  shouldNotifyCompletion: () => {
    const mainWindow = getMainWindow();
    return !!mainWindow && (!mainWindow.isVisible() || !mainWindow.isFocused());
  },
  logError: writeGlobalLog,
  logger: appLogger.child('queue'),
});

windowLifecycleService = new WindowLifecycleService({
  getAppHtmlPath,
  getAppIconPath,
  getSplashHtmlPath,
  getSplashPreloadPath: () => path.join(__dirname, 'splashPreload.js'),
  getPreloadPath: () => path.join(__dirname, 'preload.js'),
  getDevServerUrl,
  isPackaged: () => app.isPackaged,
  getSettings: () => SettingsManager.get(),
  initializeDatabase: () => database.init(),
  setActiveProvider: (providerId) => {
    const ok = providerGateway.setActiveProvider(providerId);
    if (!ok) writeGlobalLog(`Proveedor desconocido al arrancar: ${String(providerId)}`);
    return ok;
  },
  getActiveProviderId: () => providerGateway.activeProvider.id,
  checkTools: () => {
    try {
      const toolsDir = getToolsDir();
      return {
        ffmpeg: fs.existsSync(path.join(toolsDir, 'ffmpeg.exe')),
      };
    } catch {
      return { ffmpeg: false };
    }
  },
  loadStartupData: async (settings, updateStatus): Promise<PreloadedData> => {
    updateStatus('Precargando inicio, filtros y catálogo...', 36);

    // Resiliente por etapa: un proveedor caído no tumba home+filtros+catálogo+librería
    const [home, filters, catalog, libraryMeta] = await Promise.all([
      homeFeedService.getHomeFeed('anime', 30, false).catch((e) => {
        writeGlobalLog(`preload home falló: ${String(e)}`);
        return null;
      }),
      providerGateway.activeProvider.getFiltersData().catch((e) => {
        writeGlobalLog(`preload filters falló: ${String(e)}`);
        return null;
      }),
      providerGateway.activeProvider.getCatalog({ page: 1 }).catch((e) => {
        writeGlobalLog(`preload catalog falló: ${String(e)}`);
        return null;
      }),
      (async () => {
        updateStatus('Escaneando librería local (0%)...', 52);
        const libDirs = settings.outputDirs || [settings.defaultOutputDir];
        return buildLibraryMetaPreload(
          libDirs,
          0,
          ({ processed, total, matched }) => {
            const pct = total > 0 ? Math.min(96, Math.round((processed / total) * 36) + 52) : 52;
            updateStatus(`Escaneando librería local (${processed}/${total}, match: ${matched})...`, pct);
          },
          false,
        );
      })(),
    ]);

    return { providerId: providerGateway.activeProvider.id, home, filters, catalog, libraryMeta };
  },
  warmLibrary: async (settings) => {
    await buildLibraryMetaPreload(settings.outputDirs || [settings.defaultOutputDir], 0, undefined, true);
  },
  setPreloadedData: ({ providerId, home, filters, catalog, libraryMeta }) => {
    preloadedData.providerId = providerId;
    preloadedData.home = home;
    preloadedData.filters = filters;
    preloadedData.catalog = catalog;
    preloadedData.libraryMeta = libraryMeta;
  },
  loadQueue,
  cleanupThumbnails,
  sendQueueUpdateImmediate,
  hasActiveDownloads: () => downloadQueue.some((item) => item.status === 'downloading'),
  getIsQuitting: () => isQuitting,
  setIsQuitting: (value) => {
    isQuitting = value;
  },
  writeLog: writeGlobalLog,
  logger: appLogger.child('window'),
});

function processQueue(): Promise<void> {
  return queueProcessor.processQueue();
}

registerIpcHandlers({
  preloadedData,
  providerGateway,
  homeFeedService,
  historyService,
  libraryFileService,
  episodeFileService,
  thumbnailService,
  queueStore,
  queueProcessor,
  serverStatsStore,
  downloadQueue,
  appUpdateService,
  storageService,
  getMainWindow,
  getAllowedBaseDirs: () => {
    const settings = SettingsManager.get();
    return settings.outputDirs || [settings.defaultOutputDir];
  },
  getConnectivityStatus: () => getConnectivityStatusImpl(),
  getAnimeDetailsBySlug,
  ensureFolderPoster,
  ensureFolderBanner,
  writeFolderLibraryMeta,
  normalizeEpisodeFilesInFolder,
  processQueue,
  sendQueueUpdate,
  createTray,
  destroyTray,
  setIsQuitting: (value) => {
    isQuitting = value;
  },
  writeGlobalLog,
  scopedLog,
  getLogPath: () => appLogger.getLogFile(),
  getSessionStart: () => sessionStartIso,
  refreshLogging: () => applyLoggingSettings(),
  markRendererReady: () => windowLifecycleService?.markRendererReady(),
});

appUpdateService.scheduleInitialCheck();

function buildCanonicalEpisodeFileName(
  episodeNumber: number,
  ext: string,
  folderName?: string,
  overrideStyle?: 'minimal' | 'descriptive',
  lang?: 'SUB' | 'DUB',
): string {
  // DUB desactivado: solo SUB
  const normalizedLang = lang === 'DUB' ? 'SUB' : lang || 'SUB';
  const settings = SettingsManager.get();
  const style = overrideStyle || settings.namingStyle || 'descriptive';
  return buildCanonicalEpisodeFileNameUtil(episodeNumber, ext, folderName, style, normalizedLang as 'SUB' | 'DUB');
}

function normalizeEpisodeFilesInFolder(
  animePath: string,
  forceRename = false,
  overrideStyle?: 'minimal' | 'descriptive',
) {
  return episodeFileService.normalizeEpisodeFilesInFolder(animePath, forceRename, overrideStyle);
}
