import { shell } from 'electron';
import { handleIpc } from '../ipcGuard';
import * as fs from 'fs';
import * as path from 'path';
import { fail, ok } from '../../../types/api';
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

  handleIpc('add-to-queue', async (_, payload: QueueEnqueuePayload) => {
    const result = await queueEnqueueService.enqueue(payload);
    return result ? ok(result) : fail('ADD_TO_QUEUE_FAILED', 'No se pudo agregar a la cola');
  });

  handleIpc('cancel-download', (_, id: string) =>
    queueProcessor.cancel(id) ? ok(null) : fail('CANCEL_DOWNLOAD_FAILED', 'No se pudo cancelar la descarga'),
  );
  handleIpc('skip-server', (_, id: string) =>
    queueProcessor.skip(id) ? ok(null) : fail('SKIP_SERVER_FAILED', 'No se pudo saltar el servidor'),
  );
  handleIpc('pause-download', (_, id: string) => {
    if (typeof id !== 'string' || !id) return fail('PAUSE_DOWNLOAD_FAILED', 'No se pudo pausar la descarga');
    return queueProcessor.pause(id) ? ok(null) : fail('PAUSE_DOWNLOAD_FAILED', 'No se pudo pausar la descarga');
  });
  handleIpc('cancel-episode', async (_, id: string, episode: number) => {
    const failed = () => fail('CANCEL_EPISODE_FAILED', `No se pudo cancelar EP ${episode}`);
    if (typeof id !== 'string' || !id || !isValidEpisodeParam(episode)) return failed();
    const item = downloadQueue.find((queueItem) => queueItem.id === id);
    if (!item || !(item.episodes || []).includes(episode)) return failed();
    // Seguridad: el destino del EP debe seguir dentro de outputDirs antes de borrar parciales
    try {
      const settings = SettingsManager.get();
      const baseDirs = settings.outputDirs || [settings.defaultOutputDir];
      if (!isPathSafeForDestructiveOperation(item.targetPath, baseDirs, false)) return failed();
    } catch {
      return failed();
    }
    return (await queueProcessor.cancelEpisode(id, episode)) ? ok(null) : failed();
  });
  handleIpc('pause-episode', (_, id: string, episode: number) => {
    const failed = () => fail('PAUSE_EPISODE_FAILED', `No se pudo pausar EP ${episode}`);
    if (typeof id !== 'string' || !id || !isValidEpisodeParam(episode)) return failed();
    const item = downloadQueue.find((queueItem) => queueItem.id === id);
    if (!item || !(item.episodes || []).includes(episode)) return failed();
    return queueProcessor.pauseEpisode(id, episode) ? ok(null) : failed();
  });
  handleIpc('resume-episode', (_, id: string, episode: number) => {
    const failed = () => fail('RESUME_EPISODE_FAILED', `No se pudo reanudar EP ${episode}`);
    if (typeof id !== 'string' || !id || !isValidEpisodeParam(episode)) return failed();
    const resumed = queueProcessor.resumeEpisode(id, episode);
    if (!resumed) return failed();
    sendQueueUpdate();
    setImmediate(() => processQueue().catch(writeGlobalLog));
    return ok(null);
  });
  handleIpc('skip-episode', (_, id: string, episode: number) => {
    const failed = () => fail('SKIP_EPISODE_FAILED', `No se pudo saltar servidor de EP ${episode}`);
    if (typeof id !== 'string' || !id || !isValidEpisodeParam(episode)) return failed();
    return queueProcessor.skip(id, episode) ? ok(null) : failed();
  });
  handleIpc('clear-queue', () => {
    const terminalIds = queueStore.items
      .filter((i) => i.status === 'done' || i.status === 'failed' || i.status === 'cancelled')
      .map((i) => i.id);
    queueStore.removeTerminalItems();
    if (terminalIds.length) queueProcessor.notifyItemsRemoved(terminalIds);
    sendQueueUpdate();
    return ok(null);
  });
  handleIpc('remove-from-queue', (_, id: string) => {
    queueStore.removeFromQueue(id);
    queueProcessor.notifyItemsRemoved([id]);
    sendQueueUpdate();
    return ok(null);
  });
  handleIpc('resume-download', (_, id: string) => {
    const failed = () => fail('RESUME_DOWNLOAD_FAILED', 'No se pudo reanudar la descarga');
    if (typeof id !== 'string' || !id) return failed();
    const resumed = queueProcessor.resume(id);
    if (!resumed) return failed();
    sendQueueUpdate();
    setImmediate(() => processQueue().catch(writeGlobalLog));
    return ok(null);
  });
  handleIpc('retry-failed-download', (_, id: string) => {
    const retried = queueProcessor.retryFailed(id);
    if (!retried) return fail('RETRY_DOWNLOAD_FAILED', 'No se pudo reintentar la descarga');
    sendQueueUpdate();
    setImmediate(() => processQueue().catch(writeGlobalLog));
    return ok(null);
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
          return ok(null);
        }
      }
      if (baseDirs[0] && fs.existsSync(baseDirs[0])) await shell.openPath(baseDirs[0]);
      return ok(null);
    } catch {
      return fail('OPEN_ANIME_FOLDER_FAILED', 'No se pudo encontrar la carpeta de descarga');
    }
  });
  handleIpc('get-queue', () =>
    ok(
      downloadQueue.map((item) => {
        const info = queueStore.getDirInfo(item.targetPath);
        return { ...item, dirLabel: info.label, dirFullPath: info.fullPath };
      }),
    ),
  );
}
