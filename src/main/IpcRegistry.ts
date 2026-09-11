import { BrowserWindow, ipcMain } from 'electron';
import type { DownloadAnimeDetails } from '../types/anime';
import type { FolderLibraryMeta } from '../types/library';
import type { DownloadProvider, QueueItem } from '../types/queue';
import { ProviderGateway } from '../services/ProviderGateway';
import { HomeFeedService } from '../services/HomeFeedService';
import { HistoryService } from '../services/HistoryService';
import { LibraryFileService } from '../services/LibraryFileService';
import { EpisodeFileService } from '../services/EpisodeFileService';
import { ThumbnailService } from '../services/ThumbnailService';
import { QueueStore } from '../services/QueueStore';
import { ServerStatsStore } from '../services/ServerStatsStore';
import { DownloadQueueProcessor } from '../services/DownloadQueueProcessor';
import { AppUpdateService } from '../services/AppUpdateService';
import { StorageService } from '../services/StorageService';
import type { PreloadedData } from './WindowLifecycleService';
import { registerProviderHandlers } from './ipc/handlers/provider.handlers';
import { registerHistoryHandlers } from './ipc/handlers/history.handlers';
import { registerWindowHandlers } from './ipc/handlers/window.handlers';
import { registerQueueHandlers } from './ipc/handlers/queue.handlers';
import { registerSettingsHandlers } from './ipc/handlers/settings.handlers';
import { registerCatalogHandlers } from './ipc/handlers/catalog.handlers';
import { registerLibraryHandlers } from './ipc/handlers/library.handlers';
import { registerAppUpdaterHandlers } from './ipc/handlers/app-updater.handlers';
import { registerStorageHandlers } from './ipc/handlers/storage.handlers';
import { registerServerStatsHandlers } from './ipc/handlers/server-stats.handlers';
import { registerLogsHandlers } from './ipc/handlers/logs.handlers';
import type { LogScope, ScopedLogger } from '../services/AppLogger';

export interface IpcRegistryDependencies {
  preloadedData: PreloadedData;
  providerGateway: ProviderGateway;
  homeFeedService: HomeFeedService;
  historyService: HistoryService;
  libraryFileService: LibraryFileService;
  episodeFileService: EpisodeFileService;
  thumbnailService: ThumbnailService;
  queueStore: QueueStore;
  queueProcessor: DownloadQueueProcessor;
  serverStatsStore: ServerStatsStore;
  downloadQueue: QueueItem[];
  appUpdateService: AppUpdateService | null;
  storageService: StorageService | null;
  getMainWindow: () => BrowserWindow | null;
  getAllowedBaseDirs: () => string[];
  getConnectivityStatus: () => boolean;
  getAnimeDetailsBySlug: (slug: string, providerId?: DownloadProvider) => Promise<DownloadAnimeDetails | null>;
  ensureFolderPoster: (folderPath: string, posterUrl: string | null | undefined) => Promise<string | null>;
  ensureFolderBanner: (folderPath: string, bannerUrl: string | null | undefined) => Promise<string | null>;
  writeFolderLibraryMeta: (folderPath: string, data: FolderLibraryMeta) => void;
  normalizeEpisodeFilesInFolder: (
    animePath: string,
    forceRename?: boolean,
    overrideStyle?: 'minimal' | 'descriptive',
  ) => unknown;
  processQueue: () => Promise<void>;
  sendQueueUpdate: () => void;
  createTray: () => void;
  destroyTray: () => void;
  setIsQuitting: (value: boolean) => void;
  writeGlobalLog: (error: unknown, isRenderer?: boolean) => void;
  scopedLog: (scope: LogScope) => ScopedLogger;
  getSessionStart: () => string;
  getLogPath: () => string;
  refreshLogging: () => void;
  markRendererReady: () => void;
}

export function registerIpcHandlers(dependencies: IpcRegistryDependencies): void {
  registerProviderHandlers(dependencies);
  registerHistoryHandlers(dependencies);
  registerWindowHandlers(dependencies);
  registerQueueHandlers(dependencies);
  registerSettingsHandlers(dependencies);
  registerCatalogHandlers(dependencies);
  registerLibraryHandlers(dependencies);
  registerAppUpdaterHandlers(dependencies);
  registerStorageHandlers(dependencies);
  registerServerStatsHandlers(dependencies);
  registerLogsHandlers(dependencies);
  // Señal del renderer tras el primer render con home listo; sin args.
  ipcMain.handle('renderer-ready', () => {
    dependencies.markRendererReady();
  });
  // Anti-spam: un loop de errores en renderer no debe tumbar main ni el disco.
  const logErrorStamps: number[] = [];
  ipcMain.on('log-error', (_, error) => {
    const now = Date.now();
    while (logErrorStamps.length > 0 && now - logErrorStamps[0] > 1000) logErrorStamps.shift();
    if (logErrorStamps.length >= 20) return;
    logErrorStamps.push(now);
    dependencies.writeGlobalLog(error, true);
  });
}
