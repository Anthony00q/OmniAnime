import {
  AnimeSearchResult,
  AnimeDetails,
  DownloadLink,
  HomeEpisode,
  CatalogFilters,
  CatalogFiltersData,
  ScheduleData,
} from '../../../types/anime';
import { AnimeProvider } from '../AnimeProvider';
import { noopScopedLogger, type ScopedLogger } from '../../logging/AppLogger';
import type { OutboundClient } from '../../../utils/security/outboundPolicy';
import {
  AV1_BASE_URL,
  av1CatalogPageUrl,
  av1CatalogUrl,
  av1EpisodeUrl,
  av1MediaUrl,
  av1ScheduleUrl,
  av1SearchUrl,
  createAv1Client,
} from './client';
import {
  extractResultsContent,
  parseAv1Details,
  parseAv1Filters,
  parseAv1HomeRaw,
  parseAv1LinkEntries,
  parseAv1ResultBlocks,
  parseAv1Schedule,
  parseCatalogFallback,
  parseCategoryDict,
} from './parser';
import { mapAv1Details, mapAv1DownloadLinks, mapAv1FiltersData, mapAv1HomeEpisode, mapAv1SearchResult } from './mapper';

export class AnimeAV1Provider implements AnimeProvider {
  private readonly logger: ScopedLogger;
  constructor(options?: { logger?: ScopedLogger }) {
    this.logger = options?.logger ?? noopScopedLogger;
  }
  get id() {
    return 'animeav1';
  }
  get name() {
    return 'AnimeAV1';
  }

  private client: OutboundClient = createAv1Client();
  private pendingSearchController: AbortController | null = null;

  private cache: {
    home: { data: HomeEpisode[]; timestamp: number } | null;
    schedule: { data: ScheduleData; timestamp: number } | null;
    filters: { data: CatalogFiltersData; timestamp: number } | null;
    catalog: Map<string, { data: AnimeSearchResult[]; timestamp: number }>;
  } = {
    home: null,
    schedule: null,
    filters: null,
    catalog: new Map(),
  };

  private readonly CACHE_TTL = {
    home: 2 * 60 * 1000, // 2m
    schedule: 30 * 60 * 1000, // 30m
    catalog: 5 * 60 * 1000, // 5m
    filters: 60 * 60 * 1000, // 1h
  };

  async getHome(force = false, signal?: AbortSignal): Promise<HomeEpisode[]> {
    const now = Date.now();
    if (!force && this.cache.home && now - this.cache.home.timestamp < this.CACHE_TTL.home) {
      return this.cache.home.data;
    }

    try {
      const r = await this.client.get(AV1_BASE_URL, { signal });
      const eps: HomeEpisode[] = [];
      const seen = new Set<string>();
      for (const raw of parseAv1HomeRaw(r.data)) {
        const key = `${raw.slug}-${raw.episode}`;
        if (seen.has(key)) continue;
        seen.add(key);
        eps.push(mapAv1HomeEpisode(raw));
        if (eps.length >= 24) break;
      }

      if (eps.length > 0) {
        this.cache.home = { data: eps, timestamp: now };
      }
      return eps;
    } catch (e) {
      this.logger.error('animeav1 home: ' + String(e));
      return [];
    }
  }

  async getSchedule(force = false, signal?: AbortSignal): Promise<ScheduleData | null> {
    const now = Date.now();
    if (!force && this.cache.schedule && now - this.cache.schedule.timestamp < this.CACHE_TTL.schedule) {
      return this.cache.schedule.data;
    }
    try {
      const r = await this.client.get(av1ScheduleUrl(), { signal });
      const data = parseAv1Schedule(r.data);
      this.cache.schedule = { data, timestamp: now };
      return data;
    } catch (e) {
      this.logger.error('animeav1 schedule: ' + String(e));
      return null;
    }
  }

