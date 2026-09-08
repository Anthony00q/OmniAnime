import { BrowserWindow, ipcMain } from 'electron';
import type { DownloadAnimeDetails } from '../types/anime';
import type { FolderLibraryMeta } from '../types/library';
import type { DownloadProvider, QueueItem } from '../types/queue';
import type { YtdlpUpdateResult } from '../types/ytdlp';
import { ProviderGateway } from '../services/ProviderGateway';
import { HomeFeedService } from '../services/HomeFeedService';
import { HistoryService } from '../services/HistoryService';
import { LibraryFileService } from '../services/LibraryFileService';
import { EpisodeFileService } from '../services/EpisodeFileService';
import { ThumbnailService } from '../services/ThumbnailService';
import { QueueStore } from '../services/QueueStore';
import { ServerStatsStore } from '../services/ServerStatsStore';
import { DownloadQueueProcessor } from '../services/DownloadQueueProcessor';
import { YtdlpUpdateService } from '../services/YtdlpUpdateService';
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
import { registerToolHandlers } from './ipc/handlers/tools.handlers';
import { registerAppUpdaterHandlers } from './ipc/handlers/app-updater.handlers';
import { registerStorageHandlers } from './ipc/handlers/storage.handlers';
import { registerServerStatsHandlers } from './ipc/handlers/server-stats.handlers';

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
  ytdlpUpdateService: YtdlpUpdateService | null;
  appUpdateService: AppUpdateService | null;
  storageService: StorageService | null;
  getYtdlpUpdatePromise: () => Promise<YtdlpUpdateResult> | null;
  setYtdlpUpdatePromise: (promise: Promise<YtdlpUpdateResult> | null) => void;
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
  registerToolHandlers(dependencies);
  registerAppUpdaterHandlers(dependencies);
  registerStorageHandlers(dependencies);
  registerServerStatsHandlers(dependencies);
  // Señal del renderer tras el primer render con home listo; sin args.
  ipcMain.handle('renderer-ready', () => {
    dependencies.markRendererReady();
  });
  ipcMain.on('log-error', (_, error) => dependencies.writeGlobalLog(error, true));
}
