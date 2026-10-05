import { shell } from 'electron';
import { handleIpc } from '../ipcGuard';
import * as fs from 'fs';
import * as path from 'path';
import { SettingsManager } from '../../../services/persistence/SettingsManager';
import type { QueueEnqueuePayload } from '../../../services/downloads/QueueEnqueueService';
import { isPathSafeForDestructiveOperation } from '../../../utils/security/pathSecurity';
import type { IpcRegistryDependencies } from '../../IpcRegistry';

function isValidEpisodeParam(episode: unknown): episode is number {
  return typeof episode === 'number' && Number.isInteger(episode) && episode > 0 && episode < 100000;
}

export function registerQueueHandlers(dependencies: IpcRegistryDependencies): void {
  const {
    queueStore,
    queueProcessor,
    downloadQueue,
    queueEnqueueService,
    processQueue,
    sendQueueUpdate,
    writeGlobalLog,
  } = dependencies;

  handleIpc('add-to-queue', (_, payload: QueueEnqueuePayload) => queueEnqueueService.enqueue(payload));

  handleIpc('cancel-download', (_, id: string) => queueProcessor.cancel(id));
  handleIpc('skip-server', (_, id: string) => queueProcessor.skip(id));
  handleIpc('pause-download', (_, id: string) => {
    if (typeof id !== 'string' || !id) return false;
    return queueProcessor.pause(id);
  });
  handleIpc('cancel-episode', (_, id: string, episode: number) => {
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
  handleIpc('pause-episode', (_, id: string, episode: number) => {
    if (typeof id !== 'string' || !id || !isValidEpisodeParam(episode)) return false;
    const item = downloadQueue.find((queueItem) => queueItem.id === id);
    if (!item || !(item.episodes || []).includes(episode)) return false;
    return queueProcessor.pauseEpisode(id, episode);
  });
  handleIpc('resume-episode', (_, id: string, episode: number) => {
    if (typeof id !== 'string' || !id || !isValidEpisodeParam(episode)) return false;
    const resumed = queueProcessor.resumeEpisode(id, episode);
    if (!resumed) return false;
    sendQueueUpdate();
    setImmediate(() => processQueue().catch(writeGlobalLog));
    return true;
  });
  handleIpc('skip-episode', (_, id: string, episode: number) => {
    if (typeof id !== 'string' || !id || !isValidEpisodeParam(episode)) return false;
    return queueProcessor.skip(id, episode);
  });
  handleIpc('clear-queue', () => {
    const terminalIds = queueStore.items
      .filter((i) => i.status === 'done' || i.status === 'failed' || i.status === 'cancelled')
      .map((i) => i.id);
    queueStore.removeTerminalItems();
    if (terminalIds.length) queueProcessor.notifyItemsRemoved(terminalIds);
    sendQueueUpdate();
    return true;
  });
  handleIpc('remove-from-queue', (_, id: string) => {
    queueStore.removeFromQueue(id);
    queueProcessor.notifyItemsRemoved([id]);
    sendQueueUpdate();
    return true;
  });
  handleIpc('resume-download', (_, id: string) => {
    if (typeof id !== 'string' || !id) return false;
    const resumed = queueProcessor.resume(id);
    if (!resumed) return false;
    sendQueueUpdate();
    setImmediate(() => processQueue().catch(writeGlobalLog));
    return true;
  });
  handleIpc('retry-failed-download', (_, id: string) => {
    const retried = queueProcessor.retryFailed(id);
    if (!retried) return false;
    sendQueueUpdate();
    setImmediate(() => processQueue().catch(writeGlobalLog));
    return true;
  });
  handleIpc('open-anime-folder', async (_, animeTitle: string) => {
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
  handleIpc('get-queue', () =>
    downloadQueue.map((item) => {
      const info = queueStore.getDirInfo(item.targetPath);
      return { ...item, dirLabel: info.label, dirFullPath: info.fullPath };
    }),
  );
}
