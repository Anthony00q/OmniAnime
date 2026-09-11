import axios, { type AxiosRequestConfig } from 'axios';
import * as cheerio from 'cheerio';
import * as http from 'http';
import * as https from 'https';
import {
  AnimeSearchResult,
  AnimeDetails,
  DownloadLink,
  HomeEpisode,
  CatalogFiltersData,
  AnimeLanguage,
} from '../../types/anime';
import { AnimeProvider } from './AnimeProvider';
import { noopScopedLogger, type ScopedLogger } from '../AppLogger';
import { normalizeAllowedImageUrl } from '../../utils/networkSecurity';
import { normalizeMegaUrl, normalizeMp4UploadUrl } from '../../utils/serverUtils';
import { extractBalancedBlock, extractBalancedObjects, decodeBase64Text, isHttpUrl } from '../../utils/scrapeParse';

const MAX_HTML_BYTES = 5 * 1024 * 1024;

// `select[name]` del formulario de /directorio/ → cubo de filtros.
// No usar la posición: el orden puede cambiar sin aviso.
const FILTER_BY_SELECT_NAME: Record<
  string,
  | 'orders'
  | 'genres'
  | 'letters'
  | 'demographics'
  | 'categories'
  | 'types'
  | 'statuses'
  | 'years'
  | 'seasons'
  | 'orderDirs'
> = {
  filtro: 'orders',
  genero: 'genres',
  letra: 'letters',
  demografia: 'demographics',
  categoria: 'categories',
  tipo: 'types',
  estado: 'statuses',
  fecha: 'years',
  temporada: 'seasons',
  orden: 'orderDirs',
};

// Texto del <label> que acompaña a cada select (segunda señal si falta `name`).
const FILTER_BY_LABEL: Record<
  string,
  | 'orders'
  | 'genres'
  | 'letters'
  | 'demographics'
  | 'categories'
  | 'types'
  | 'statuses'
  | 'years'
  | 'seasons'
  | 'orderDirs'
> = {
  'ordenar por': 'orders',
  genero: 'genres',
  letra: 'letters',
  demografia: 'demographics',
  categoria: 'categories',
  tipo: 'types',
  estado: 'statuses',
  año: 'years',
  ano: 'years',
  temporada: 'seasons',
  orden: 'orderDirs',
};

// Orden histórico documentado: último recurso si un select no trae ni
// `name` ni `label` reconocibles.
const LEGACY_FILTER_ORDER = [
  'orders',
  'genres',
  'letters',
  'demographics',
  'categories',
  'types',
  'statuses',
  'years',
  'seasons',
  'orderDirs',
] as const;

// Mes español (1-12) → estación, mismo corte que AnimeAV1 por fecha.
const JK_MONTH_SEASON: Array<{ names: string[]; season: string }> = [
  { names: ['enero', 'febrero', 'marzo'], season: 'Invierno' },
  { names: ['abril', 'mayo', 'junio'], season: 'Primavera' },
  { names: ['julio', 'agosto', 'septiembre', 'setiembre'], season: 'Verano' },
  { names: ['octubre', 'noviembre', 'diciembre'], season: 'Otoño' },
];

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

// Miniaturas por episodio: el AJAX trae `image` por capítulo y la base se
// deriva del póster (`/animes/image/` → `/animes/video/image_thumb/`).
export function buildJkEpisodeThumbUrl(posterUrl: unknown, imageName: unknown): string {
  const name = String(imageName || '').trim();
  if (!/^[\w.-]+\.(jpg|jpeg|png|webp)$/i.test(name)) return '';
  const poster = String(posterUrl || '');
  const marker = '/animes/image/';
  const idx = poster.indexOf(marker);
  if (idx === -1) return '';
  const base = `${poster.slice(0, idx)}/animes/video/image_thumb/`;
  return normalizeAllowedImageUrl(`${base}${name}`);
}

