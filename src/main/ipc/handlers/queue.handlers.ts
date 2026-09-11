import { ipcMain, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { SettingsManager } from '../../../services/SettingsManager';
import { LibraryAssetService } from '../../../services/LibraryAssetService';
import { formatEpisodeCountLabel, normalizeDisplayAnimeTitle } from '../../../utils/titleUtils';
import { isPathSafeForDestructiveOperation } from '../../../utils/pathSecurity';
import type { DownloadProvider, QueueItem } from '../../../types/queue';
import type { IpcRegistryDependencies } from '../../IpcRegistry';

function isValidEpisodeParam(episode: unknown): episode is number {
  return typeof episode === 'number' && Number.isInteger(episode) && episode > 0 && episode < 100000;
}

export function registerQueueHandlers(dependencies: IpcRegistryDependencies): void {
  const {
    providerGateway,
    queueStore,
    queueProcessor,
    downloadQueue,
    getAnimeDetailsBySlug,
    ensureFolderPoster,
    ensureFolderBanner,
    writeFolderLibraryMeta,
    processQueue,
    sendQueueUpdate,
    writeGlobalLog,
    scopedLog,
  } = dependencies;

  ipcMain.handle(
    'add-to-queue',
    async (
      _,
      payload: {
        slug: string;
        episodes: number[];
        preferredServer?: string;
        lang?: 'SUB' | 'DUB';
        outputDirIndex?: number;
      },
    ) => {
      const { slug, episodes, preferredServer, lang: rawLang, outputDirIndex } = payload;
      // DUB desactivado: solo SUB
      const lang = rawLang === 'DUB' ? 'SUB' : rawLang || 'SUB';
      const queueProvider = providerGateway.activeProviderIdName as DownloadProvider;
      const details = await getAnimeDetailsBySlug(slug, queueProvider);
      if (!details) return false;

      const settings = SettingsManager.get();
      const dirs = settings.outputDirs || [settings.defaultOutputDir];
      const resolvedIndex = outputDirIndex ?? 0;
      const baseDir = dirs[resolvedIndex] || settings.defaultOutputDir;
      const folderName = details.title.replace(/[^a-z0-9\s]/gi, '_').trim();
      const targetPath = path.join(baseDir, folderName);
      const normalizedEpisodes = Array.from(new Set(episodes)).sort((a, b) => a - b);
      if (normalizedEpisodes.length === 0) return false;
      const duplicateQueueItem = downloadQueue.find(
        (existing) =>
          (existing.status === 'pending' || existing.status === 'downloading' || existing.status === 'paused') &&
          existing.providerId === queueProvider &&
          (existing.downloadSlug || existing.slug) === slug &&
          (existing.lang || 'SUB') === (lang || 'SUB') &&
          path.resolve(existing.targetPath).toLowerCase() === path.resolve(targetPath).toLowerCase() &&
          existing.episodes.some((episode) => normalizedEpisodes.includes(episode)),
      );
      if (duplicateQueueItem) return false;

      try {
        await fs.promises.mkdir(targetPath, { recursive: true });
      } catch {}
      let localPosterUrl: string | null = null;
      let localBannerUrl: string | null = null;
      try {
        [localPosterUrl, localBannerUrl] = await Promise.all([
          ensureFolderPoster(targetPath, details.poster || null),
          ensureFolderBanner(targetPath, details.banner || details.poster || null),
        ]);
      } catch (error) {
        writeGlobalLog(`Error descargando portada para ${slug}: ${error}`);
      }

      if (localPosterUrl && (localPosterUrl.startsWith('file:') || localPosterUrl.startsWith('omni-media:'))) {
        try {
          const filePath = LibraryAssetService.urlToFilePath(localPosterUrl);
          if (!filePath || !fs.existsSync(filePath)) localPosterUrl = null;
        } catch {
          localPosterUrl = null;
        }
      }

      writeFolderLibraryMeta(targetPath, {
        slug: details.slug || slug,
        title: normalizeDisplayAnimeTitle(details.title || folderName),
        category: details.category || '',
        year: details.year || '',
        status: details.status || '',
        season: details.season || '',
        posterUrl: details.poster || null,
        bannerUrl: details.banner || details.poster || null,
        providerId: queueProvider,
      });

      const item: QueueItem = {
        id: `q-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        slug,
        downloadSlug: slug,
        animeTitle: normalizeDisplayAnimeTitle(details.title),
        poster: localPosterUrl || details.poster || null,
        preferredServer: preferredServer || 'Auto',
        lang: lang || 'SUB',
        episodes: normalizedEpisodes,
        status: 'pending',
        currentEp: null,
        providerId: queueProvider,
        progress: 0,
        completedEps: [],
        failedEps: [],
        targetPath,
        outputDirIndex: resolvedIndex,
      };

      queueStore.add(item);
      sendQueueUpdate();
      scopedLog('queue').info(
        `Agregado a la cola: ${item.animeTitle} (${formatEpisodeCountLabel(item.episodes.length)})`,
        {
          queueId: item.id,
          provider: queueProvider,
        },
      );

      setImmediate(() => {
        processQueue().catch((error) => {
          writeGlobalLog(error);
        });
      });

      return {
        id: item.id,
        libraryPreload: {
          folderName,
          title: normalizeDisplayAnimeTitle(details.title || folderName),
          slug: details.slug || slug,
          poster: localPosterUrl || details.poster || null,
          banner: localBannerUrl || details.banner || null,
        },
      };
    },
  );

  ipcMain.handle('cancel-download', (_, id: string) => queueProcessor.cancel(id));
  ipcMain.handle('skip-server', (_, id: string) => queueProcessor.skip(id));
  ipcMain.handle('pause-download', (_, id: string) => {
    if (typeof id !== 'string' || !id) return false;
    return queueProcessor.pause(id);
  });
  ipcMain.handle('cancel-episode', (_, id: string, episode: number) => {
    if (typeof id !== 'string' || !id || !isValidEpisodeParam(episode)) return false;
    const item = downloadQueue.find((queueItem) => queueItem.id === id);
    if (!item || !(item.episodes || []).includes(episode)) return false;
    // Seguridad: el destino del EP debe seguir dentro de outputDirs antes de borrar parciales
    try {
      const settings = SettingsManager.get();
      const baseDirs = settings.outputDirs || [settings.defaultOutputDir];
      if (!isPathSafeForDestructiveOperation(item.targetPath, baseDirs, false)) return false;
    } catch {
      return false;
    }
    return queueProcessor.cancelEpisode(id, episode);
  });
  ipcMain.handle('pause-episode', (_, id: string, episode: number) => {
    if (typeof id !== 'string' || !id || !isValidEpisodeParam(episode)) return false;
    const item = downloadQueue.find((queueItem) => queueItem.id === id);
    if (!item || !(item.episodes || []).includes(episode)) return false;
    return queueProcessor.pauseEpisode(id, episode);
  });
  ipcMain.handle('resume-episode', (_, id: string, episode: number) => {
    if (typeof id !== 'string' || !id || !isValidEpisodeParam(episode)) return false;
    const resumed = queueProcessor.resumeEpisode(id, episode);
    if (!resumed) return false;
    sendQueueUpdate();
    setImmediate(() => processQueue().catch(writeGlobalLog));
    return true;
  });
  ipcMain.handle('skip-episode', (_, id: string, episode: number) => {
    if (typeof id !== 'string' || !id || !isValidEpisodeParam(episode)) return false;
    return queueProcessor.skip(id, episode);
  });
  ipcMain.handle('clear-queue', () => {
    const terminalIds = queueStore.items
      .filter((i) => i.status === 'done' || i.status === 'failed' || i.status === 'cancelled')
      .map((i) => i.id);
    queueStore.removeTerminalItems();
    if (terminalIds.length) queueProcessor.notifyItemsRemoved(terminalIds);
    sendQueueUpdate();
    return true;
  });
  ipcMain.handle('remove-from-queue', (_, id: string) => {
    queueStore.removeFromQueue(id);
    queueProcessor.notifyItemsRemoved([id]);
    sendQueueUpdate();
    return true;
  });
  ipcMain.handle('resume-download', (_, id: string) => {
    if (typeof id !== 'string' || !id) return false;
    const resumed = queueProcessor.resume(id);
    if (!resumed) return false;
    sendQueueUpdate();
    setImmediate(() => processQueue().catch(writeGlobalLog));
    return true;
  });
  ipcMain.handle('retry-failed-download', (_, id: string) => {
    const retried = queueProcessor.retryFailed(id);
    if (!retried) return false;
    sendQueueUpdate();
    setImmediate(() => processQueue().catch(writeGlobalLog));
    return true;
  });
  ipcMain.handle('open-anime-folder', async (_, animeTitle: string) => {
    try {
      const settings = SettingsManager.get();
      const baseDirs = settings.outputDirs || [settings.defaultOutputDir];
      for (const baseDir of baseDirs) {
        if (!baseDir || !fs.existsSync(baseDir)) continue;
        const entries = fs
          .readdirSync(baseDir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name);
        let match = entries.find((entry) => entry === animeTitle);
        if (!match)
          match = entries.find((entry) => entry.toLowerCase().includes(animeTitle.toLowerCase().slice(0, 10)));
        if (match) {
          await shell.openPath(path.join(baseDir, match));
          return true;
        }
      }
      if (baseDirs[0] && fs.existsSync(baseDirs[0])) await shell.openPath(baseDirs[0]);
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle('get-queue', () =>
    downloadQueue.map((item) => {
      const info = queueStore.getDirInfo(item.targetPath);
      return { ...item, dirLabel: info.label, dirFullPath: info.fullPath };
    }),
  );
}
