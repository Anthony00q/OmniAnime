import { handleIpc } from '../ipcGuard';
import { fail, ok } from '../../../types/api';
import { SettingsManager } from '../../../services/persistence/SettingsManager';
import { isPathWithinAnyDirectory } from '../../../utils/security/pathSecurity';
import type { IpcRegistryDependencies } from '../../IpcRegistry';
import { randomUUID } from 'crypto';
import * as path from 'path';
import type { WebContents } from 'electron';
import type { ThumbnailCommand, ThumbnailRequest } from '../../../types/thumbnails';
import { safeErrorMessage } from '../../../utils/logging/redactLog';

export function registerLibraryHandlers({
  libraryFileService,
  episodeFileService,
  thumbnailService,
  libraryMutationService,
  normalizeEpisodeFilesInFolder,
  getAllowedBaseDirs,
  writeGlobalLog,
}: IpcRegistryDependencies): void {
  const thumbnailOwners = new Map<number, { requests: Map<string, ThumbnailRequest>; dispose: () => void }>();
  const validRevision = (value: unknown) =>
    value === undefined || (typeof value === 'string' && /^[a-f0-9]{64}$/.test(value));
  const mutate = async <T>(paths: string[], action: () => T | Promise<T>) => {
    try {
      return await libraryMutationService.run(paths, action);
    } catch (error) {
      return fail('LIBRARY_MUTATION_FAILED', safeErrorMessage(error) || 'No se pudo modificar la carpeta.');
    }
  };
  handleIpc('preview-rename-anime-files', async (_, data: { animePath: string; style: 'minimal' | 'descriptive' }) => {
    try {
      if (!isPathWithinAnyDirectory(data.animePath, getAllowedBaseDirs(), false)) {
        return fail('PREVIEW_RENAME_OUTSIDE_LIBRARY', 'La carpeta está fuera de la librería configurada.');
      }
      return ok(await episodeFileService.previewRename(data.animePath, data.style));
    } catch (error) {
      writeGlobalLog(error);
      return fail('PREVIEW_RENAME_FAILED', 'No se pudo inspeccionar la carpeta.');
    }
  });
  handleIpc('preview-reorder-episodes', async (_, data: { folderPath: string; startNumber: number }) => {
    try {
      if (!isPathWithinAnyDirectory(data.folderPath, getAllowedBaseDirs(), false)) {
        return fail('PREVIEW_REORDER_OUTSIDE_LIBRARY', 'La carpeta está fuera de la librería configurada.');
      }
      return ok(await episodeFileService.previewReorder(data.folderPath, data.startNumber));
    } catch (error) {
      writeGlobalLog(error);
      return fail('PREVIEW_REORDER_FAILED', 'No se pudo previsualizar el reorden.');
    }
  });
  handleIpc(
    'rename-anime-files',
    async (_, data: { animePath: string; style: 'minimal' | 'descriptive'; expectedRevision?: string }) => {
      try {
        if (
          !validRevision(data.expectedRevision) ||
          (data.style !== undefined && data.style !== 'minimal' && data.style !== 'descriptive')
        ) {
          return fail('RENAME_FILES_INVALID', 'La vista previa o el estilo no son válidos.');
        }
        if (!isPathWithinAnyDirectory(data.animePath, getAllowedBaseDirs(), false))
          return fail('RENAME_FILES_OUTSIDE_LIBRARY', 'La carpeta está fuera de la librería configurada.');
        return await mutate([data.animePath], async () => {
          const result: any = await normalizeEpisodeFilesInFolder(data.animePath, data.style, data.expectedRevision);
          if (result && typeof result === 'object' && 'success' in result) {
            return result.success
              ? ok({ ...result, episodes: await episodeFileService.scanEpisodes(data.animePath) })
              : fail('RENAME_FILES_FAILED', result.error || 'No se pudo renombrar.');
          }
          return ok({ success: true, renamed: 0, skippedConflicts: 0, skippedNoNumber: 0, total: 0 });
        });
      } catch (error) {
        writeGlobalLog(error);
        return fail('RENAME_FILES_FAILED', 'No se pudo renombrar.');
      }
    },
  );
  handleIpc('scan-downloads', async (_, baseDirs: string | string[]) =>
    ok(await libraryFileService.scanDownloads(baseDirs)),
  );
  handleIpc('rename-folder', async (_, { oldPath, newName }: { oldPath: string; newName: string }) => {
    let target: string;
    try {
      target = libraryFileService.resolveRenameTarget(oldPath, newName);
    } catch (error) {
      return fail('RENAME_FOLDER_FAILED', safeErrorMessage(error) || 'El nombre de carpeta no es válido.');
    }
    return mutate([oldPath, target], async () => {
      const result = await libraryFileService.renameFolder(oldPath, newName);
      return result.success
        ? ok(result)
        : fail('RENAME_FOLDER_FAILED', result.error || 'No se pudo renombrar la carpeta.');
    });
  });
  handleIpc('delete-folder', async (_, folderPath: string) => {
    return mutate([folderPath], () => {
      const deleted = libraryFileService.deleteFolder(folderPath);
      return deleted ? ok(null) : fail('DELETE_FOLDER_FAILED', 'No se pudo eliminar la carpeta');
    });
  });
  handleIpc('relink-folder', async (_, folderPath: string, targetSlug: string, providerId?: string | null) =>
    (await libraryFileService.relinkFolder(folderPath, targetSlug, providerId))
      ? ok(null)
      : fail('RELINK_FOLDER_FAILED', 'Error al vincular la carpeta'),
  );
  handleIpc('scan-episodes', async (_, animePath: string) => {
    try {
      if (!isPathWithinAnyDirectory(animePath, getAllowedBaseDirs(), false)) return ok([]);
      return ok(await episodeFileService.scanEpisodes(animePath));
    } catch (error) {
      writeGlobalLog(error);
      return ok([]);
    }
  });
  handleIpc('play-video', async (_, videoPath: string) => {
    const result = await libraryFileService.playVideo(videoPath);
    return result.success ? ok(null) : fail('PLAY_VIDEO_FAILED', result.error || 'No se pudo reproducir el archivo');
  });
  handleIpc('delete-video', async (_, videoPath: string) => {
    const folderPath = typeof videoPath === 'string' ? path.dirname(videoPath) : '';
    return mutate([folderPath], () => {
      const deleted = libraryFileService.deleteVideo(videoPath);
      return deleted ? ok(null) : fail('DELETE_VIDEO_FAILED', 'No se pudo eliminar el episodio');
    });
  });
  handleIpc('get-folders-for-reorder', async () => {
    try {
      const settings = SettingsManager.get();
      const baseDirs = settings.outputDirs || [settings.defaultOutputDir];
      return ok(await episodeFileService.getFoldersForReorder(baseDirs));
    } catch (error) {
      writeGlobalLog(error);
      return ok([]);
    }
  });
  handleIpc(
    'reorder-episodes',
    async (
      _,
      {
        folderPath,
        startNumber,
        expectedRevision,
      }: { folderPath: string; startNumber: number; expectedRevision?: string },
    ) => {
      if (!validRevision(expectedRevision) || !Number.isSafeInteger(startNumber) || startNumber < 0)
        return fail('REORDER_INVALID', 'La vista previa o la numeración no son válidas.');
      if (!isPathWithinAnyDirectory(folderPath, getAllowedBaseDirs(), false)) {
        return fail('REORDER_EPISODES_OUTSIDE_LIBRARY', 'La carpeta está fuera de la librería configurada.');
      }
      return mutate([folderPath], async () => {
        const result = await episodeFileService.reorderEpisodes(folderPath, startNumber, expectedRevision);
        return result.success
          ? ok({ ...result, episodes: await episodeFileService.scanEpisodes(folderPath) })
          : fail('REORDER_EPISODES_FAILED', result.error || 'Error al renumerar episodios');
      });
    },
  );
  handleIpc('get-video-thumbnail', async (event, payload: unknown) => {
    const command = (
      typeof payload === 'string'
        ? { operation: 'request', requestId: randomUUID(), videoPath: payload, priority: 'visible' }
        : payload
    ) as ThumbnailCommand | null;
    if (
      !command ||
      typeof command !== 'object' ||
      typeof command.requestId !== 'string' ||
      !/^[a-z0-9-]{1,100}$/i.test(command.requestId) ||
      !['request', 'release', 'priority'].includes(command.operation) ||
      (command.operation !== 'release' && command.priority !== 'visible' && command.priority !== 'prefetch')
    )
      return fail('INVALID_THUMBNAIL_REQUEST', 'La solicitud de miniatura no es válida.');
    const sender = event.sender as WebContents;
    if (sender.isDestroyed()) return ok(null);
    let owner = thumbnailOwners.get(sender.id);
    if (command.operation === 'release') {
      owner?.requests.get(command.requestId)?.release();
      return ok(null);
    }
    if (command.operation === 'priority') {
      owner?.requests.get(command.requestId)?.setPriority(command.priority);
      return ok(null);
    }
    if (typeof command.videoPath !== 'string' || !command.videoPath) {
      return fail('INVALID_THUMBNAIL_REQUEST', 'La solicitud de miniatura no es válida.');
    }
    if (command.refresh !== undefined && typeof command.refresh !== 'boolean')
      return fail('INVALID_THUMBNAIL_REQUEST', 'La solicitud de miniatura no es válida.');
    if (!isPathWithinAnyDirectory(command.videoPath, getAllowedBaseDirs(), false)) return ok(null);
    if (owner?.requests.has(command.requestId))
      return fail('DUPLICATE_THUMBNAIL_REQUEST', 'La solicitud ya está en curso.');
    if (owner && owner.requests.size >= 256) return ok(null);
    if (!owner) {
      const requests = new Map<string, ThumbnailRequest>();
      const dispose = () => {
        for (const request of requests.values()) request.release();
        requests.clear();
        sender.removeListener('destroyed', dispose);
        sender.removeListener('render-process-gone', dispose);
        thumbnailOwners.delete(sender.id);
      };
      owner = { requests, dispose };
      thumbnailOwners.set(sender.id, owner);
      sender.once('destroyed', dispose);
      sender.once('render-process-gone', dispose);
    }
    const currentOwner = owner;
    const request = thumbnailService.requestThumbnail(command.videoPath, command.priority, command.refresh === true);
    currentOwner.requests.set(command.requestId, request);
    const timeout = setTimeout(request.release, 110_000);
    try {
      return ok(await request.promise);
    } finally {
      clearTimeout(timeout);
      currentOwner.requests.delete(command.requestId);
      if (!currentOwner.requests.size && thumbnailOwners.get(sender.id) === currentOwner) currentOwner.dispose();
    }
  });
}
