import * as cheerio from 'cheerio';
import {
  AnimeSearchResult,
  AnimeDetails,
  DownloadLink,
  HomeEpisode,
  CatalogFiltersData,
  ScheduleData,
} from '../../../types/anime';
import { AnimeProvider, type ProviderModule } from '../AnimeProvider';
import { noopScopedLogger, type ScopedLogger } from '../../logging/AppLogger';
import {
  createJkHttpClient,
  jkAnimePageUrl,
  jkDirectoryResultsUrl,
  jkDirectoryUrl,
  jkEpisodePageUrl,
  jkEpisodesAjaxUrl,
  jkHomeUrl,
  jkScheduleUrl,
  jkSearchUrl,
  setCookieHeader,
  type JkHttpClient,
} from './client';
import {
  collectJkHomeEpisodes,
  collectJkSchedule,
  extractJkAnimesEntries,
  extractJkServersArray,
  parseJkAjaxSeed,
  parseJkDetails,
  parseJkFilterOptions,
  parseJkSearchResults,
} from './parser';
import {
  collectJkEpisodeThumbs,
  mapJkAnimeEntry,
  mapJkCatalogFromSearch,
  mapJkDetails,
  mapJkDownloadLinks,
  mapJkFiltersData,
  mapJkSearchResult,
} from './mapper';

// Eager topado en 12 páginas (~192); la cola va bajo demanda.
const JK_EPISODE_PAGES_MAX = 12;

// Contexto AJAX por slug con TTL corto.
const JK_EPISODE_CONTEXT_TTL_MS = 120_000;
// Tope de episodios por petición bajo demanda: acota el canal IPC.
const JK_EPISODE_RANGE_MAX = 200;
// Tamaño de página si la primera respuesta no permite descubrirlo.
const JK_EPISODE_PAGE_FALLBACK = 16;

interface JkEpisodeAjaxContext {
  token: string;
  cookieStr: string;
  animeId: string;
  img: string;
  lastPage: number;
  pageSize: number;
  expiresAt: number;
}

export class JkAnimeProvider implements AnimeProvider {
  private readonly logger: ScopedLogger;
  constructor(options?: { logger?: ScopedLogger }) {
    this.logger = options?.logger ?? noopScopedLogger;
  }
  get id() {
    return 'jkanime';
  }
  get name() {
    return 'JkAnime';
  }

  private readonly http: JkHttpClient = createJkHttpClient();
  // aborta la búsqueda anterior al escribir rápido
  private pendingSearchController: AbortController | null = null;
  // Contextos AJAX por slug para la carga bajo demanda de miniaturas.
  private readonly episodeAjaxContexts = new Map<string, JkEpisodeAjaxContext>();

  async getHome(): Promise<HomeEpisode[]> {
    try {
      const { data } = await this.http.get(jkHomeUrl());
      return collectJkHomeEpisodes(cheerio.load(data));
    } catch (error) {
      this.logger.error(`jkanime home: ${error}`);
      return [];
    }
  }

  async getSchedule(): Promise<ScheduleData | null> {
    try {
      const { data } = await this.http.get(jkScheduleUrl());
      return collectJkSchedule(cheerio.load(data));
    } catch (error) {
      this.logger.error(`jkanime schedule: ${error}`);
      return null;
    }
  }

  async getCatalog(filters: any = {}): Promise<AnimeSearchResult[]> {
    try {
      const page = filters.page || 1;

      if (filters.search && filters.search.trim()) {
        if (page > 1) return [];
        const searchResults = await this.search(filters.search);
        return mapJkCatalogFromSearch(searchResults);
      }

      const { data } = await this.http.get(jkDirectoryResultsUrl(filters));
      const catalog = extractJkAnimesEntries(data, this.logger);
      const results: AnimeSearchResult[] = [];
      for (const item of catalog.entries) {
        const mapped = mapJkAnimeEntry(item);
        if (mapped) results.push(mapped);
        else if (!catalog.recovered) {
          this.logger.warn('jkanime catalog: entrada de anime descartada (slug/título ausente).');
        }
      }
      return results;
    } catch (error) {
      this.logger.error(`jkanime catalog: ${error}`);
      return [];
    }
  }

