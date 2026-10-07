import { app, BrowserWindow, shell, Notification, protocol } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';
import { createMainContext } from './appContext';
import { setupHardwareAcceleration } from './bootstrap/hardwareAcceleration';
import { setupBackgroundBehavior } from './bootstrap/backgroundBehavior';
import { checkConnectivity, getConnectivityStatus as getConnectivityStatusImpl } from './bootstrap/connectivity';
import { registerOmniMediaProtocol } from './bootstrap/protocol';
import { setupContextMenu } from './bootstrap/contextMenu';
import {
  getAppHtmlPath,
  getAppIconPath,
  getTrayIconPath,
  getSplashHtmlPath,
  getToolsDir,
  getFfmpegTools,
} from './runtimePaths';
import { ProviderManager } from '../services/providers/ProviderManager';
import { DownloadService } from '../services/downloads/DownloadService';
import { EpisodeDownloadAttemptService } from '../services/downloads/EpisodeDownloadAttemptService';
import { DownloadQueueProcessor } from '../services/downloads/DownloadQueueProcessor';
import { EpisodeLinksService } from '../services/downloads/EpisodeLinksService';
import { QueueEnqueueService } from '../services/downloads/QueueEnqueueService';
import { AppLogger, type LogScope, type ScopedLogger } from '../services/logging/AppLogger';
import { effectiveMinLevel, normalizeLoggingSettings } from '../utils/logging/loggingSettings';
import { buildLibraryScanStatusText } from '../utils/splashBoot';
import { EpisodeFileService } from '../services/library/EpisodeFileService';
import { HistoryService } from '../services/library/HistoryService';
import { LibraryAssetService } from '../services/library/LibraryAssetService';
import { LibraryFileService } from '../services/library/LibraryFileService';
import { LibraryPreloadService } from '../services/library/LibraryPreloadService';
import { QueueStore } from '../services/persistence/QueueStore';
import { PausedProgressStore, applyStoredSnapshot } from '../services/persistence/PausedProgressStore';
import { AppUpdateService } from '../services/update/AppUpdateService';
import { ServerStatsStore } from '../services/persistence/ServerStatsStore';
import { ConcurrencyExperimentStore, resolveCadenceProfile } from '../services/downloads/attemptExperiments';
import { ThumbnailService } from '../services/library/ThumbnailService';
import { createRuntimeDirectories } from '../services/persistence/RuntimeDirectories';
import { SettingsManager } from '../services/persistence/SettingsManager';
import { DatabaseManager } from '../services/persistence/DatabaseManager';
import { StorageService } from '../services/library/StorageService';
import { terminateChildProcessTree } from '../utils/processUtils';
import type { DownloadAnimeDetails } from '../types/anime';
import type { HistoryWriteRecord } from '../types/history';
import type { QueueItem } from '../types/queue';
import { buildCanonicalEpisodeFileName as buildCanonicalEpisodeFileNameUtil } from '../utils/episodeUtils';
import { normalizeFolderNameSource } from '../utils/downloads/folderNaming';
import {
  detectFreshInstall,
  normalizeDownloadSettings,
  seedFreshInstallDownloadSettings,
} from '../utils/downloads/downloadSettings';
import { USER_AGENT } from '../utils/windowUtils';
import { WindowLifecycleService, type PreloadedData } from './WindowLifecycleService';
import { registerIpcHandlers } from './IpcRegistry';
import { resolveAniListBannerResult } from './anilistBanner';

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

// Antes de que los servicios creen sus ficheros: si no hay rastro de ejecuciones
// previas, es una instalación nueva.
const isFreshInstall = detectFreshInstall(app.getPath('userData'));
const runtimeDirectories = createRuntimeDirectories(app.getPath('userData'));
const bootDate = new Date();
const appLogger = new AppLogger(runtimeDirectories, { appVersion: app.getVersion(), sessionDate: bootDate });
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
const sessionStartIso = bootDate.toISOString();
// El nivel del usuario antes de podar/escribir cabecera: los primeros logs
// ya respetan su ajuste en vez del 'info' por defecto.
applyLoggingSettings();
// Instalaciones nuevas arrancan con el interruptor en ON; las existentes no se tocan.
if (isFreshInstall) {
  try {
    const seeded = SettingsManager.get();
    seeded.download = seedFreshInstallDownloadSettings(seeded.download);
    SettingsManager.save(seeded);
  } catch {}
}
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
DatabaseManager.setLogger(appLogger.child('db'));
SettingsManager.setLogger(appLogger.child('settings'));

