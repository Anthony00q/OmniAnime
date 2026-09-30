import type { ScheduleData } from '../types/anime';
import type { ProviderGatewayPort } from './ProviderGateway';

interface FreshCacheEntry {
  data: ScheduleData;
  expiresAt: number;
}

interface StaleCacheEntry {
  data: ScheduleData;
  fetchedAt: number;
}

export interface ScheduleLogger {
  warn(message: string): void;
}

// Horario semanal por proveedor. El horario cambia poco: caché fresh de 30
// min y respaldo de 24h para servir el último conocido si la red falla.
export class ScheduleService {
  private readonly freshCache: Record<string, FreshCacheEntry> = {};
  private readonly staleCache: Record<string, StaleCacheEntry> = {};
  private readonly inFlight: Record<string, Promise<ScheduleData | null> | undefined> = {};

  constructor(
    private readonly providerGateway: ProviderGatewayPort,
    private readonly logger: ScheduleLogger = console,
  ) {}

  async getSchedule(force = false, providerId?: string): Promise<ScheduleData | null> {
    const requested =
      typeof providerId === 'string' && providerId.trim()
        ? this.providerGateway.getProvider(providerId.trim())
        : undefined;
    const target = requested ?? this.providerGateway.activeProvider;
    const cacheKey = target.id;
    const now = Date.now();
    const freshTtlMs = 30 * 60 * 1000;
    const staleTtlMs = 24 * 60 * 60 * 1000;

    const readStale = (): ScheduleData | null => {
      const stale = this.staleCache[cacheKey];
      if (!stale || now - stale.fetchedAt > staleTtlMs) return null;
      return stale.data;
    };

    if (force) {
      delete this.freshCache[cacheKey];
    }

    const cached = this.freshCache[cacheKey];
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    if (!force && this.inFlight[cacheKey]) {
      return this.inFlight[cacheKey];
    }

    const pending = (async () => {
      const data = await target.getSchedule(force);
      if (data) {
        this.freshCache[cacheKey] = { data, expiresAt: now + freshTtlMs };
        this.staleCache[cacheKey] = { data, fetchedAt: now };
        return data;
      }
      const stale = readStale();
      if (stale) {
        this.logger.warn(`[Schedule] fallo en ${cacheKey}. Usando cache de respaldo.`);
        return stale;
      }
      return null;
    })();

    this.inFlight[cacheKey] = pending;
    try {
      return await pending;
    } finally {
      if (this.inFlight[cacheKey] === pending) {
        delete this.inFlight[cacheKey];
      }
    }
  }

  clearFreshCache(): void {
    Object.keys(this.freshCache).forEach((key) => delete this.freshCache[key]);
  }
}
