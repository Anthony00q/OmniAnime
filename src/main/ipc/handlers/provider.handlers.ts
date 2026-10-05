import { handleIpc } from '../ipcGuard';
import { fail, ok } from '../../../types/api';
import type { IpcRegistryDependencies } from '../../IpcRegistry';

export function registerProviderHandlers({
  preloadedData,
  providerGateway,
  getConnectivityStatus,
}: IpcRegistryDependencies): void {
  handleIpc('get-preloaded-data', () => ok(preloadedData));
  handleIpc('get-providers', () => ok(providerGateway.getProvidersList()));
  handleIpc('get-active-provider', () => ok(providerGateway.activeProviderIdName));
  handleIpc('set-active-provider', (_, id) =>
    providerGateway.setActiveProvider(id) ? ok(null) : fail('SET_ACTIVE_PROVIDER_FAILED', 'Proveedor no disponible'),
  );
  handleIpc('get-connectivity-status', () => ok(getConnectivityStatus()));
}
