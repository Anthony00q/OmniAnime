import { app, dialog, ipcMain } from 'electron';
import * as path from 'path';
import { CustomSoundService } from '../../../services/CustomSoundService';
import type { IpcRegistryDependencies } from '../../IpcRegistry';
import { ALLOWED_CUSTOM_SOUND_EXTS } from '../../../utils/soundCatalog';

export function registerSoundHandlers({ writeGlobalLog }: IpcRegistryDependencies): void {
  const service = new CustomSoundService({
    userDataDir: app.getPath('userData'),
    soundsDir: path.join(app.getAppPath(), 'assets', 'sounds'),
  });

  ipcMain.handle('import-custom-sound', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Subir sonido',
        properties: ['openFile'],
        filters: [{ name: 'Audio', extensions: ALLOWED_CUSTOM_SOUND_EXTS.map((e) => e.slice(1)) }],
      });
      if (result.canceled || !result.filePaths[0]) return { ok: false, canceled: true };
      return await service.importFromPath(result.filePaths[0]);
    } catch (error) {
      writeGlobalLog(error);
      return { ok: false, error: 'No se pudo importar el sonido.' };
    }
  });

  ipcMain.handle('delete-custom-sound', async (_, id: string) => {
    try {
      return await service.delete(String(id || ''));
    } catch (error) {
      writeGlobalLog(error);
      return false;
    }
  });

  ipcMain.handle('read-sound-data', async (_, ref: string) => {
    try {
      const data = await service.read(String(ref || ''));
      return data ? { ok: true, data } : { ok: false };
    } catch (error) {
      writeGlobalLog(error);
      return { ok: false };
    }
  });
}
