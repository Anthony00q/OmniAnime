import { app, dialog } from 'electron';
import { handleIpc } from '../ipcGuard';
import * as path from 'path';
import { fail, ok } from '../../../types/api';
import { CustomSoundService } from '../../../services/sounds/CustomSoundService';
import type { IpcRegistryDependencies } from '../../IpcRegistry';
import { ALLOWED_CUSTOM_SOUND_EXTS } from '../../../utils/sounds/soundCatalog';

export function registerSoundHandlers({ writeGlobalLog }: IpcRegistryDependencies): void {
  const service = new CustomSoundService({
    userDataDir: app.getPath('userData'),
    soundsDir: path.join(app.getAppPath(), 'assets', 'sounds'),
  });

  handleIpc('import-custom-sound', async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Subir sonido',
        properties: ['openFile'],
        filters: [{ name: 'Audio', extensions: ALLOWED_CUSTOM_SOUND_EXTS.map((e) => e.slice(1)) }],
      });
      if (result.canceled || !result.filePaths[0]) return ok(null);
      const imported = await service.importFromPath(result.filePaths[0]);
      if (!imported.ok) return fail('IMPORT_CUSTOM_SOUND_FAILED', imported.error || 'No se pudo importar el sonido.');
      return ok(imported.file);
    } catch (error) {
      writeGlobalLog(error);
      return fail('IMPORT_CUSTOM_SOUND_FAILED', 'No se pudo importar el sonido.');
    }
  });

  handleIpc('delete-custom-sound', async (_, id: string) => {
    try {
      return ok(await service.delete(String(id || '')));
    } catch (error) {
      writeGlobalLog(error);
      return fail('DELETE_CUSTOM_SOUND_FAILED', 'No se pudo eliminar el sonido.');
    }
  });

  // Un sonido ilegible no es un fallo: el renderer cae a la receta del pack.
  handleIpc('read-sound-data', async (_, ref: string) => {
    try {
      return ok(await service.read(String(ref || '')));
    } catch (error) {
      writeGlobalLog(error);
      return ok(null);
    }
  });
}
