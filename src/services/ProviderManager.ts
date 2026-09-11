import { AnimeProvider } from './providers/AnimeProvider';
import { AnimeAV1Provider } from './providers/AnimeAV1Provider';
import { JkAnimeProvider } from './providers/JkAnimeProvider';
import type { ScopedLogger } from './AppLogger';

export class ProviderManager {
  private providers: Map<string, AnimeProvider>;
  private activeProviderId: string;

  constructor(options?: { logger?: ScopedLogger }) {
    this.providers = new Map();

    const animeAv1 = new AnimeAV1Provider({ logger: options?.logger });
    const jkanime = new JkAnimeProvider({ logger: options?.logger });

    this.providers.set(animeAv1.id, animeAv1);
    this.providers.set(jkanime.id, jkanime);

    this.activeProviderId = animeAv1.id;
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
