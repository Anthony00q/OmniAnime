import { handleIpc } from '../ipcGuard';
import { fail, ok, type IpcResponse } from '../../../types/api';
import type { IpcRegistryDependencies } from '../../IpcRegistry';
import type { AppUpdateCheckData } from '../../../types/appUpdate';

const UNAVAILABLE = 'El servicio de actualización de la app no está disponible.';

export function registerAppUpdaterHandlers(dependencies: IpcRegistryDependencies): void {
  const { appUpdateService } = dependencies;

  handleIpc('app-update-check', async (): Promise<IpcResponse<AppUpdateCheckData>> => {
    if (!appUpdateService) return fail('APP_UPDATE_UNAVAILABLE', UNAVAILABLE);
    const result = await appUpdateService.check();
    if (result.ok) {
      return ok({
        available: result.available === true,
        version: result.version,
        currentVersion: result.currentVersion,
        notes: result.notes,
      });
    }
    // En desarrollo o con otra comprobación en vuelo no hay versión que ofrecer.
    if (result.code === 'DEV' || result.code === 'IN_PROGRESS') return ok({ available: false });
    return fail('APP_UPDATE_CHECK_FAILED', result.message || 'No se pudo comprobar la actualización.');
  });

  handleIpc('app-update-download', async (): Promise<IpcResponse<null>> => {
    if (!appUpdateService) return fail('APP_UPDATE_UNAVAILABLE', UNAVAILABLE);
    const result = await appUpdateService.download();
    if (!result.ok)
      return fail('APP_UPDATE_DOWNLOAD_FAILED', result.message || 'No se pudo descargar la actualización.');
    return ok(null);
  });

  handleIpc('app-update-install', (): IpcResponse<null> => {
    if (!appUpdateService) return fail('APP_UPDATE_UNAVAILABLE', UNAVAILABLE);
    const result = appUpdateService.install();
    if (!result.ok) {
      const code = result.code === 'ACTIVE_DOWNLOADS' ? 'APP_UPDATE_ACTIVE_DOWNLOADS' : 'APP_UPDATE_INSTALL_FAILED';
      return fail(code, result.message || 'No se pudo instalar la actualización.');
    }
    return ok(null);
  });
}
