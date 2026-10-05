import { AnimeProvider } from './AnimeProvider';
import { createProviderRegistry, type ProviderRegistry } from './ProviderRegistry';
import type { ScopedLogger } from '../logging/AppLogger';

export class ProviderManager {
  private providers: Map<string, AnimeProvider>;
  private activeProviderId: string;

  constructor(options?: { logger?: ScopedLogger; registry?: ProviderRegistry }) {
    this.providers = new Map();

    const registry = options?.registry ?? createProviderRegistry();
    for (const mod of registry.modules) {
      this.providers.set(mod.id, mod.create({ logger: options?.logger }));
    }

    const first = registry.modules[0];
    this.activeProviderId = first ? first.id : '';
  }

  get activeProvider(): AnimeProvider {
    return this.providers.get(this.activeProviderId)!;
  }

  get activeProviderIdName(): string {
    return this.activeProviderId;
  }

  getProvidersList(): Array<{ id: string; name: string }> {
    return Array.from(this.providers.values()).map((p) => ({
      id: p.id,
      name: p.name,
    }));
  }

  setActiveProvider(id: string): boolean {
    if (this.providers.has(id)) {
      this.activeProviderId = id;
      return true;
    }
    return false;
  }

  getProvider(id: string): AnimeProvider | undefined {
    return this.providers.get(id);
  }
}