export function collectJkEpisodeThumbs(items: unknown, posterUrl: unknown): Record<number, string> {
  const out: Record<number, string> = {};
  if (!Array.isArray(items)) return out;
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const num = (item as { number?: unknown }).number;
    if (typeof num !== 'number' || !Number.isInteger(num) || num <= 0 || num > 5000) continue;
    if (out[num] !== undefined) continue;
    const url = buildJkEpisodeThumbUrl(posterUrl, (item as { image?: unknown }).image);
    if (url) out[num] = url;
  }
  return out;
}

// Temporada de la ficha: valor directo del li 'Temporada:'; si falta se
// deriva del mes de 'Emitido:'. Vacío = la fila se oculta en la UI.
export function resolveJkSeasonFromTexts(temporadaValue: unknown, emitidoText: unknown, year: unknown): string {
  const direct = String(temporadaValue || '').trim();
  if (direct) return direct;
  const emitido = String(emitidoText || '').toLowerCase();
  const found = JK_MONTH_SEASON.find((entry) => entry.names.some((name) => emitido.includes(name)));
  if (!found) return '';
  const yearMatch = String(year || '').match(/(\d{4})/);
  return yearMatch ? `${found.season} ${yearMatch[1]}` : found.season;
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

  private readonly BASE_URL = 'https://jkanime.net';
  private readonly REQUEST_TIMEOUT_MS = 10_000;
  private readonly MAX_REDIRECTS = 3;
  // abort previous search on fast typing
  private pendingSearchController: AbortController | null = null;
  private readonly httpAgent = new http.Agent({ keepAlive: true, maxSockets: 32 });
  private readonly httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 32 });
  // Contextos AJAX por slug para la carga bajo demanda de miniaturas.
  private readonly episodeAjaxContexts = new Map<string, JkEpisodeAjaxContext>();

  private requestConfig(extra: AxiosRequestConfig = {}): AxiosRequestConfig {
    return {
      timeout: this.REQUEST_TIMEOUT_MS,
      maxRedirects: this.MAX_REDIRECTS,
      maxContentLength: MAX_HTML_BYTES,
      maxBodyLength: MAX_HTML_BYTES,
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
      ...extra,
    };
  }

  private normalizeImageUrl(rawUrl: string): string {
    return normalizeAllowedImageUrl(rawUrl, `${this.BASE_URL}/`);
  }

  async getHome(): Promise<HomeEpisode[]> {
    try {
      const { data } = await axios.get(this.BASE_URL, this.requestConfig());
      const $ = cheerio.load(data);
      const episodes: HomeEpisode[] = [];

      $('.mb-4.d-flex.align-items-stretch .card').each((i: any, el: any) => {
        const a = $(el).find('a').first();
        const url = a.attr('href') || '';
        if (!url) return;

        const parts = url.split('/').filter(Boolean);
        const episodeNum = parts.pop() || '1';
        const slug = parts.pop() || '';

        const img = this.normalizeImageUrl(
          $(el).find('img').attr('data-animepic') || $(el).find('img').attr('src') || '',
        );
        const title = $(el).find('.card-title').text().trim() || slug.replace(/-/g, ' ');
        const timeStr = $(el).find('.badge-secondary').text().trim() || 'Reciente';

        episodes.push({
          title: title,
          slug: slug,
          episode: episodeNum,
          poster: img,
          timeAgo: timeStr,
        });
      });

      return episodes;
    } catch (error) {
      this.logger.error(`jkanime home: ${error}`);
      return [];
    }
  }

  async getCatalog(filters: any = {}): Promise<AnimeSearchResult[]> {
    try {
      const page = filters.page || 1;

      if (filters.search && filters.search.trim()) {
        if (page > 1) return [];
        const searchResults = await this.search(filters.search);
        return searchResults.map((r) => ({
          ...r,
          category: r.category || 'Anime',
          year: r.year || '',
          status: r.status || '',
        }));
      }

      const params = new URLSearchParams();
      params.set('p', String(page));

      if (filters.genre && filters.genre.length > 0) params.append('genero', filters.genre[0]);
      if (filters.category) params.append('categoria', filters.category);
      if (filters.status) params.append('estado', filters.status);
      // year param is 'fecha'
      if (filters.year) params.append('fecha', filters.year);
      else if (filters.maxYear) params.append('fecha', filters.maxYear);

      if (filters.letter) params.append('letra', filters.letter);
      if (filters.demographic) params.append('demografia', filters.demographic);
      if (filters.type) params.append('tipo', filters.type);
      if (filters.season) params.append('temporada', filters.season);

      // empty 'filtro' = by date (default)
      if (filters.order !== undefined && filters.order !== '') {
        params.append('filtro', filters.order);
      }
      // 'orden': "" = desc, "asc" = asc

      if (filters.orderDir !== undefined && filters.orderDir !== '') {
        params.append('orden', filters.orderDir);
      }

      const { data } = await axios.get(`${this.BASE_URL}/directorio/?${params.toString()}`, this.requestConfig());

      const match = data.match(/var animes = (\{.*?\});/);
      if (match) {
        try {
          return this.parseAnimesArray(JSON.parse(match[1]));
        } catch {
          this.logger.warn('jkanime catalog: payload var animes ilegible, reintentando por entradas.');
        }
        return this.parseAnimesEntriesFallback(data);
      }
      return [];
    } catch (error) {
      this.logger.error(`jkanime catalog: ${error}`);
      return [];
    }
  }

  private mapAnimeEntry(item: unknown): AnimeSearchResult | null {
    try {
      if (!item || typeof item !== 'object') return null;
      const entry = item as Record<string, unknown>;
      const slug = typeof entry.slug === 'string' ? entry.slug.trim() : '';
      const title = typeof entry.title === 'string' ? entry.title.trim() : '';
      if (!slug || !title) return null;
      return {
        id: slug,
        title,
        slug,
        poster: this.normalizeImageUrl(typeof entry.image === 'string' ? entry.image : ''),
        synopsis: typeof entry.synopsis === 'string' && entry.synopsis ? entry.synopsis : 'Sin sinopsis',
      };
    } catch {
      return null;
    }
  }

  private parseAnimesArray(json: unknown): AnimeSearchResult[] {
    const results: AnimeSearchResult[] = [];
    if (!json || typeof json !== 'object') return results;
    const data = (json as Record<string, unknown>).data;
    if (!Array.isArray(data)) return results;
    for (const item of data) {
      const mapped = this.mapAnimeEntry(item);
      if (mapped) results.push(mapped);
      else this.logger.warn('jkanime catalog: entrada de anime descartada (slug/título ausente).');
    }
    return results;
  }

  // Si el JSON completo no parsea, recupera entrada por entrada: una
  // corrupta se descarta sin vaciar las válidas.
  private parseAnimesEntriesFallback(data: string): AnimeSearchResult[] {
    try {
      const inner = extractBalancedBlock(data, '"data":', '[', ']');
      if (inner === null) return [];
      const results: AnimeSearchResult[] = [];
      for (const entry of extractBalancedObjects(inner)) {
        try {
          const mapped = this.mapAnimeEntry(JSON.parse(entry));
          if (mapped) results.push(mapped);
        } catch {
          this.logger.warn('jkanime catalog: entrada de anime corrupta descartada.');
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
      const safeQuery = encodeURIComponent(query.replace(/ /g, '_'));
      const { data } = await axios.get(
        `${this.BASE_URL}/buscar/${safeQuery}/`,
        this.requestConfig({ signal: controller.signal }),
      );
      if (this.pendingSearchController === controller) {
        this.pendingSearchController = null;
      }
      const $ = cheerio.load(data);
      const results: AnimeSearchResult[] = [];

      $('.anime__item').each((i: any, el: any) => {
        const a = $(el).find('a').first();
        const url = a.attr('href');
        if (!url) return;

        const slug = url.replace(this.BASE_URL, '').split('/').filter(Boolean)[0] || '';
        const title = $(el).find('h5 a').text().trim() || slug;
        const img = this.normalizeImageUrl($(el).find('.anime__item__pic').attr('data-setbg') || '');

        if (title && slug) {
          results.push({
            id: slug,
            title: title,
            slug: slug,
            poster: img,
            synopsis: 'Sin sinopsis',
          });
        }
      });

      return results;
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
      const res = await axios.get(`${this.BASE_URL}/${cleanSlug}/`, this.requestConfig());
      const $ = cheerio.load(res.data);
      const cookies = res.headers['set-cookie'];
      const cookieStr = cookies ? cookies.map((c) => c.split(';')[0]).join('; ') : '';
      const token = $('meta[name="csrf-token"]').attr('content');
      const animeId = $('#guardar-anime').attr('data-anime');
      const img = this.normalizeImageUrl($('.anime_pic img').attr('src') || '');
      const first = await axios.post(
        `${this.BASE_URL}/ajax/episodes/${animeId}/${1}`,
        new URLSearchParams({ _token: String(token || ''), id: String(animeId || ''), p: '1' }).toString(),
        this.requestConfig({
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
            Cookie: cookieStr,
            Referer: `${this.BASE_URL}/${cleanSlug}/`,
          },
        }),
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
              const rp = await axios.post(
                `${this.BASE_URL}/ajax/episodes/${ctx.animeId}/${page}`,
                pageParams.toString(),
                this.requestConfig({
                  headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest',
                    Cookie: ctx.cookieStr,
                    Referer: `${this.BASE_URL}/${String(slug).trim()}/`,
                  },
                }),
              );
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
      const res = await axios.get(`${this.BASE_URL}/${slug}/`, this.requestConfig());
      const $ = cheerio.load(res.data);

      const titleContainer = $('.anime_info h3').first();
      const titleText = titleContainer.text().trim();
      const title =
        titleText === 'Buscado recientemente:' || titleText === 'Más secciones'
          ? $('.anime_info h3').eq(1).text().trim() || slug.replace(/-/g, ' ')
          : titleText || slug.replace(/-/g, ' ');

      const synopsis = $('p.scroll').text().trim() || 'No hay sinopsis disponible para este anime.';
      const img = this.normalizeImageUrl($('.anime_pic img').attr('src') || '');

      let epsCount: number | null = null;
      const episodeThumbnails: Record<number, string> = {};
      try {
        const cookies = res.headers['set-cookie'];
        const cookieStr = cookies ? cookies.map((c) => c.split(';')[0]).join('; ') : '';
        const token = $('meta[name="csrf-token"]').attr('content');
        const animeId = $('#guardar-anime').attr('data-anime');

        if (token && animeId) {
          const params = new URLSearchParams();
          params.append('_token', token);
          params.append('id', animeId);
          params.append('p', '1');
          const ajaxConfig = () =>
            this.requestConfig({
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
                Cookie: cookieStr,
                Referer: `${this.BASE_URL}/${slug}/`,
              },
            });

          const aj = await axios.post(`${this.BASE_URL}/ajax/episodes/${animeId}/1`, params.toString(), ajaxConfig());

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
                  const rp = await axios.post(
                    `${this.BASE_URL}/ajax/episodes/${animeId}/${page}`,
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

      const alternativeTitle = $('.anime_info h3').first().next('span').text().trim() || '';

      const genres: string[] = [];
      $('a[href*="/genero/"]').each((_: any, el: any) => {
        const g = $(el).text().trim();
        if (g && !genres.includes(g)) genres.push(g);
      });

      // status: currently/finished/proximo
      const statusEl = $('.enemision').first();
      let status = 'Desconocido';
      if (statusEl.length) {
        const cls = statusEl.attr('class') || '';
        const txt = statusEl.text().trim();
        if (cls.includes('finished')) status = 'Finalizado';
        else if (cls.includes('currently')) status = 'En emisión';
        else if (cls.includes('proximo') || cls.includes('upcoming')) status = 'Próximamente';
        else if (txt) status = txt;
      }
      if (status === 'Desconocido') {
        const dataStatus = $('.dropmenu').attr('data-status') || '';
        if (dataStatus === 'finished') status = 'Finalizado';
        else if (dataStatus === 'currently') status = 'En emisión';
        else if (dataStatus === 'proximo') status = 'Próximamente';
      }

      let year = 'N/A';
      $('li').each((_: any, el: any) => {
        const liText = $(el).text();
        if (liText.includes('Emitido:') || liText.includes('Emitido ')) {
          const yearMatch = liText.match(/(\d{4})/);
          if (yearMatch) {
            year = yearMatch[1];
            return false;
          }
        }
      });

      const availableLanguages = new Set<AnimeLanguage>();
      // DUB desactivado: solo SUB
      const languageRows = $('.anime_data.pc li').length > 0 ? $('.anime_data.pc li') : $('.anime_data li');
      languageRows.each((_: any, el: any) => {
        const liText = $(el).text().replace(/\s+/g, ' ').trim();
        if (!/^Idiomas:/i.test(liText)) return;
        if (/(japonés|japones|sub)/i.test(liText)) {
          availableLanguages.add('SUB');
        }
      });
      if (availableLanguages.size === 0) availableLanguages.add('SUB');

      let category = 'Anime';
      const catEl = $('a[href*="/categoria/"]').first();
      if (catEl.length) category = catEl.text().trim() || 'Anime';

      let studio = 'Desconocido';
      const firstStudioEl = $('a[href*="/studio/"]').first();
      if (firstStudioEl.length) {
        const studioText = firstStudioEl.text().trim();
        if (studioText) studio = studioText;
      } else {
        $('li').each((_: any, el: any) => {
          const liText = $(el).text().replace(/\s+/g, ' ').trim();
          if (/^Studios?:/i.test(liText)) {
            const v = liText.replace(/^Studios?:\s*/i, '').trim();
            if (v) {
              studio = v.split(',')[0].trim() || v;
              return false;
            }
            const anchorText = $(el).find('a').first().text().trim();
            if (anchorText) {
              studio = anchorText;
              return false;
            }
          }
        });
      }

      let type = 'TV';
      const tipoLi = $('li[rel="tipo"]').first();
      if (tipoLi.length) {
        const t = tipoLi.text().replace(/\s+/g, ' ').trim();
        const m = t.match(/Tipo:\s*(.+)/i);
        if (m && m[1].trim()) type = m[1].trim();
      } else {
        $('li').each((_: any, el: any) => {
          const liText = $(el).text().replace(/\s+/g, ' ').trim();
          if (/^Tipo:/i.test(liText)) {
            const v = liText.replace(/^Tipo:\s*/i, '').trim();
            if (v) {
              type = v;
              return false;
            }
          }
        });
      }

      let temporadaValue = '';
      let emitidoText = '';
      const seasonRows = $('.anime_data.pc li').length > 0 ? $('.anime_data.pc li') : $('.anime_data li');
      seasonRows.each((_: any, el: any) => {
        const liText = $(el).text().replace(/\s+/g, ' ').trim();
        if (!temporadaValue && /^Temporada:/i.test(liText)) {
          temporadaValue = liText.replace(/^Temporada:\s*/i, '').trim();
        }
        if (!emitidoText && /^Emitido:/i.test(liText)) {
          emitidoText = liText.replace(/^Emitido:\s*/i, '').trim();
        }
        if (temporadaValue && emitidoText) return false;
      });
      const season = resolveJkSeasonFromTexts(temporadaValue, emitidoText, year);

      const relations: any[] = [];
      const relCol = $('.temporadas_tab .col.col-lg-6');
      if (relCol.length) {
        let currentType = 'Relacionado';
        relCol.contents().each((_: any, node: any) => {
          if (node.type === 'tag') {
            const $node = $(node);
            if (node.name === 'h5') {
              currentType = $node.text().trim();
            } else if (node.name === 'a') {
              const href = $node.attr('href') || '';
              const rTitle = $node.text().trim();
              const slugMatch = href.match(/jkanime\.net\/([a-z0-9-]+)\/?$/);
              if (slugMatch && slugMatch[1]) {
                const rSlug = slugMatch[1];
                relations.push({
                  id: rSlug,
                  slug: rSlug,
                  title: rTitle,
                  type: currentType,
                  poster: `https://cdn.jkdesa.com/assets/images/animes/image/${rSlug}.jpg`,
                });
              }
            }
          }
        });
      }

      return {
        id: slug,
        title,
        slug,
        description: synopsis,
        poster: img,
        banner: null,
        episodes,
        relations,
        genres,
        status,
        year,
        category,
        japaneseTitle: alternativeTitle || '',
        alternativeTitles: alternativeTitle ? [alternativeTitle] : [],
        season,
        episodeThumbnails,
        score: 0,
        votes: 0,
        availableLanguages: Array.from(availableLanguages),
        studio,
        type,
      };
    } catch (error) {
      this.logger.error(`jkanime details: ${error}`);
      return null;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getLinks(slug: string, episode: number, lang = 'SUB', signal?: AbortSignal): Promise<DownloadLink[]> {
    // DUB desactivado: solo SUB
    const requestedJkLang: number = 1;
    try {
      const { data } = await axios.get(`${this.BASE_URL}/${slug}/${episode}/`, this.requestConfig({ signal }));
      const match = data.match(/var servers\s*=\s*(\[[\s\S]*?\]);/);
      if (!match) return [];

      const serversJson = this.parseServersPayload(data, match[1], slug, episode);
      if (!serversJson) return [];
      const links: DownloadLink[] = [];
      const seen = new Set<string>();

      for (const s of serversJson) {
        try {
          if (!s || typeof s !== 'object') continue;
          const entry = s as Record<string, unknown>;
          if (Number(entry.lang) !== requestedJkLang) continue;
          const serverName = typeof entry.server === 'string' ? entry.server.trim() : '';
          if (!serverName) continue;

          const url = decodeBase64Text(entry.remote);
          if (!url || !isHttpUrl(url)) {
            this.logger.debug(`jkanime links ${slug}/${episode}: remoto descartado en ${serverName}.`);
            continue;
          }
          const lowServer = serverName.toLowerCase();
          const finalUrl = lowServer.includes('mega')
            ? normalizeMegaUrl(url)
            : lowServer.includes('mp4upload')
              ? normalizeMp4UploadUrl(url)
              : url.trim();
          if (!finalUrl) continue;
          const dedupeKey = `${serverName.toLowerCase()}|${finalUrl}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);

          links.push({
            server: serverName,
            url: finalUrl,
            lang: 'SUB', // DUB desactivado: solo SUB
          });
        } catch {
          continue;
        }
      }

      const priority = ['Mediafire', 'Mega', 'Mp4upload'];
      links.sort((a, b) => {
        const idxA = priority.indexOf(a.server);
        const idxB = priority.indexOf(b.server);
        const weightA = idxA === -1 ? 999 : idxA;
        const weightB = idxB === -1 ? 999 : idxB;
        return weightA - weightB;
      });

      return links;
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

  // Parsea `var servers = [...]`. Si el JSON completo no parsea, recupera
  // entrada por entrada para no perder los servidores válidos.
  private parseServersPayload(data: string, rawArray: string, slug: string, episode: number): unknown[] | null {
    try {
      const parsed: unknown = JSON.parse(rawArray);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      this.logger.debug(`jkanime links ${slug}/${episode}: array var servers ilegible, reintentando por entradas.`);
    }
    try {
      const inner = extractBalancedBlock(data, 'var servers =', '[', ']');
      if (inner === null) return null;
      const recovered: unknown[] = [];
      for (const entry of extractBalancedObjects(inner)) {
        try {
          recovered.push(JSON.parse(entry));
        } catch {
          this.logger.debug(`jkanime links ${slug}/${episode}: entrada de servidor corrupta descartada.`);
        }
      }
      return recovered;
    } catch (error) {
      this.logger.error(`jkanime links: ${error}`);
      return null;
    }
  }

  async getFiltersData(): Promise<CatalogFiltersData> {
    try {
      const { data } = await axios.get(`${this.BASE_URL}/directorio/`, this.requestConfig());
      const $ = cheerio.load(data);
      const filters: CatalogFiltersData = {
        genres: [],
        categories: [],
        years: [],
        statuses: [],
        orders: [],
        yearMode: 'single',
        letters: [],
        demographics: [],
        types: [],
        seasons: [],
        orderDirs: [],
      };

      // Cada select se identifica por `name`, luego por su <label> y solo en
      // último caso por posición histórica: reordenarlos no rompe el mapeo.
      const selects = $('select').toArray();
      const assigned = new Set<number>();
      const filled = new Set<string>();
      const claim = (idx: number, bucket: string): boolean => {
        if (assigned.has(idx) || filled.has(bucket)) return false;
        this.pushFilterOptions($, selects[idx], bucket, filters);
        assigned.add(idx);
        filled.add(bucket);
        return true;
      };

      selects.forEach((sel, idx) => {
        const name = String($(sel).attr('name') || '')
          .trim()
          .toLowerCase();
        const bucket = FILTER_BY_SELECT_NAME[name];
        if (bucket) claim(idx, bucket);
      });

      selects.forEach((sel, idx) => {
        if (assigned.has(idx)) return;
        const label = ($(sel).closest('.fil').find('label').first().text() || $(sel).prev('label').text())
          .trim()
          .toLowerCase();
        const bucket = FILTER_BY_LABEL[label];
        if (bucket) claim(idx, bucket);
      });

      selects.forEach((sel, idx) => {
        if (assigned.has(idx)) return;
        const bucket = LEGACY_FILTER_ORDER[idx];
        if (bucket) claim(idx, bucket);
      });

      return filters;
    } catch (error) {
      this.logger.error(`jkanime filters: ${error}`);
      return { genres: [], categories: [], years: [], statuses: [], orders: [] };
    }
  }

  private pushFilterOptions(
    $: cheerio.Root,
    select: cheerio.Element,
    bucket: string,
    filters: CatalogFiltersData,
  ): void {
    try {
      $(select)
        .find('option')
        .each((i: any, el: any) => {
          const valAttr = $(el).attr('value');
          const text = $(el).text().trim();
          switch (bucket) {
            case 'orders':
              if (text) filters.orders!.push({ id: valAttr ?? '', name: text });
              break;
            case 'genres':
              if (valAttr) filters.genres.push({ id: valAttr, name: text });
              break;
            case 'letters':
              if (valAttr === '') return;
              {
                const val = valAttr !== undefined && valAttr !== '' ? valAttr : text;
                if (val) filters.letters!.push({ id: val, name: text });
              }
              break;
            case 'demographics':
              if (!valAttr) return;
              filters.demographics!.push({ id: valAttr, name: text });
              break;
            case 'categories':
              if (valAttr) filters.categories.push({ id: valAttr, name: text });
              break;
            case 'types':
              if (!valAttr) return;
              filters.types!.push({ id: valAttr, name: text });
              break;
            case 'statuses':
              if (!valAttr) return;
              filters.statuses!.push({ id: valAttr, name: text });
              break;
            case 'years': {
              const val = valAttr || text;
              if (val && /^\d+$/.test(val)) filters.years.push(parseInt(val, 10));
              break;
            }
            case 'seasons':
              if (!valAttr) return;
              filters.seasons!.push({ id: valAttr, name: text });
              break;
            case 'orderDirs':
              if (text) filters.orderDirs!.push({ id: valAttr ?? '', name: text });
              break;
            default:
              break;
          }
        });
    } catch (error) {
      this.logger.warn(`jkanime filters: select ${bucket} ilegible, se omite. ${error}`);
    }
  }
}
