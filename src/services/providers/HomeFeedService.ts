import type { HomeEpisode } from '../../types/anime';
import type { ProviderGatewayPort } from './ProviderGateway';

export type HomeMediaFilter = 'anime' | 'manga';

// Orden de secciones del home; lo desconocido va al final.
const HOME_SECTION_ORDER = ['anime', 'donghua', 'ova'];

// El límite es por sección (no global); las filas sin kind cuentan como anime.
function limitPerKind(rows: HomeEpisode[], perTypeLimit: number): HomeEpisode[] {
  const limit = Number.isFinite(perTypeLimit) ? Math.max(0, Math.floor(perTypeLimit)) : 0;
  const buckets = new Map<string, HomeEpisode[]>();
  for (const row of rows) {
    const kind = typeof row.kind === 'string' && row.kind ? row.kind : 'anime';
    let bucket = buckets.get(kind);
    if (!bucket) {
      bucket = [];
      buckets.set(kind, bucket);
    }
    if (bucket.length < limit) bucket.push(row);
  }
  const out: HomeEpisode[] = [];
  const order = [
    ...HOME_SECTION_ORDER,
    ...Array.from(buckets.keys()).filter((kind) => !HOME_SECTION_ORDER.includes(kind)),
  ];
  for (const kind of order) {
    const bucket = buckets.get(kind);
    if (bucket) out.push(...bucket);
  }
  return out;
}

interface FreshCacheEntry {
  data: HomeEpisode[];
  expiresAt: number;
}

interface StaleCacheEntry {
  data: HomeEpisode[];
  fetchedAt: number;
}

export interface HomeFeedLogger {
  warn(message: string): void;
}

export class HomeFeedService {
  private readonly freshCache: Record<string, FreshCacheEntry> = {};
  private readonly staleCache: Record<string, StaleCacheEntry> = {};
  private readonly backoff: Record<string, { until: number; strikes: number }> = {};
  private readonly inFlight: Record<string, Promise<HomeEpisode[]> | undefined> = {};

  constructor(
    private readonly providerGateway: ProviderGatewayPort,
    private readonly logger: HomeFeedLogger = console,
  ) {}

  async getHomeFeed(
    mediaFilter: HomeMediaFilter,
    perTypeLimit = 30,
    force = false,
    providerId?: string,
  ): Promise<HomeEpisode[]> {
    if (mediaFilter !== 'anime') return [];

    const requested =
      typeof providerId === 'string' && providerId.trim()
        ? this.providerGateway.getProvider(providerId.trim())
        : undefined;
    const target = requested ?? this.providerGateway.activeProvider;
    const cacheKey = `${target.id}:${mediaFilter}:${perTypeLimit}`;
    const now = Date.now();
    const staleTtlMs = 15 * 60 * 1000;

    const readStale = (): HomeEpisode[] | null => {
      const stale = this.staleCache[cacheKey];
      if (!stale) return null;
      if (now - stale.fetchedAt > staleTtlMs) return null;
      return stale.data;
    };

    const saveFresh = (data: HomeEpisode[], ttlMs: number): HomeEpisode[] => {
      this.freshCache[cacheKey] = { data, expiresAt: now + ttlMs };
      this.staleCache[cacheKey] = { data, fetchedAt: now };
      this.backoff[cacheKey] = { until: 0, strikes: 0 };
      return data;
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
      try {
        const rows = await target.getHome(force);
        return saveFresh(limitPerKind(rows, perTypeLimit), 4 * 60 * 1000);
      } catch (error) {
        const stale = readStale();
        if (stale) {
          this.logger.warn(`[HomeFeed] fallo en ${cacheKey}. Usando cache de respaldo.`);
          return stale;
        }
        throw error;
      }
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
