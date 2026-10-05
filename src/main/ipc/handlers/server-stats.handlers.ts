import { handleIpc } from '../ipcGuard';
import type { IpcRegistryDependencies } from '../../IpcRegistry';

export function registerServerStatsHandlers(dependencies: IpcRegistryDependencies): void {
  handleIpc('get-server-stats', async () => {
    try {
      return dependencies.serverStatsStore.getSnapshot();
    } catch (error) {
      dependencies.writeGlobalLog(error);
      return { rows: [], totalAttempts: 0 };
    }
  });
}
