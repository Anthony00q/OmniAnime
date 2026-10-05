import { handleIpc } from '../ipcGuard';
import type { IpcRegistryDependencies } from '../../IpcRegistry';

export function registerProviderHandlers({
  preloadedData,
  providerGateway,
  getConnectivityStatus,
}: IpcRegistryDependencies): void {
  handleIpc('get-preloaded-data', () => preloadedData);
  handleIpc('get-providers', () => providerGateway.getProvidersList());
  handleIpc('get-active-provider', () => providerGateway.activeProviderIdName);
  handleIpc('set-active-provider', (_, id) => providerGateway.setActiveProvider(id));
  handleIpc('get-connectivity-status', () => getConnectivityStatus());
}
