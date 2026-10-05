import { BrowserWindow, ipcMain } from 'electron';
import type { DownloadAnimeDetails } from '../types/anime';
import type { DownloadProvider, QueueItem } from '../types/queue';
import { ProviderGateway } from '../services/providers/ProviderGateway';
import { HomeFeedService } from '../services/providers/HomeFeedService';
import { ScheduleService } from '../services/providers/ScheduleService';
import { HistoryService } from '../services/library/HistoryService';
import { LibraryFileService } from '../services/library/LibraryFileService';
import { EpisodeFileService } from '../services/library/EpisodeFileService';
import { ThumbnailService } from '../services/library/ThumbnailService';
import { QueueStore } from '../services/persistence/QueueStore';
import { ServerStatsStore } from '../services/persistence/ServerStatsStore';
import { DownloadQueueProcessor } from '../services/downloads/DownloadQueueProcessor';
import { QueueEnqueueService } from '../services/downloads/QueueEnqueueService';
import { AppUpdateService } from '../services/update/AppUpdateService';
import { StorageService } from '../services/library/StorageService';
import type { PreloadedData } from './WindowLifecycleService';
import { registerProviderHandlers } from './ipc/handlers/provider.handlers';
import { registerHistoryHandlers } from './ipc/handlers/history.handlers';
import { registerWindowHandlers } from './ipc/handlers/window.handlers';
import { registerQueueHandlers } from './ipc/handlers/queue.handlers';
import { registerSettingsHandlers } from './ipc/handlers/settings.handlers';
import { registerCatalogHandlers } from './ipc/handlers/catalog.handlers';
import { registerAniListHandlers } from './ipc/handlers/anilist.handlers';
import { registerLibraryHandlers } from './ipc/handlers/library.handlers';
import { registerAppUpdaterHandlers } from './ipc/handlers/app-updater.handlers';
import { registerStorageHandlers } from './ipc/handlers/storage.handlers';
import { registerServerStatsHandlers } from './ipc/handlers/server-stats.handlers';
import { registerLogsHandlers } from './ipc/handlers/logs.handlers';
import { registerSoundHandlers } from './ipc/handlers/sounds.handlers';
import type { LogScope, ScopedLogger } from '../services/logging/AppLogger';
import type { InvokeChannel, SendChannel } from '../types/ipc-channels';

// Canales propios de IpcRegistry; el resto de registros viven en ipc/handlers/.
const rendererReadyChannel: InvokeChannel = 'renderer-ready';
const logErrorChannel: SendChannel = 'log-error';

export interface IpcRegistryDependencies {
  preloadedData: PreloadedData;
  providerGateway: ProviderGateway;
  homeFeedService: HomeFeedService;
  scheduleService: ScheduleService;
  historyService: HistoryService;
  libraryFileService: LibraryFileService;
  episodeFileService: EpisodeFileService;
  thumbnailService: ThumbnailService;
  queueStore: QueueStore;
  queueProcessor: DownloadQueueProcessor;
  queueEnqueueService: QueueEnqueueService;
  serverStatsStore: ServerStatsStore;
  downloadQueue: QueueItem[];
  appUpdateService: AppUpdateService | null;
  storageService: StorageService | null;
  getMainWindow: () => BrowserWindow | null;
  getAllowedBaseDirs: () => string[];
  getConnectivityStatus: () => boolean;
  getAnimeDetailsBySlug: (slug: string, providerId?: DownloadProvider) => Promise<DownloadAnimeDetails | null>;
  normalizeEpisodeFilesInFolder: (animePath: string, overrideStyle?: 'minimal' | 'descriptive') => unknown;
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
  registerAniListHandlers(dependencies);
  registerLibraryHandlers(dependencies);
  registerAppUpdaterHandlers(dependencies);
  registerStorageHandlers(dependencies);
  registerSoundHandlers(dependencies);
  registerServerStatsHandlers(dependencies);
  registerLogsHandlers(dependencies);
  // Señal del renderer tras el primer render con home listo; sin args.
  ipcMain.handle(rendererReadyChannel, () => {
    dependencies.markRendererReady();
  });
  // Anti-spam: un loop de errores en renderer no debe tumbar main ni el disco.
  const logErrorStamps: number[] = [];
  ipcMain.on(logErrorChannel, (_, error) => {
    const now = Date.now();
    while (logErrorStamps.length > 0 && now - logErrorStamps[0] > 1000) logErrorStamps.shift();
    if (logErrorStamps.length >= 20) return;
    logErrorStamps.push(now);
    dependencies.writeGlobalLog(error, true);
  });
}
