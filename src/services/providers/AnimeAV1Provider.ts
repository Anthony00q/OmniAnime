import axios from 'axios';
import * as cheerio from 'cheerio';
import * as http from 'http';
import * as https from 'https';
import {
  AnimeSearchResult,
  AnimeRelation,
  AnimeDetails,
  DownloadLink,
  HomeEpisode,
  CatalogFilters,
  CatalogFiltersData,
  AnimeLanguage,
} from '../../types/anime';
import { AnimeProvider } from './AnimeProvider';
import { normalizeMegaUrl, normalizeMp4UploadUrl } from '../../utils/serverUtils';
import {
  extractBalancedBlock,
  splitTopLevelItems,
  unescapeSvelteString,
  safeParseInt,
  matchAtTopLevel,
} from '../../utils/scrapeParse';

const BASE_URL = 'https://animeav1.com';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_HTML_BYTES = 5 * 1024 * 1024;
export { DownloadLink };

// Miniaturas por episodio: `screenshots/<id>/<n>.jpg` existe para todo
// número real (la ficha HTML solo incrusta los primeros; el resto se deriva).
// Un número inexistente devuelve página de error (no imagen) y el renderer
// cae al tile numérico vía `onError`: sin peticiones de prueba ni sets.
export function buildAv1EpisodeThumbUrl(mediaId: unknown, episode: unknown): string {
  const id = String(mediaId || '').trim();
  const num = typeof episode === 'number' ? episode : parseInt(String(episode || ''), 10);
  if (!/^\d+$/.test(id) || id === '0' || !Number.isInteger(num) || num <= 0 || num > 5000) return '';
  return `https://cdn.animeav1.com/screenshots/${id}/${num}.jpg`;
}

export class AnimeAV1Provider implements AnimeProvider {
  get id() {
    return 'animeav1';
  }
  get name() {
    return 'AnimeAV1';
  }