  async search(query: string): Promise<AnimeSearchResult[]> {
    if (this.pendingSearchController) {
      this.pendingSearchController.abort();
    }
    const controller = new AbortController();
    this.pendingSearchController = controller;
    try {
      const { data } = await this.http.get(jkSearchUrl(query), { signal: controller.signal });
      if (this.pendingSearchController === controller) {
        this.pendingSearchController = null;
      }
      return parseJkSearchResults(cheerio.load(data)).map(mapJkSearchResult);
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.name === 'CanceledError' ||
          error.name === 'AbortError' ||
          (error as { code?: string }).code === 'ERR_CANCELED')
      ) {
        return [];
      }
      this.logger.error(`jkanime search: ${error}`);
      return [];
    } finally {
      if (this.pendingSearchController === controller) this.pendingSearchController = null;
    }
  }

  private seedEpisodeAjaxContext(
    slug: string,
    init: { token: unknown; cookieStr: unknown; animeId: unknown; img: unknown; lastPage: unknown; pageSize: unknown },
  ): void {
    const cleanSlug = String(slug || '').trim();
    const token = String(init.token || '');
    const animeId = String(init.animeId || '');
    if (!cleanSlug || !token || !animeId) return;
    const lastPage =
      typeof init.lastPage === 'number' && Number.isFinite(init.lastPage) ? Math.max(1, Math.floor(init.lastPage)) : 1;
    const pageSize =
      typeof init.pageSize === 'number' && Number.isFinite(init.pageSize) && init.pageSize > 0
        ? Math.floor(init.pageSize)
        : JK_EPISODE_PAGE_FALLBACK;
    if (this.episodeAjaxContexts.size > 50) {
      const oldest = this.episodeAjaxContexts.keys().next();
      if (!oldest.done) this.episodeAjaxContexts.delete(oldest.value);
    }
    this.episodeAjaxContexts.set(cleanSlug, {
      token,
      cookieStr: String(init.cookieStr || ''),
      animeId,
      img: String(init.img || ''),
      lastPage,
      pageSize,
      expiresAt: Date.now() + JK_EPISODE_CONTEXT_TTL_MS,
    });
  }

  private async resolveEpisodeAjaxContext(slug: string): Promise<JkEpisodeAjaxContext | null> {
    const cleanSlug = String(slug || '').trim();
    if (!cleanSlug) return null;
    const cached = this.episodeAjaxContexts.get(cleanSlug);
    if (cached && cached.expiresAt > Date.now()) return cached;
    this.episodeAjaxContexts.delete(cleanSlug);
    try {
      const res = await this.http.get(jkAnimePageUrl(cleanSlug));
      const $ = cheerio.load(res.data);
      const cookieStr = setCookieHeader(res.headers);
      const { token, animeId, img } = parseJkAjaxSeed($);
      const first = await this.http.post(
        jkEpisodesAjaxUrl(String(animeId), 1),
        new URLSearchParams({ _token: String(token || ''), id: String(animeId || ''), p: '1' }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
            Cookie: cookieStr,
            Referer: jkAnimePageUrl(cleanSlug),
          },
        },
      );
      this.seedEpisodeAjaxContext(cleanSlug, {
        token,
        cookieStr,
        animeId,
        img,
        lastPage: first.data?.last_page,
        pageSize: Array.isArray(first.data?.data) ? first.data.data.length : 0,
      });
      return this.episodeAjaxContexts.get(cleanSlug) || null;
    } catch {
      return null;
    }
  }

  // Thumbs JK de un rango; nunca lanza ({} ante fallo o entrada inválida).
  async getEpisodeThumbs(slug: string, fromEp: number, toEp: number): Promise<Record<number, string>> {
    try {
      let from = Math.floor(Number(fromEp));
      let to = Math.floor(Number(toEp));
      if (!Number.isFinite(from) || !Number.isFinite(to)) return {};
      if (from < 1) from = 1;
      if (to < from) return {};
      if (to - from + 1 > JK_EPISODE_RANGE_MAX) to = from + JK_EPISODE_RANGE_MAX - 1;
      const ctx = await this.resolveEpisodeAjaxContext(slug);
      if (!ctx) return {};
      const firstPage = Math.floor((from - 1) / ctx.pageSize) + 1;
      const lastPage = Math.min(ctx.lastPage, Math.floor((to - 1) / ctx.pageSize) + 1);
      if (firstPage > ctx.lastPage) return {};
      const out: Record<number, string> = {};
      for (let blockStart = firstPage; blockStart <= lastPage; blockStart += 3) {
        const block = [blockStart, blockStart + 1, blockStart + 2].filter((page) => page <= lastPage);
        const results = await Promise.all(
          block.map(async (page) => {
            try {
              const pageParams = new URLSearchParams({ _token: ctx.token, id: ctx.animeId, p: String(page) });
              const rp = await this.http.post(jkEpisodesAjaxUrl(ctx.animeId, page), pageParams.toString(), {
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                  'X-Requested-With': 'XMLHttpRequest',
                  Cookie: ctx.cookieStr,
                  Referer: jkAnimePageUrl(String(slug).trim()),
                },
              });
              return collectJkEpisodeThumbs(rp.data?.data, ctx.img);
            } catch {
              return {};
            }
          }),
        );
        for (const thumbs of results) Object.assign(out, thumbs);
      }
      // Solo el rango pedido: el mapa por página puede traer vecinos.
      const ranged: Record<number, string> = {};
      for (const [key, url] of Object.entries(out)) {
        const num = Number(key);
        if (Number.isInteger(num) && num >= from && num <= to) ranged[num] = url;
      }
      return ranged;
    } catch {
      return {};
    }
  }

  async getDetails(slug: string): Promise<AnimeDetails | null> {
    try {
      const res = await this.http.get(jkAnimePageUrl(slug));
      const $ = cheerio.load(res.data);

      let epsCount: number | null = null;
      const episodeThumbnails: Record<number, string> = {};
      try {
        const cookieStr = setCookieHeader(res.headers);
        const { token, animeId, img } = parseJkAjaxSeed($);

        if (token && animeId) {
          const params = new URLSearchParams();
          params.append('_token', token);
          params.append('id', animeId);
          params.append('p', '1');
          const ajaxConfig = () => ({
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'X-Requested-With': 'XMLHttpRequest',
              Cookie: cookieStr,
              Referer: jkAnimePageUrl(slug),
            },
          });

          const aj = await this.http.post(jkEpisodesAjaxUrl(animeId, 1), params.toString(), ajaxConfig());

          const total = aj.data?.total;
          if (typeof total === 'number' && Number.isInteger(total) && total > 0 && total <= 5000) {
            epsCount = total;
          }
          Object.assign(episodeThumbnails, collectJkEpisodeThumbs(aj.data?.data, img));
          // Siembra best-effort: nunca rompe la ficha.
          try {
            this.seedEpisodeAjaxContext(slug, {
              token,
              cookieStr,
              animeId,
              img,
              lastPage: aj.data?.last_page,
              pageSize: Array.isArray(aj.data?.data) ? aj.data.data.length : 0,
            });
          } catch {}

          const lastPage = aj.data?.last_page;
          const pages =
            typeof lastPage === 'number' && Number.isFinite(lastPage)
              ? Math.min(Math.max(1, Math.floor(lastPage)), JK_EPISODE_PAGES_MAX)
              : 1;
          // Bloques de 3: misma carga que en secuencial; un fallo aísla su página.
          for (let blockStart = 2; blockStart <= pages; blockStart += 3) {
            const block = [blockStart, blockStart + 1, blockStart + 2].filter((page) => page <= pages);
            const results = await Promise.all(
              block.map(async (page) => {
                try {
                  const pageParams = new URLSearchParams(params.toString());
                  pageParams.set('p', String(page));
                  const rp = await this.http.post(
                    jkEpisodesAjaxUrl(animeId, page),
                    pageParams.toString(),
                    ajaxConfig(),
                  );
                  return collectJkEpisodeThumbs(rp.data?.data, img);
                } catch {
                  return {};
                }
              }),
            );
            for (const thumbs of results) Object.assign(episodeThumbnails, thumbs);
          }
        }
      } catch (e) {
        this.logger.warn(`jkanime details: sin conteo exacto de episodios, fallback. ${e}`);
      }

      // Sin dato real del AJAX no se inventa cantidad: [] = desconocido.
      const episodes = epsCount !== null ? Array.from({ length: epsCount }, (_, i) => i + 1) : [];
      return mapJkDetails(parseJkDetails($, slug), slug, { episodes, episodeThumbnails });
    } catch (error) {
      this.logger.error(`jkanime details: ${error}`);
      return null;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getLinks(slug: string, episode: number, lang = 'SUB', signal?: AbortSignal): Promise<DownloadLink[]> {
    // DUB desactivado: solo SUB
    try {
      const { data } = await this.http.get(jkEpisodePageUrl(slug, episode), { signal });
      const servers = extractJkServersArray(data, slug, episode, this.logger);
      if (!servers) return [];
      return mapJkDownloadLinks(servers, { slug, episode, logger: this.logger });
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.name === 'CanceledError' ||
          error.name === 'AbortError' ||
          (error as { code?: string }).code === 'ERR_CANCELED')
      ) {
        return [];
      }
      this.logger.error(`jkanime links: ${error}`);
      return [];
    }
  }

  async getFiltersData(): Promise<CatalogFiltersData> {
    try {
      const { data } = await this.http.get(jkDirectoryUrl());
      return mapJkFiltersData(parseJkFilterOptions(cheerio.load(data), this.logger));
    } catch (error) {
      this.logger.error(`jkanime filters: ${error}`);
      return { genres: [], categories: [], years: [], statuses: [], orders: [] };
    }
  }
}

export { buildJkEpisodeThumbUrl, collectJkEpisodeThumbs, resolveJkSeasonFromTexts, splitJkSynonyms } from './mapper';
export { collectJkHomeEpisodes, collectJkSchedule, extractJkAlternativeTitles, extractJkMalId } from './parser';

export const jkanimeProvider: ProviderModule = {
  id: 'jkanime',
  label: 'JkAnime',
  icon: 'jkanime',
  capabilities: { search: true, homeFeed: true, schedule: true, episodeLinks: true },
  create: (options) => new JkAnimeProvider(options),
};
