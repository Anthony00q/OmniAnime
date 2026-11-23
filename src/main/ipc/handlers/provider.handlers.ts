import { handleIpc } from '../ipcGuard';
import { fail, ok } from '../../../types/api';
import type { IpcRegistryDependencies } from '../../IpcRegistry';

export function registerProviderHandlers({
  getPreloadedData,
  providerGateway,
  checkConnectivity,
}: IpcRegistryDependencies): void {
  handleIpc('get-preloaded-data', async () => ok(await getPreloadedData()));
  handleIpc('get-providers', () => ok(providerGateway.getProvidersList()));
  handleIpc('get-active-provider', () => ok(providerGateway.activeProviderIdName));
  handleIpc('set-active-provider', (_, id) =>
    providerGateway.setActiveProvider(id) ? ok(null) : fail('SET_ACTIVE_PROVIDER_FAILED', 'Proveedor no disponible'),
  );
  handleIpc('get-connectivity-status', async () => ok(await checkConnectivity()));
}