  private client = axios.create({
    headers: { 'User-Agent': USER_AGENT },
    timeout: 10000,
    maxRedirects: 3,
    maxContentLength: MAX_HTML_BYTES,
    maxBodyLength: MAX_HTML_BYTES,
    httpAgent: new http.Agent({ keepAlive: true, maxSockets: 32 }),
    httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 32 }),
  });
  private pendingSearchController: AbortController | null = null;

  private readonly REGEX = {
    LATEST_EPISODES: /latestEpisodes:\[(.*?)\],latestMedia/,
    RESULTS_TOTAL: /results:\[(.*?)\],total:\d+/,
    GENRE: /name:"([^"]+)",(?:type:\d+,)?slug:"([^"]+)"/g,
    CATEGORY: /name="([^"]+)";[a-zA-Z]+\.slug="([^"]+)"/g,
    YEARS: /years:\[(\d+),(\d+)\]/,
    CAT_DICT: /id=(\d+);[a-zA-Z]+\.name="([^"]+)"/g,
    MEDIA_ID: /media:\{id:(\d+)/,
    EP_NUMBER: /number:(\d+)/,
    SLUG: /slug:"([^"]+)"/,
    TITLE: /title:"((?:[^"\\]|\\.)*)"/,
    PUBLISHED_AT: /publishedAt:"([^"]+)"/,
    DETAILS_ID: /id:(\d+),categoryId/,
    DETAILS_EP_NUM: /number:(\d+)/g,
    DETAILS_RELATIONS: /relations:\[(.*?)\]/,
    REL_TYPE: /type:(\d+)/,
    GENRES_BLOCK: /genres:\[(.*?)\]/,
    GENRE_NAME: /name:"([^"]+)"/g,
    STATUS: /status:(\d+)/,
    START_DATE: /startDate:"(\d{4})-(\d{2})/,
    CATEGORY_NAME: /category:\{[^}]+name:"([^"]+)"/,
    JAPANESE_TITLE: /aka:\{[^}]*"ja(?:-jp)?":"([^"]+)"/,
    SCORE_VOTES: /score:([\d.]+),votes:(\d+)/,
    SERVER_URL: /\{server:"([^"]+)",url:"([^"]+)"\}/g,
    QUOTED_TITLE: /title:"((?:[^"\\]|\\.)*)"/,
    SYNOPSIS: /synopsis:"((?:[^"\\]|\\.)*?)"/,
  };

  private cache: {
    home: { data: HomeEpisode[]; timestamp: number } | null;
    filters: { data: CatalogFiltersData; timestamp: number } | null;
    catalog: Map<string, { data: AnimeSearchResult[]; timestamp: number }>;
  } = {
    home: null,
    filters: null,
    catalog: new Map(),
  };

  private readonly CACHE_TTL = {
    home: 2 * 60 * 1000, // 2m
    catalog: 5 * 60 * 1000, // 5m
    filters: 60 * 60 * 1000, // 1h
  };

  private relationTypes: { [key: number]: string } = {
    1: 'Precuela',
    2: 'Secuela',
    3: 'Ambientación Alternativa',
    4: 'Versión Alternativa',
    5: 'Historia Paralela',
    6: 'Resumen',
    7: 'Spin-off',
    8: 'Historia Principal',
    9: 'Misma Historia',
    10: 'Otro',
  };

  private cleanText(text: string): string {
    return unescapeSvelteString(text);
  }

  private humanizeSlug(slug: string): string {
    return String(slug || '')
      .replace(/[-_]+/g, ' ')
      .trim();
  }

  // Bloque `media:{...}` del payload SvelteKit sin depender de la clave que
  // venga después (`uses`, `episode`, ...). Prefiere el que parece ficha
  // (trae `categoryId` o `slug:`); si no, el primero válido.
  private extractMediaBlock(html: string): string | null {
    let cursor = 0;
    let fallback: string | null = null;
    for (;;) {
      const at = html.indexOf('media:{', cursor);
      if (at < 0) return fallback;
      const inner = extractBalancedBlock(html.slice(at), 'media:{', '{', '}');
      cursor = at + 1;
      if (!inner) continue;
      if (!fallback) fallback = inner;
      if (/categoryId:\d/.test(inner) || /slug:"/.test(inner)) return inner;
    }
  }

  private extractArrayInner(html: string, key: string): string | null {
    return extractBalancedBlock(html, `${key}:[`, '[', ']');
  }

  private parseResultBlock(block: string, catDict?: { [key: string]: string }): AnimeSearchResult | null {
    try {
      const idM = block.match(/id:"(\d+)"/);
      const titleM = block.match(/title:"((?:[^"\\]|\\.)+)"/);
      const slugM = block.match(this.REGEX.SLUG);
      if (!idM || !titleM || !slugM) return null;
      const catIdM = block.match(/categoryId:(\d+)/);
      const synM = block.match(this.REGEX.SYNOPSIS);
      return {
        id: idM[1],
        title: this.cleanText(titleM[1]),
        slug: slugM[1],
        poster: `https://cdn.animeav1.com/covers/${idM[1]}.jpg`,
        category: catIdM && catDict && catDict[catIdM[1]] ? catDict[catIdM[1]] : 'Anime',
        year: '',
        status: '',
        synopsis: synM ? this.cleanText(synM[1]) : 'Sin sinopsis disponible.',
      };
    } catch {
      return null;
    }
  }

  private parseResultsContent(content: string, catDict?: { [key: string]: string }): AnimeSearchResult[] {
    const results: AnimeSearchResult[] = [];
    for (const block of splitTopLevelItems(content)) {
      const item = this.parseResultBlock(block, catDict);
      if (item) results.push(item);
    }
    return results;
  }

  // `results:[...]` sin exigir que le siga `,total:N`.
  private extractResultsContent(html: string): string | null {
    const balanced = this.extractArrayInner(html, 'results');
    if (balanced !== null) return balanced;
    const legacy = html.match(this.REGEX.RESULTS_TOTAL);
    return legacy ? legacy[1] : null;
  }

  private parseCategoryDict(html: string): { [key: string]: string } {
    const catDict: { [key: string]: string } = {};
    try {
      const catDictRegex = new RegExp(this.REGEX.CAT_DICT.source, 'g');
      let cm;
      while ((cm = catDictRegex.exec(html)) !== null) {
        catDict[cm[1]] = cm[2];
      }
    } catch {
      // Diccionario parcial: los items usan 'Anime' como categoría.
    }
    return catDict;
  }

  private isEpisodeHeading(text: string): boolean {
    return /^episodio\s*\d+/i.test(text.trim());
  }

  private resolveDetailsTitle($: cheerio.Root, mediaTitle: string, slug: string): string {
    if (mediaTitle) return mediaTitle;
    const h1 =
      $('article h1').first().text().trim() || $('main h1').first().text().trim() || $('h1').first().text().trim();
    if (h1 && !this.isEpisodeHeading(h1)) return h1;
    // En página de episodio el h1 es "Episodio N": usa el enlace a la ficha.
    const backLink = $(`a[href="/media/${slug}"]`).first().text().trim();
    if (backLink && !this.isEpisodeHeading(backLink)) return backLink;
    return this.humanizeSlug(slug) || slug;
  }

  private resolveDetailsDescription($: cheerio.Root, mediaSynopsis: string): string {
    if (mediaSynopsis) return mediaSynopsis;
    return (
      $('.entry p').first().text().trim() ||
      $('article p').first().text().trim() ||
      $('p').first().text().trim() ||
      'Sin descripción.'
    );
  }

  private getTimeAgo(dateStr: string): string {
    if (!dateStr) return 'Reciente';
    try {
      let s = dateStr.replace(' ', 'T').replace(/\.(\d{3})\d+/, '.$1');
      if (s.endsWith('+00')) s = s.replace('+00', 'Z');

      let past = new Date(s);
      if (isNaN(past.getTime())) {
        const simple = dateStr.split('.')[0].replace(' ', 'T') + 'Z';
        past = new Date(simple);
      }
      if (isNaN(past.getTime())) return 'Reciente';

      const now = new Date();
      const diffMs = now.getTime() - past.getTime();

      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHrs = Math.floor(diffMin / 60);
      const diffDays = Math.floor(diffHrs / 24);

      if (diffSec < 60) return 'Hace un momento';
      if (diffMin < 60) return `Hace ${diffMin} min`;
      if (diffHrs < 24) return `Hace ${diffHrs} horas`;
      if (diffDays < 7) return `Hace ${diffDays} días`;

      return past.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return 'Reciente';
    }
  }

  async getHome(force = false, signal?: AbortSignal): Promise<HomeEpisode[]> {
    const now = Date.now();
    if (!force && this.cache.home && now - this.cache.home.timestamp < this.CACHE_TTL.home) {
      return this.cache.home.data;
    }

    try {
      const r = await this.client.get(BASE_URL, { signal });
      const html = r.data;
      const eps: HomeEpisode[] = [];
      const seen = new Set<string>();
      let content = this.extractArrayInner(html, 'latestEpisodes');
      if (content === null) {
        const legacy = html.match(this.REGEX.LATEST_EPISODES);
        content = legacy ? legacy[1] : null;
      }
      if (content !== null) {
        for (const block of splitTopLevelItems(content)) {
          try {
            const numM = block.match(this.REGEX.EP_NUMBER);
            const slugM = block.match(this.REGEX.SLUG);
            const titleM = block.match(this.REGEX.TITLE);
            const dateM = block.match(this.REGEX.PUBLISHED_AT);
            const mediaIdM = block.match(this.REGEX.MEDIA_ID);
            const finalId = mediaIdM ? mediaIdM[1] : '0';
            if (slugM && numM && titleM) {
              const slug = slugM[1];
              const epNum = numM[1];
              if (!seen.has(`${slug}-${epNum}`)) {
                eps.push({
                  title: this.cleanText(titleM[1]),
                  slug,
                  episode: epNum,
                  poster: `https://cdn.animeav1.com/covers/${finalId}.jpg`,
                  timeAgo: dateM ? this.getTimeAgo(dateM[1]) : 'Reciente',
                });
                seen.add(`${slug}-${epNum}`);
              }
            }
          } catch {
            continue;
          }
          if (eps.length >= 24) break;
        }
      }

      if (eps.length > 0) {
        this.cache.home = { data: eps, timestamp: now };
      }
      return eps;
    } catch (e) {
      console.error(e);
      return [];
    }
  }

  async getFiltersData(force = false): Promise<CatalogFiltersData> {
    const now = Date.now();
    if (!force && this.cache.filters && now - this.cache.filters.timestamp < this.CACHE_TTL.filters) {
      return this.cache.filters.data;
    }

    try {
      const r = await this.client.get(`${BASE_URL}/catalogo`);
      const html = r.data;
      const data: CatalogFiltersData = {
        categories: [],
        genres: [],
        years: [],
        statuses: [
          { id: 'emision', name: 'En Emisión' },
          { id: 'finalizado', name: 'Finalizado' },
          { id: 'proximamente', name: 'Próximamente' },
        ],
        orders: [
          { id: '', name: 'Predeterminado' },
          { id: 'score', name: 'Puntuación' },
          { id: 'popular', name: 'Populares' },
          { id: 'title', name: 'Titulo' },
          { id: 'latest_added', name: 'Últimos Agregados' },
          { id: 'latest_released', name: 'Últimos Estrenos' },
        ],
        yearMode: 'range',
        letters: [
          { id: '', name: 'Todas' },
          ...[
            '#',
            'A',
            'B',
            'C',
            'D',
            'E',
            'F',
            'G',
            'H',
            'I',
            'J',
            'K',
            'L',
            'M',
            'N',
            'O',
            'P',
            'Q',
            'R',
            'S',
            'T',
            'U',
            'V',
            'W',
            'X',
            'Y',
            'Z',
          ].map((l) => ({ id: l, name: l })),
        ],
      };

      const genreRegex = new RegExp(this.REGEX.GENRE.source, 'g');
      let m;
      while ((m = genreRegex.exec(html)) !== null) {
        if (!data.genres.find((g) => g.id === m![2])) {
          data.genres.push({ id: m[2], name: m[1] });
        }
      }
      data.genres.sort((a, b) => a.name.localeCompare(b.name));

      const catRegex = new RegExp(this.REGEX.CATEGORY.source, 'g');
      while ((m = catRegex.exec(html)) !== null) {
        if (!data.categories.find((c) => c.id === m![2])) {
          data.categories.push({ id: m[2], name: m[1] });
        }
      }

      const yearMatch = html.match(this.REGEX.YEARS);
      if (yearMatch) {
        data.years = [parseInt(yearMatch[1]), parseInt(yearMatch[2])];
      }

      if (data.categories.length > 0 || data.genres.length > 0) {
        this.cache.filters = { data, timestamp: now };
      }
      return data;
    } catch (e) {
      console.error(e);
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
      const params = new URLSearchParams();
      if (filters.page) params.append('page', filters.page.toString());
      if (filters.order) params.append('order', filters.order);
      if (filters.status) params.append('status', filters.status);
      if (filters.category) params.append('category', filters.category);
      if (filters.minYear) params.append('minYear', filters.minYear.toString());
      if (filters.maxYear) params.append('maxYear', filters.maxYear.toString());
      if (filters.search) params.append('search', filters.search);
      if (filters.letter) params.append('letter', filters.letter);
      if (filters.genre && filters.genre.length > 0) {
        filters.genre.forEach((g: string) => params.append('genre', g));
      }

      const url = `${BASE_URL}/catalogo?${params.toString()}`;
      const r = await this.client.get(url);
      const html = r.data;
      let results: AnimeSearchResult[] = [];

      const content = this.extractResultsContent(html);
      if (content !== null) {
        try {
          results = this.parseResultsContent(content, this.parseCategoryDict(html));
        } catch (e) {
          console.error('Error parsing Svelte JSON', e);
          results = [];
        }
      }

      if (results.length === 0) {
        results = this.parseCatalogFallback(html);
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
      console.error(e);
      return [];
    }
  }

  // Fallback HTML cuando el payload SvelteKit no trae resultados.
  // Acepta solo fichas (`/media/<slug>`), nunca episodios (`/media/<slug>/<n>`).
  private parseCatalogFallback(html: string): AnimeSearchResult[] {
    const results: AnimeSearchResult[] = [];
    try {
      const $ = cheerio.load(html);
      let cards = $('article[class*="group/item"]');
      if (!cards.length) cards = $('article');
      cards.each((_, el) => {
        try {
          const href = $(el).find('a[href^="/media/"]').attr('href') || '';
          const match = href.match(/^\/media\/([^/]+)\/?$/);
          if (!match) return;
          const slug = match[1];
          if (!slug) return;
          const title =
            $(el).find('h3').first().text().trim() ||
            $(el).find('img').first().attr('alt')?.trim() ||
            this.humanizeSlug(slug);
          const img = $(el).find('img').first().attr('src') || '';
          const idMatch = img.match(/(\d+)\.(jpg|webp)/);
          const id = idMatch ? idMatch[1] : '0';
          const category = $(el).find('.rounded.bg-line').first().text().trim();
          results.push({
            id,
            title: this.cleanText(title),
            slug,
            poster: `https://cdn.animeav1.com/covers/${id}.jpg`,
            category: category || 'Anime',
          });
        } catch {
          // Una tarjeta rota no tumba el resto.
        }
      });
    } catch (e) {
      console.error('Error parsing catalog fallback', e);
    }
    return results;
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
      const url = `${BASE_URL}/catalogo?search=${encodeURIComponent(query)}`;
      const r = await this.client.get(url, { signal: controller.signal as any });
      if (this.pendingSearchController === controller) this.pendingSearchController = null;
      const html = r.data;
      const content = this.extractResultsContent(html);
      if (content === null) return [];
      return this.parseResultsContent(content);
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.name === 'CanceledError' ||
          error.name === 'AbortError' ||
          (error as { code?: string }).code === 'ERR_CANCELED')
      ) {
        return [];
      }
      console.error(error);
      return [];
    } finally {
      if (this.pendingSearchController === controller) this.pendingSearchController = null;
    }
  }

  async getDetails(slug: string, signal?: AbortSignal): Promise<AnimeDetails | null> {
    try {
      const response = await this.client.get(`${BASE_URL}/media/${slug}`, { signal });
      const html: string = response.data;
      const $ = cheerio.load(html);
      // Ficha estructurada primero; si falta, se usan regex sobre todo el HTML.
      const mediaStr = this.extractMediaBlock(html);
      const scope = mediaStr || html;

      let mediaTitle = '';
      let mediaSynopsis = '';
      try {
        // Títulos/sinopsis propios del bloque (nivel 0): ignora los de
        // relaciones/episodios anidados aunque vengan antes.
        const titleM = mediaStr
          ? matchAtTopLevel(mediaStr, this.REGEX.QUOTED_TITLE)
          : scope.match(this.REGEX.QUOTED_TITLE);
        // En el bloque media el primer title de nivel 0 es el del anime; fuera
        // de él puede ser el de un episodio/relación, así que solo vale con media.
        if (mediaStr && titleM) mediaTitle = this.cleanText(titleM[1]);
        const synM = mediaStr ? matchAtTopLevel(mediaStr, this.REGEX.SYNOPSIS) : scope.match(this.REGEX.SYNOPSIS);
        if (synM) mediaSynopsis = this.cleanText(synM[1]);
      } catch {
        // Título/sinopsis caen al fallback HTML.
      }
      const title = this.resolveDetailsTitle($, mediaTitle, slug);
      const description = this.resolveDetailsDescription($, mediaSynopsis);
      const idM = scope.match(this.REGEX.DETAILS_ID) || html.match(this.REGEX.DETAILS_ID);
      const id = idM ? idM[1] : '0';
      const episodes: number[] = [];
      const episodeThumbnails: Record<number, string> = {};

      const epContent = this.extractArrayInner(html, 'episodes');
      if (epContent !== null) {
        for (const numToken of epContent.match(/number:(\d+)/g) || []) {
          const num = safeParseInt(numToken.split(':')[1]);
          if (num !== null && num > 0) episodes.push(num);
        }
      } else {
        const epBlockMatch = html.match(/episodes:\[(.*?)\]/);
        if (epBlockMatch) {
          const epMatches = epBlockMatch[1].match(this.REGEX.DETAILS_EP_NUM);
          if (epMatches) {
            epMatches.forEach((m: string) => {
              const num = parseInt(m.split(':')[1]);
              if (!isNaN(num)) episodes.push(num);
            });
          }
        }
      }
      for (const num of episodes) {
        const thumb = buildAv1EpisodeThumbUrl(id, num);
        if (thumb) episodeThumbnails[num] = thumb;
      }

      const relations: AnimeRelation[] = [];
      const relContent = this.extractArrayInner(html, 'relations');
      if (relContent !== null) {
        for (const block of splitTopLevelItems(relContent)) {
          try {
            const typeM = block.match(this.REGEX.REL_TYPE);
            const destInner = extractBalancedBlock(block, 'destination:{', '{', '}');
            if (!typeM || !destInner) continue;
            const rIdM = destInner.match(/id:(\d+)/);
            const rSlugM = destInner.match(/slug:"([^"]+)"/);
            const rTitleM = destInner.match(this.REGEX.QUOTED_TITLE);
            if (rIdM && rSlugM && rTitleM) {
              relations.push({
                id: rIdM[1],
                slug: rSlugM[1],
                title: this.cleanText(rTitleM[1]),
                type: this.relationTypes[parseInt(typeM[1])] || 'Relacionado',
                poster: `https://cdn.animeav1.com/covers/${rIdM[1]}.jpg`,
              });
            }
          } catch {
            continue;
          }
        }
      } else {
        const relMatch = html.match(this.REGEX.DETAILS_RELATIONS);
        if (relMatch) {
          const legacyBlocks = relMatch[1].split('},{');
          for (const block of legacyBlocks) {
            try {
              const typeM = block.match(this.REGEX.REL_TYPE);
              const destBlockMatch = block.match(/destination:\{(.*?)\}/);
              if (typeM && destBlockMatch) {
                const destBlock = destBlockMatch[1];
                const rIdM = destBlock.match(/id:(\d+)/);
                const rSlugM = destBlock.match(/slug:"([^"]+)"/);
                const rTitleM = destBlock.match(/title:"([^"]+)"/);
                if (rIdM && rSlugM && rTitleM) {
                  relations.push({
                    id: rIdM[1],
                    slug: rSlugM[1],
                    title: this.cleanText(rTitleM[1]),
                    type: this.relationTypes[parseInt(typeM[1])] || 'Relacionado',
                    poster: `https://cdn.animeav1.com/covers/${rIdM[1]}.jpg`,
                  });
                }
              }
            } catch {
              continue;
            }
          }
        }
      }

      const genres: string[] = [];
      let statusStr = 'Desconocido';
      let yearStr = '';
      let categoryStr = 'Anime';
      let japaneseTitleStr = '';
      let seasonStr = '';
      let scoreNum = 0;
      let votesNum = 0;

      // Cada campo se intenta por separado: uno roto no tumba los demás.
      try {
        const genresInner = mediaStr ? extractBalancedBlock(mediaStr, 'genres:[', '[', ']') : null;
        const genresSrc = genresInner !== null ? genresInner : scope.match(this.REGEX.GENRES_BLOCK)?.[1];
        if (genresSrc) {
          const genreNameRegex = new RegExp(this.REGEX.GENRE_NAME.source, 'g');
          let gm;
          while ((gm = genreNameRegex.exec(genresSrc)) !== null) {
            genres.push(gm[1]);
          }
        }
      } catch {
        // Sin géneros.
      }
      try {
        const sMatch = scope.match(this.REGEX.STATUS);
        if (sMatch) {
          const statusMap: Record<string, string> = {
            '0': 'Finalizado',
            '1': 'Próximamente',
            '2': 'En emisión',
          };
          statusStr = statusMap[sMatch[1]] || 'Desconocido';
        }
      } catch {
        // Estado por defecto.
      }
      try {
        const dateMatch = scope.match(this.REGEX.START_DATE);
        if (dateMatch) {
          yearStr = dateMatch[1];
          const month = parseInt(dateMatch[2]);
          if (month >= 1 && month <= 3) seasonStr = 'Temporada Invierno';
          else if (month >= 4 && month <= 6) seasonStr = 'Temporada Primavera';
          else if (month >= 7 && month <= 9) seasonStr = 'Temporada Verano';
          else if (month >= 10 && month <= 12) seasonStr = 'Temporada Otoño';
        }
      } catch {
        // Sin año/temporada.
      }
      try {
        const catMatch = scope.match(this.REGEX.CATEGORY_NAME);
        if (catMatch) categoryStr = catMatch[1];
      } catch {
        // Categoría por defecto.
      }
      try {
        const akaMatch = scope.match(this.REGEX.JAPANESE_TITLE);
        if (akaMatch) japaneseTitleStr = akaMatch[1];
      } catch {
        // Sin título japonés.
      }
      try {
        const scoreMatch = scope.match(this.REGEX.SCORE_VOTES);
        if (scoreMatch) {
          scoreNum = parseFloat(scoreMatch[1]);
          votesNum = parseInt(scoreMatch[2]);
        }
      } catch {
        // Puntuación por defecto.
      }

      // DUB desactivado: solo SUB — sin fetch al primer episodio
      const availableLanguages: AnimeLanguage[] = ['SUB'];

      return {
        id,
        title,
        slug,
        description,
        poster: `https://cdn.animeav1.com/covers/${id}.jpg`,
        banner: null,
        episodes: [...new Set(episodes)].sort((a, b) => a - b),
        relations,
        genres,
        status: statusStr,
        year: yearStr,
        category: categoryStr,
        japaneseTitle: japaneseTitleStr,
        alternativeTitles: japaneseTitleStr ? [japaneseTitleStr] : [],
        season: seasonStr,
        score: scoreNum,
        votes: votesNum,
        episodeThumbnails,
        availableLanguages,
        studio: 'Desconocido',
        type: categoryStr || 'TV',
      };
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  async getLinks(slug: string, ep: number, lang: 'SUB' | 'DUB' = 'SUB', signal?: AbortSignal): Promise<DownloadLink[]> {
    // DUB desactivado: solo SUB
    if (lang === 'DUB') lang = 'SUB';
    const BAD_SERVERS = [
      'drive',
      'gdrive',
      'google drive',
      'zippyshare',
      'openload',
      'uptobox',
      'vidcloud',
      'yourupload',
    ];
    try {
      const r = await this.client.get(`${BASE_URL}/media/${slug}/${ep}`, { signal });
      const html = r.data;
      const links: DownloadLink[] = [];
      const seen = new Set<string>();

      // Secciones `embeds:{...}` y `downloads:{...}` por balanceo: el orden
      // de SUB/DUB dentro no importa.
      for (const section of ['embeds', 'downloads']) {
        const sectionInner = extractBalancedBlock(html, `${section}:{`, '{', '}');
        if (sectionInner === null) continue;
        const subContent = extractBalancedBlock(sectionInner, `${lang}:[`, '[', ']');
        if (subContent === null || !subContent) continue;

        const serverUrlRegex = new RegExp(this.REGEX.SERVER_URL.source, 'g');
        let sm: RegExpExecArray | null;
        while ((sm = serverUrlRegex.exec(subContent)) !== null) {
          try {
            const serverName = sm[1].trim();
            let url = String(sm[2] || '').trim();
            if (BAD_SERVERS.includes(serverName.toLowerCase()) || !url) continue;
            const low = serverName.toLowerCase();
            if (low.includes('mega')) {
              url = normalizeMegaUrl(url);
            } else if (low.includes('mp4upload')) {
              url = normalizeMp4UploadUrl(url);
            }
            const dedupeKey = `${serverName.toLowerCase()}|${url}`;
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);
            links.push({ server: serverName, url, lang });
          } catch {
            continue;
          }
        }
      }
      return links;
    } catch (error) {
      console.error(error);
      return [];
    }
  }
}
