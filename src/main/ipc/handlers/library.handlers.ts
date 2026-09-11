import { ipcMain } from 'electron';
import { SettingsManager } from '../../../services/SettingsManager';
import { isPathWithinAnyDirectory } from '../../../utils/pathSecurity';
import type { IpcRegistryDependencies } from '../../IpcRegistry';

export function registerLibraryHandlers({
  libraryFileService,
  episodeFileService,
  thumbnailService,
  normalizeEpisodeFilesInFolder,
  getAllowedBaseDirs,
  writeGlobalLog,
}: IpcRegistryDependencies): void {
  ipcMain.handle(
    'preview-rename-anime-files',
    async (_, data: { animePath: string; style: 'minimal' | 'descriptive' }) => {
      try {
        if (!isPathWithinAnyDirectory(data.animePath, getAllowedBaseDirs(), false)) {
          return { success: false, error: 'La carpeta está fuera de la librería configurada.' };
        }
        return await episodeFileService.previewRename(data.animePath, data.style);
      } catch (error) {
        writeGlobalLog(error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  );
  ipcMain.handle('preview-reorder-episodes', async (_, data: { folderPath: string; startNumber: number }) => {
    try {
      if (!isPathWithinAnyDirectory(data.folderPath, getAllowedBaseDirs(), false)) {
        return { success: false, error: 'La carpeta está fuera de la librería configurada.' };
      }
      return await episodeFileService.previewReorder(data.folderPath, data.startNumber);
    } catch (error) {
      writeGlobalLog(error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('rename-anime-files', async (_, data: { animePath: string; style: 'minimal' | 'descriptive' }) => {
    try {
      if (!isPathWithinAnyDirectory(data.animePath, getAllowedBaseDirs(), false))
        return { success: false, error: 'La carpeta está fuera de la librería configurada.' };
      const result: any = await normalizeEpisodeFilesInFolder(data.animePath, true, data.style);
      if (result && typeof result === 'object' && 'success' in result) return result;
      return { success: true, renamed: 0, skippedConflicts: 0, skippedNoNumber: 0, total: 0 };
    } catch (error) {
      writeGlobalLog(error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
  ipcMain.handle('scan-downloads', async (_, baseDirs: string | string[]) =>
    libraryFileService.scanDownloads(baseDirs),
  );
  ipcMain.handle('rename-folder', (_, { oldPath, newName }: { oldPath: string; newName: string }) =>
    libraryFileService.renameFolder(oldPath, newName),
  );
  ipcMain.handle('delete-folder', (_, folderPath: string) => libraryFileService.deleteFolder(folderPath));
  ipcMain.handle('relink-folder', (_, folderPath: string, targetSlug: string) =>
    libraryFileService.relinkFolder(folderPath, targetSlug),
  );
  ipcMain.handle('scan-episodes', async (_, animePath: string) => {
    try {
      if (!isPathWithinAnyDirectory(animePath, getAllowedBaseDirs(), false)) return [];
      return await episodeFileService.scanEpisodes(animePath);
    } catch (error) {
      writeGlobalLog(error);
      return [];
    }
  });
  ipcMain.handle('play-video', (_, videoPath: string) => libraryFileService.playVideo(videoPath));
  ipcMain.handle('delete-video', (_, videoPath: string) => libraryFileService.deleteVideo(videoPath));
  ipcMain.handle('get-folders-for-reorder', async () => {
    try {
      const settings = SettingsManager.get();
      const baseDirs = settings.outputDirs || [settings.defaultOutputDir];
      return await episodeFileService.getFoldersForReorder(baseDirs);
    } catch (error) {
      writeGlobalLog(error);
      return [];
    }
  });
  ipcMain.handle(
    'reorder-episodes',
    async (_, { folderPath, startNumber }: { folderPath: string; startNumber: number }) => {
      if (!isPathWithinAnyDirectory(folderPath, getAllowedBaseDirs(), false)) {
        return { success: false, error: 'La carpeta está fuera de la librería configurada.' };
      }
      return await episodeFileService.reorderEpisodes(folderPath, startNumber);
    },
  );
  ipcMain.handle('get-video-thumbnail', (_, videoPath: string) => {
    if (!isPathWithinAnyDirectory(videoPath, getAllowedBaseDirs(), false)) return null;
    return thumbnailService.getThumbnail(videoPath);
  });
}
