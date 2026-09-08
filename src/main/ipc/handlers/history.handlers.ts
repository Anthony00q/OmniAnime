import { ipcMain, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { isPathWithinAnyDirectory } from '../../../utils/pathSecurity';
import type { IpcRegistryDependencies } from '../../IpcRegistry';

export function registerHistoryHandlers({
  historyService,
  writeGlobalLog,
  getAllowedBaseDirs,
}: IpcRegistryDependencies): void {
  ipcMain.handle('get-download-history', () => {
    try {
      return historyService.getHistory();
    } catch (error) {
      writeGlobalLog(error);
      throw error;
    }
  });
  ipcMain.handle('clear-download-history', () => historyService.clearHistory());
  ipcMain.handle('remove-history-entry', (_, index: number) => historyService.removeHistoryEntry(index));
  ipcMain.handle('remove-history-entries', (_, indices: number[], expectedIds?: number[]) =>
    historyService.removeHistoryEntries(indices, expectedIds),
  );
  ipcMain.handle('open-folder', async (_, folderPath: string) => {
    try {
      const normalizedPath = path.resolve(String(folderPath || ''));
      const isKnownHistoryPath = historyService
        .getHistory()
        .some((record) => path.resolve(record.dirFullPath || '') === normalizedPath);
      if (!isKnownHistoryPath && !isPathWithinAnyDirectory(normalizedPath, getAllowedBaseDirs())) {
        return { success: false, error: 'La ruta está fuera de la librería configurada.' };
      }
      if (!fs.existsSync(normalizedPath)) {
        return { success: false, error: 'La ruta no existe en el disco.' };
      }
      const error = await shell.openPath(normalizedPath);
      if (error) return { success: false, error };
      return { success: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });
}
