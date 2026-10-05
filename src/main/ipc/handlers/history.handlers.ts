import { shell } from 'electron';
import { handleIpc } from '../ipcGuard';
import * as fs from 'fs';
import * as path from 'path';
import { fail, ok } from '../../../types/api';
import { isPathWithinAnyDirectory } from '../../../utils/security/pathSecurity';
import type { IpcRegistryDependencies } from '../../IpcRegistry';

export function registerHistoryHandlers({
  historyService,
  writeGlobalLog,
  getAllowedBaseDirs,
}: IpcRegistryDependencies): void {
  handleIpc('get-download-history', () => {
    try {
      return ok(historyService.getHistory());
    } catch (error) {
      writeGlobalLog(error);
      throw error;
    }
  });
  handleIpc('clear-download-history', () =>
    historyService.clearHistory() ? ok(null) : fail('CLEAR_HISTORY_FAILED', 'Error al limpiar el historial'),
  );
  handleIpc('remove-history-entry', (_, index: number) =>
    historyService.removeHistoryEntry(index) ? ok(null) : fail('REMOVE_HISTORY_FAILED', 'Error al eliminar la entrada'),
  );
  handleIpc('remove-history-entries', (_, indices: number[], expectedIds?: number[]) =>
    historyService.removeHistoryEntries(indices, expectedIds)
      ? ok(null)
      : fail('REMOVE_HISTORY_FAILED', 'Error al eliminar el grupo'),
  );
  handleIpc('open-folder', async (_, folderPath: string) => {
    try {
      const normalizedPath = path.resolve(String(folderPath || ''));
      const isKnownHistoryPath = historyService
        .getHistory()
        .some((record) => path.resolve(record.dirFullPath || '') === normalizedPath);
      if (!isKnownHistoryPath && !isPathWithinAnyDirectory(normalizedPath, getAllowedBaseDirs())) {
        return fail('OPEN_FOLDER_OUTSIDE_LIBRARY', 'La ruta está fuera de la librería configurada.');
      }
      if (!fs.existsSync(normalizedPath)) {
        return fail('OPEN_FOLDER_MISSING', 'La ruta no existe en el disco.');
      }
      const error = await shell.openPath(normalizedPath);
      if (error) return fail('OPEN_FOLDER_FAILED', 'No se pudo abrir la carpeta');
      return ok(null);
    } catch (error: unknown) {
      writeGlobalLog(error);
      return fail('OPEN_FOLDER_FAILED', 'No se pudo abrir la carpeta');
    }
  });
}
