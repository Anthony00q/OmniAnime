import { ipcMain } from 'electron';
import type { IpcRegistryDependencies } from '../../IpcRegistry';
import type { AppUpdateCheckResult, AppUpdateDownloadResult, AppUpdateInstallResult } from '../../../types/appUpdate';

const UNAVAILABLE = 'El servicio de actualizacion de la app no esta disponible.';

export function registerAppUpdaterHandlers(dependencies: IpcRegistryDependencies): void {
  const { appUpdateService } = dependencies;

  ipcMain.handle('app-update-check', async (): Promise<AppUpdateCheckResult> => {
    if (!appUpdateService) return { ok: false, code: 'FAILED', message: UNAVAILABLE };
    return appUpdateService.check();
  });

  ipcMain.handle('app-update-download', async (): Promise<AppUpdateDownloadResult> => {
    if (!appUpdateService) return { ok: false, code: 'FAILED', message: UNAVAILABLE };
    return appUpdateService.download();
  });

  ipcMain.handle('app-update-install', (): AppUpdateInstallResult => {
    if (!appUpdateService) return { ok: false, code: 'FAILED', message: UNAVAILABLE };
    return appUpdateService.install();
  });
}
