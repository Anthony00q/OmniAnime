import { handleIpc } from '../ipcGuard';
import { fail, ok } from '../../../types/api';
import { SettingsManager } from '../../../services/persistence/SettingsManager';
import { isPathWithinAnyDirectory } from '../../../utils/security/pathSecurity';
import type { IpcRegistryDependencies } from '../../IpcRegistry';

export function registerLibraryHandlers({
  libraryFileService,
  episodeFileService,
  thumbnailService,
  normalizeEpisodeFilesInFolder,
  getAllowedBaseDirs,
  writeGlobalLog,
}: IpcRegistryDependencies): void {
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
  handleIpc('rename-anime-files', async (_, data: { animePath: string; style: 'minimal' | 'descriptive' }) => {
    try {
      if (!isPathWithinAnyDirectory(data.animePath, getAllowedBaseDirs(), false))
        return fail('RENAME_FILES_OUTSIDE_LIBRARY', 'La carpeta está fuera de la librería configurada.');
      const result: any = await normalizeEpisodeFilesInFolder(data.animePath, data.style);
      if (result && typeof result === 'object' && 'success' in result) {
        return result.success ? ok(result) : fail('RENAME_FILES_FAILED', result.error || 'No se pudo renombrar.');
      }
      return ok({ success: true, renamed: 0, skippedConflicts: 0, skippedNoNumber: 0, total: 0 });
    } catch (error) {
      writeGlobalLog(error);
      return fail('RENAME_FILES_FAILED', 'No se pudo renombrar.');
    }
  });
  handleIpc('scan-downloads', async (_, baseDirs: string | string[]) =>
    ok(await libraryFileService.scanDownloads(baseDirs)),
  );
  handleIpc('rename-folder', (_, { oldPath, newName }: { oldPath: string; newName: string }) => {
    const result = libraryFileService.renameFolder(oldPath, newName);
    return result.success
      ? ok(result)
      : fail('RENAME_FOLDER_FAILED', result.error || 'No se pudo renombrar la carpeta.');
  });
  handleIpc('delete-folder', (_, folderPath: string) =>
    libraryFileService.deleteFolder(folderPath)
      ? ok(null)
      : fail('DELETE_FOLDER_FAILED', 'No se pudo eliminar la carpeta'),
  );
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
  handleIpc('delete-video', (_, videoPath: string) =>
    libraryFileService.deleteVideo(videoPath)
      ? ok(null)
      : fail('DELETE_VIDEO_FAILED', 'No se pudo eliminar el episodio'),
  );
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
  handleIpc('reorder-episodes', async (_, { folderPath, startNumber }: { folderPath: string; startNumber: number }) => {
    if (!isPathWithinAnyDirectory(folderPath, getAllowedBaseDirs(), false)) {
      return fail('REORDER_EPISODES_OUTSIDE_LIBRARY', 'La carpeta está fuera de la librería configurada.');
    }
    const result = await episodeFileService.reorderEpisodes(folderPath, startNumber);
    return result.success
      ? ok(result)
      : fail('REORDER_EPISODES_FAILED', result.error || 'Error al renumerar episodios');
  });
  handleIpc('get-video-thumbnail', async (_, videoPath: string) => {
    if (!isPathWithinAnyDirectory(videoPath, getAllowedBaseDirs(), false)) return ok(null);
    return ok(await thumbnailService.getThumbnail(videoPath));
  });
}
