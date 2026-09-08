import { ipcMain } from 'electron';
import type { IpcRegistryDependencies } from '../../IpcRegistry';

export function registerProviderHandlers({
  preloadedData,
  providerGateway,
  getConnectivityStatus,
}: IpcRegistryDependencies): void {
  ipcMain.handle('get-preloaded-data', () => preloadedData);
  ipcMain.handle('get-providers', () => providerGateway.getProvidersList());
  ipcMain.handle('get-active-provider', () => providerGateway.activeProviderIdName);
  ipcMain.handle('set-active-provider', (_, id) => providerGateway.setActiveProvider(id));
  ipcMain.handle('get-connectivity-status', () => getConnectivityStatus());
}
