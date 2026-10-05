import { handleIpc } from '../ipcGuard';
import { ok } from '../../../types/api';
import type { IpcRegistryDependencies } from '../../IpcRegistry';

export function registerServerStatsHandlers(dependencies: IpcRegistryDependencies): void {
  handleIpc('get-server-stats', async () => {
    try {
      return ok(dependencies.serverStatsStore.getSnapshot());
    } catch (error) {
      dependencies.writeGlobalLog(error);
      return ok({ rows: [], totalAttempts: 0 });
    }
  });
}
