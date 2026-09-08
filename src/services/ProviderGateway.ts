import type { AnimeProvider } from './providers/AnimeProvider';

export interface ProviderGatewayPort {
  readonly activeProvider: AnimeProvider;
  readonly activeProviderIdName: string;
  getProvidersList(): Array<{ id: string; name: string }>;
  setActiveProvider(id: string): boolean;
  getProvider(id: string): AnimeProvider | undefined;
}

export class ProviderGateway implements ProviderGatewayPort {
  constructor(private readonly providerManager: ProviderGatewayPort) {}

  get activeProvider(): AnimeProvider {
    return this.providerManager.activeProvider;
  }

  get activeProviderIdName(): string {
    return this.providerManager.activeProviderIdName;
  }

  getProvidersList(): Array<{ id: string; name: string }> {
    return this.providerManager.getProvidersList();
  }

  setActiveProvider(id: string): boolean {
    return this.providerManager.setActiveProvider(id);
  }

  getProvider(id: string): AnimeProvider | undefined {
    return this.providerManager.getProvider(id);
  }
}