  async getFiltersData(force = false): Promise<CatalogFiltersData> {
    const now = Date.now();
    if (!force && this.cache.filters && now - this.cache.filters.timestamp < this.CACHE_TTL.filters) {
      return this.cache.filters.data;
    }

    try {
      const r = await this.client.get(av1CatalogPageUrl());
      const data = mapAv1FiltersData(parseAv1Filters(r.data));

      if (data.categories.length > 0 || data.genres.length > 0) {
        this.cache.filters = { data, timestamp: now };
      }
      return data;
    } catch (e) {
      this.logger.error('animeav1 filters: ' + String(e));
      return { categories: [], genres: [], years: [] };
    }
  }

  async getCatalog(filters: CatalogFilters = {}, force = false): Promise<AnimeSearchResult[]> {
    const cacheKey = JSON.stringify(filters);
    const now = Date.now();
    const cached = this.cache.catalog.get(cacheKey);
    if (!force && cached && now - cached.timestamp < this.CACHE_TTL.catalog) {
      return cached.data;
    }

    try {
      const r = await this.client.get(av1CatalogUrl(filters));
      const html = r.data;
      let results: AnimeSearchResult[] = [];

      const content = extractResultsContent(html);
      if (content !== null) {
        try {
          const catDict = parseCategoryDict(html);
          results = parseAv1ResultBlocks(content).map((raw) => mapAv1SearchResult(raw, catDict));
        } catch (e) {
          this.logger.error('animeav1 parse svelte: ' + String(e));
          results = [];
        }
      }

      if (results.length === 0) {
        results = parseCatalogFallback(html, this.logger);
      }

      if (results.length > 0) {
        this.cache.catalog.set(cacheKey, { data: results, timestamp: now });
        if (this.cache.catalog.size > 20) {
          const oldestKey = this.cache.catalog.keys().next().value;
          if (oldestKey) this.cache.catalog.delete(oldestKey);
        }
      }
      return results;
    } catch (e) {
      this.logger.error('animeav1 search: ' + String(e));
      return [];
    }
  }

  async search(query: string): Promise<AnimeSearchResult[]> {
    if (this.pendingSearchController) {
      try {
        this.pendingSearchController.abort();
      } catch {}
    }
    const controller = new AbortController();
    this.pendingSearchController = controller;
    try {
      const r = await this.client.get(av1SearchUrl(query), { signal: controller.signal as any });
      if (this.pendingSearchController === controller) this.pendingSearchController = null;
      const html = r.data;
      const content = extractResultsContent(html);
      if (content === null) return [];
      return parseAv1ResultBlocks(content).map((raw) => mapAv1SearchResult(raw, {}));
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.name === 'CanceledError' ||
          error.name === 'AbortError' ||
          (error as { code?: string }).code === 'ERR_CANCELED')
      ) {
        return [];
      }
      this.logger.error('animeav1 search: ' + String(error));
      return [];
    } finally {
      if (this.pendingSearchController === controller) this.pendingSearchController = null;
    }
  }

  async getDetails(slug: string, signal?: AbortSignal): Promise<AnimeDetails | null> {
    try {
      const response = await this.client.get(av1MediaUrl(slug), { signal });
      return mapAv1Details(parseAv1Details(response.data, slug), slug);
    } catch (error) {
      this.logger.error('animeav1 details: ' + String(error));
      return null;
    }
  }

  async getLinks(slug: string, ep: number, lang: 'SUB' | 'DUB' = 'SUB', signal?: AbortSignal): Promise<DownloadLink[]> {
    // DUB desactivado: solo SUB
    if (lang === 'DUB') lang = 'SUB';
    try {
      const r = await this.client.get(av1EpisodeUrl(slug, ep), { signal });
      return mapAv1DownloadLinks(parseAv1LinkEntries(r.data, lang));
    } catch (error) {
      this.logger.error('animeav1 links: ' + String(error));
      return [];
    }
  }
}

export { buildAv1EpisodeThumbUrl } from './mapper';
export { extractAkaTitles, extractMediaMalId, parseAv1Schedule } from './parser';