setupHardwareAcceleration({ logger: appLogger.child('app') });
setupBackgroundBehavior();

const providerManager = new ProviderManager({ logger: appLogger.child('provider') });
// Solo con OMNIANIME_DIRECT_RANGED_FROM_ONE=1 el pool ranged corre con 1 worker
// (para medirlo contra el camino simple).
const directRangedFromOne = process.env.OMNIANIME_DIRECT_RANGED_FROM_ONE === '1';
const downloadService = new DownloadService({
  logger: appLogger.child('download'),
  rangedFromOne: directRangedFromOne,
});
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
const { database, homeFeedService, scheduleService, providerGateway } = mainContext;

const preloadedData: PreloadedData = {
  providerId: 'animeav1',
  home: null,
  filters: null,
  catalog: null,
  libraryMeta: null,
};

async function getAnimeDetailsBySlug(slug: string, providerId?: string | null): Promise<DownloadAnimeDetails | null> {
  const provider = (providerId ? providerManager.getProvider(providerId) : undefined) ?? providerGateway.activeProvider;
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
    scheduleService.clearFreshCache();
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
  getAnimeDetails: (slug, providerId) => getAnimeDetailsBySlug(slug, providerId),
  getActiveProviderId: () => providerGateway.activeProviderIdName,
  resolveAniListMeta: (input) => resolveAniListBannerResult(input),
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
const libraryPreloadService = new LibraryPreloadService({
  assetService: libraryAssetService,
  getMatchingProvider: (preferredProviderId) =>
    (preferredProviderId ? providerGateway.getProvider(preferredProviderId) : undefined) ??
    providerGateway.activeProvider,
  resolveAniListMeta: (input) => resolveAniListBannerResult(input),
  checkConnectivity,
  log: writeGlobalLog,
  scopedLogError: (message) => scopedLog('app').error(message),
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

// Modo experimental de concurrencia (OMNIANIME_CONCURRENCY_EXPERIMENT=learned|cold):
// escribe en su propio fichero y no toca el aprendizaje de server-stats.json.
const concurrencyExperimentMode = process.env.OMNIANIME_CONCURRENCY_EXPERIMENT;
const concurrencyExperimentStore = concurrencyExperimentMode
  ? new ConcurrencyExperimentStore(path.join(app.getPath('userData'), 'concurrency-experiments.json'))
  : null;
concurrencyExperimentStore?.load();
// Cadencia del modo adaptativo: fast por defecto. Con
// OMNIANIME_CONCURRENCY_CADENCE=baseline se vuelve al comparador histórico.
const concurrencyCadenceProfile = resolveCadenceProfile(process.env.OMNIANIME_CONCURRENCY_CADENCE);

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
  activeEps?: import('../services/persistence/QueueStore').ActiveEpisodeProgress[],
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
  fileLog: appLogger.child('download'),
  // En modo experimental el aprendizaje se lee del shadow; en producción, de
  // server-stats.json.
  getConcurrencyLearning: (provider, server) =>
    concurrencyExperimentStore
      ? concurrencyExperimentStore.getShadowLearning(provider, server)
      : serverStatsStore.getConcurrencyLearning(provider, server),
  recordConcurrencyObservation: (observation) => serverStatsStore.recordConcurrencyObservation(observation),
  // Cadencia del modo adaptativo: fast por defecto (baseline con la variable).
  cadenceProfile: concurrencyCadenceProfile,
  // El modo experimental registra el controller aparte y no escribe aprendizaje.
  // No activa adaptive por sí mismo: sin la setting, queda inerte.
  ...(concurrencyExperimentStore
    ? {
        experiment: {
          record: (record: Parameters<ConcurrencyExperimentStore['recordAttempt']>[0]) =>
            concurrencyExperimentStore.recordAttempt(record),
          coldStart: concurrencyExperimentMode === 'cold',
        },
      }
    : {}),
});

const SERVER_SPEED: Record<string, string> = {
  Mega: 'rápido',
  HLS: 'streaming',
};

function buildQueueEpisodePath(item: QueueItem, episode: number): string {
  // DUB desactivado: solo SUB
  const lang = item.lang === 'DUB' ? 'SUB' : item.lang || 'SUB';
  return path.join(
    item.targetPath,
    buildCanonicalEpisodeFileName(episode, '.mp4', path.basename(item.targetPath), undefined, lang as 'SUB' | 'DUB'),
  );
}

const episodeLinksService = new EpisodeLinksService({
  getProviderById: (providerId) => providerManager.getProvider(providerId),
  getActiveProvider: () => providerManager.activeProvider,
  getActiveProviderId: () => providerManager.activeProviderIdName,
  getServerOrderSettings: () => SettingsManager.get().download,
  recordFound: (provider, server) => serverStatsStore.recordFound(provider, server),
  recordAllowlisted: (provider, server) => serverStatsStore.recordAllowlisted(provider, server),
  log: sendLog,
});

const queueEnqueueService = new QueueEnqueueService({
  getAnimeDetails: (slug, providerId) => getAnimeDetailsBySlug(slug, providerId),
  getActiveProviderId: () => providerGateway.activeProviderIdName,
  getOutputDirs: () => {
    const settings = SettingsManager.get();
    return {
      outputDirs: settings.outputDirs || [settings.defaultOutputDir],
      defaultOutputDir: settings.defaultOutputDir,
    };
  },
  listQueueItems: () => downloadQueue,
  ensureFolderPoster: (folderPath, posterUrl) => libraryAssetService.ensureFolderPoster(folderPath, posterUrl),
  ensureFolderBanner: (folderPath, bannerUrl) => libraryAssetService.ensureFolderBanner(folderPath, bannerUrl),
  resolveAniListMeta: (input, onFailure) => resolveAniListBannerResult(input, undefined, onFailure),
  getFolderNameSource: () => normalizeFolderNameSource(SettingsManager.get().download?.folderNameSource),
  getFolderMetaSlug: (folderPath) => libraryAssetService.readFolderLibraryMeta(folderPath)?.slug ?? null,
  urlToFilePath: (url) => LibraryAssetService.urlToFilePath(url),
  writeFolderLibraryMeta: (folderPath, data) => libraryAssetService.writeFolderLibraryMeta(folderPath, data),
  addItem: (item) => queueStore.add(item),
  sendQueueUpdate: () => sendQueueUpdate(),
  processQueue: () => processQueue(),
  logQueue: (message, meta) => scopedLog('queue').info(message, meta),
  logAnilistWarn: (message) => scopedLog('anilist').warn(message),
  logError: (error) => writeGlobalLog(error),
});

const queueProcessor = new DownloadQueueProcessor({
  queueStore,
  attemptService: episodeDownloadAttemptService,
  abortDownloadService: () => downloadService.abort(),
  pausedProgress: pausedProgressStore,
  getDownloadSettings: getNormalizedDownloadSettings,
  getEpisodeLinks: (item, ep, signal) => episodeLinksService.getEpisodeLinks(item, ep, signal),
  getServerPriorityOrder: (providerId) => episodeLinksService.getServerPriorityOrder(providerId),
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
  recordEpisodeOutcome: (summary) => serverStatsStore.recordEpisode(summary),
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
  getTrayIconPath,
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
        updateStatus('Escaneando librería local...', 52);
        const libDirs = settings.outputDirs || [settings.defaultOutputDir];
        return libraryPreloadService.buildMetaPreload(
          libDirs,
          0,
          ({ processed, total }) => {
            // El escaneo vive en 52→74: los pasos siguientes arrancan en 80.
            const pct = total > 0 ? Math.min(74, Math.round((processed / total) * 22) + 52) : 52;
            updateStatus(buildLibraryScanStatusText(processed, total), pct);
          },
          false,
        );
      })(),
    ]);

    return { providerId: providerGateway.activeProvider.id, home, filters, catalog, libraryMeta };
  },
  warmLibrary: async (settings) => {
    await libraryPreloadService.buildMetaPreload(
      settings.outputDirs || [settings.defaultOutputDir],
      0,
      undefined,
      true,
    );
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
  scheduleService,
  historyService,
  libraryFileService,
  episodeFileService,
  thumbnailService,
  queueStore,
  queueProcessor,
  queueEnqueueService,
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

function normalizeEpisodeFilesInFolder(animePath: string, overrideStyle?: 'minimal' | 'descriptive') {
  return episodeFileService.normalizeEpisodeFilesInFolder(animePath, overrideStyle);
}
