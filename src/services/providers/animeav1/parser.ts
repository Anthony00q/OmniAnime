import * as cheerio from 'cheerio';
import { AnimeSearchResult, ScheduleData, ScheduleEntry } from '../../../types/anime';
import {
  extractBalancedBlock,
  extractBalancedObjects,
  splitTopLevelItems,
  unescapeSvelteString,
  safeParseInt,
  matchAtTopLevel,
} from '../../../utils/scrapeParse';
import type { ScopedLogger } from '../../logging/AppLogger';
import { av1CoverUrl } from './client';

const REGEX = {
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
  SCORE_VOTES: /score:([\d.]+),votes:(\d+)/,
  SERVER_URL: /\{server:"([^"]+)",url:"([^"]+)"\}/g,
  QUOTED_TITLE: /title:"((?:[^"\\]|\\.)*)"/,
  SYNOPSIS: /synopsis:"((?:[^"\\]|\\.)*?)"/,
};

// Timestamp del payload ("2026-09-16T17:15:57.781642+00:00") a Date en hora local.
export function parseAv1Timestamp(raw: string): Date | null {
  const text = String(raw || '').trim();
  if (!text) return null;
  let s = text.replace(' ', 'T').replace(/\.(\d{3})\d+/, '.$1');
  if (s.endsWith('+00')) s = s.replace('+00', 'Z');
  let parsed = new Date(s);
  if (isNaN(parsed.getTime())) {
    parsed = new Date(text.split('.')[0].replace(' ', 'T') + 'Z');
  }
  return isNaN(parsed.getTime()) ? null : parsed;
}

// Día ISO de la semana (1=Lunes … 7=Domingo) en hora local.
function av1IsoWeekday(date: Date): number {
  return ((date.getDay() + 6) % 7) + 1;
}

// MAL ID de la media actual, anclado a su slug: los géneros también traen
// `malId` y un match global los confundiría. Solo fondo para matching.
export function extractMediaMalId(scope: string, slug: string): number | null {
  try {
    const pageSlug = String(slug || '').trim();
    if (!pageSlug) return null;
    const escaped = pageSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const found = new Set(
      Array.from(String(scope || '').matchAll(new RegExp(`slug:"${escaped}",malId:(\\d+)`, 'g'))).map((m) => m[1]),
    );
    if (found.size !== 1) return null;
    const id = Number([...found][0]);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

// aka:{...} trae un título por idioma ("en-us", "ja-jp", ...). Solo fondo
// para matching: la UI sigue mostrando `title` y `japaneseTitle` como antes.
export function extractAkaTitles(scope: string): { en: string; ja: string } {
  const src = String(scope || '');
  const pick = (pattern: RegExp): string => {
    try {
      const match = src.match(pattern);
      return match && match[1] ? String(match[1]).trim() : '';
    } catch {
      return '';
    }
  };
  return {
    en: pick(/aka:\{[^}]*"en(?:-us)?":"([^"]+)"/),
    ja: pick(/aka:\{[^}]*"ja(?:-jp)?":"([^"]+)"/),
  };
}

// Horario semanal (/horario): día y hora salen del último episodio publicado,
// misma heurística que la propia web (los horarios son referenciales).
export function parseAv1Schedule(html: string): ScheduleData {
  const entries: ScheduleEntry[] = [];
  const content = extractBalancedBlock(html, 'media:[', '[', ']');
  if (content === null) return { entries };
  for (const object of extractBalancedObjects(content)) {
    try {
      const inner = object.slice(1, -1);
      const epInner = extractBalancedBlock(inner, 'latestEpisode:{', '{', '}');
      if (epInner === null) continue;
      const numM = epInner.match(/number:(\d+)/);
      const dateM = epInner.match(/createdAt:"([^"]+)"/);
      const published = dateM ? parseAv1Timestamp(dateM[1]) : null;
      const slugM = inner.match(/slug:"([^"]+)"/);
      const titleM = inner.match(/title:"((?:[^"\\]|\\.)*)"/);
      const idM = matchAtTopLevel(inner, /id:(\d+)/);
      if (!numM || published === null || !slugM || !titleM || !idM) continue;
      entries.push({
        slug: slugM[1],
        title: unescapeSvelteString(titleM[1]),
        poster: av1CoverUrl(idM[1]),
        day: av1IsoWeekday(published),
        time: `${String(published.getHours()).padStart(2, '0')}:${String(published.getMinutes()).padStart(2, '0')}`,
        episode: null,
        updatedAt: published.toISOString(),
        note: null,
        finished: false,
      });
    } catch {
      continue;
    }
  }
  return { entries };
}

function extractArrayInner(html: string, key: string): string | null {
  return extractBalancedBlock(html, `${key}:[`, '[', ']');
}

// Bloque `media:{...}` del payload SvelteKit sin depender de la clave que
// venga después (`uses`, `episode`, ...). Prefiere el que parece ficha
// (trae `categoryId` o `slug:`); si no, el primero válido.
function extractMediaBlock(html: string): string | null {
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

function humanizeSlug(slug: string): string {
  return String(slug || '')
    .replace(/[-_]+/g, ' ')
    .trim();
}

function isEpisodeHeading(text: string): boolean {
  return /^episodio\s*\d+/i.test(text.trim());
}

function resolveDetailsTitle($: cheerio.Root, mediaTitle: string, slug: string): string {
  if (mediaTitle) return mediaTitle;
  const h1 =
    $('article h1').first().text().trim() || $('main h1').first().text().trim() || $('h1').first().text().trim();
  if (h1 && !isEpisodeHeading(h1)) return h1;
  // En página de episodio el h1 es "Episodio N": usa el enlace a la ficha.
  const backLink = $(`a[href="/media/${slug}"]`).first().text().trim();
  if (backLink && !isEpisodeHeading(backLink)) return backLink;
  return humanizeSlug(slug) || slug;
}

function resolveDetailsDescription($: cheerio.Root, mediaSynopsis: string): string {
  if (mediaSynopsis) return mediaSynopsis;
  return (
    $('.entry p').first().text().trim() ||
    $('article p').first().text().trim() ||
    $('p').first().text().trim() ||
    'Sin descripción.'
  );
}

export interface Av1HomeRaw {
  title: string;
  slug: string;
  episode: string;
  mediaId: string;
  publishedAt: string | null;
}

export function parseAv1HomeRaw(html: string): Av1HomeRaw[] {
  let content = extractArrayInner(html, 'latestEpisodes');
  if (content === null) {
    const legacy = html.match(REGEX.LATEST_EPISODES);
    content = legacy ? legacy[1] : null;
  }
  const out: Av1HomeRaw[] = [];
  if (content === null) return out;
  for (const block of splitTopLevelItems(content)) {
    try {
      const numM = block.match(REGEX.EP_NUMBER);
      const slugM = block.match(REGEX.SLUG);
      const titleM = block.match(REGEX.TITLE);
      const dateM = block.match(REGEX.PUBLISHED_AT);
      const mediaIdM = block.match(REGEX.MEDIA_ID);
      if (!slugM || !numM || !titleM) continue;
      out.push({
        title: titleM[1],
        slug: slugM[1],
        episode: numM[1],
        mediaId: mediaIdM ? mediaIdM[1] : '0',
        publishedAt: dateM ? dateM[1] : null,
      });
    } catch {
      continue;
    }
  }
  return out;
}

// `results:[...]` sin exigir que le siga `,total:N`.
export function extractResultsContent(html: string): string | null {
  const balanced = extractArrayInner(html, 'results');
  if (balanced !== null) return balanced;
  const legacy = html.match(REGEX.RESULTS_TOTAL);
  return legacy ? legacy[1] : null;
}

export function parseCategoryDict(html: string): { [key: string]: string } {
  const catDict: { [key: string]: string } = {};
  try {
    const catDictRegex = new RegExp(REGEX.CAT_DICT.source, 'g');
    let cm;
    while ((cm = catDictRegex.exec(html)) !== null) {
      catDict[cm[1]] = cm[2];
    }
  } catch {
    // Diccionario parcial: los items usan 'Anime' como categoría.
  }
  return catDict;
}

export interface Av1ResultRaw {
  id: string;
  title: string;
  slug: string;
  categoryId: string | null;
  synopsis: string | null;
}

export function parseAv1ResultBlocks(content: string): Av1ResultRaw[] {
  const out: Av1ResultRaw[] = [];
  for (const block of splitTopLevelItems(content)) {
    try {
      const idM = block.match(/id:"(\d+)"/);
      const titleM = block.match(/title:"((?:[^"\\]|\\.)+)"/);
      const slugM = block.match(REGEX.SLUG);
      if (!idM || !titleM || !slugM) continue;
      const catIdM = block.match(/categoryId:(\d+)/);
      const synM = block.match(REGEX.SYNOPSIS);
      out.push({
        id: idM[1],
        title: titleM[1],
        slug: slugM[1],
        categoryId: catIdM ? catIdM[1] : null,
        synopsis: synM ? synM[1] : null,
      });
    } catch {
      continue;
    }
  }
  return out;
}

// Fallback HTML cuando el payload SvelteKit no trae resultados.
// Acepta solo fichas (`/media/<slug>`), nunca episodios (`/media/<slug>/<n>`).
export function parseCatalogFallback(html: string, logger: ScopedLogger): AnimeSearchResult[] {
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
          $(el).find('h3').first().text().trim() || $(el).find('img').first().attr('alt')?.trim() || humanizeSlug(slug);
        const img = $(el).find('img').first().attr('src') || '';
        const idMatch = img.match(/(\d+)\.(jpg|webp)/);
        const id = idMatch ? idMatch[1] : '0';
        const category = $(el).find('.rounded.bg-line').first().text().trim();
        results.push({
          id,
          title: unescapeSvelteString(title),
          slug,
          poster: av1CoverUrl(id),
          category: category || 'Anime',
        });
      } catch {
        // Una tarjeta rota no tumba el resto.
      }
    });
  } catch (e) {
    logger.error('animeav1 parse catalog: ' + String(e));
  }
  return results;
}

export interface Av1DetailsRaw {
  id: string;
  title: string;
  description: string;
  episodes: number[];
  relations: Array<{ type: number; id: string; slug: string; title: string }>;
  genres: string[];
  status: string | null;
  startDate: { year: string; month: number } | null;
  category: string | null;
  aka: { en: string; ja: string };
  malId: number | null;
  score: number;
  votes: number;
}

export function parseAv1Details(html: string, slug: string): Av1DetailsRaw {
  const $ = cheerio.load(html);
  // Ficha estructurada primero; si falta, se usan regex sobre todo el HTML.
  const mediaStr = extractMediaBlock(html);
  const scope = mediaStr || html;

  let mediaTitle = '';
  let mediaSynopsis = '';
  try {
    // Títulos/sinopsis propios del bloque (nivel 0): ignora los de
    // relaciones/episodios anidados aunque vengan antes.
    const titleM = mediaStr ? matchAtTopLevel(mediaStr, REGEX.QUOTED_TITLE) : scope.match(REGEX.QUOTED_TITLE);
    // En el bloque media el primer title de nivel 0 es el del anime; fuera
    // de él puede ser el de un episodio/relación, así que solo vale con media.
    if (mediaStr && titleM) mediaTitle = unescapeSvelteString(titleM[1]);
    const synM = mediaStr ? matchAtTopLevel(mediaStr, REGEX.SYNOPSIS) : scope.match(REGEX.SYNOPSIS);
    if (synM) mediaSynopsis = unescapeSvelteString(synM[1]);
  } catch {
    // Título/sinopsis caen al fallback HTML.
  }

  const idM = scope.match(REGEX.DETAILS_ID) || html.match(REGEX.DETAILS_ID);
  const id = idM ? idM[1] : '0';

  const episodes: number[] = [];
  const epContent = extractArrayInner(html, 'episodes');
  if (epContent !== null) {
    for (const numToken of epContent.match(/number:(\d+)/g) || []) {
      const num = safeParseInt(numToken.split(':')[1]);
      if (num !== null && num > 0) episodes.push(num);
    }
  } else {
    const epBlockMatch = html.match(/episodes:\[(.*?)\]/);
    if (epBlockMatch) {
      const epMatches = epBlockMatch[1].match(REGEX.DETAILS_EP_NUM);
      if (epMatches) {
        epMatches.forEach((m: string) => {
          const num = parseInt(m.split(':')[1]);
          if (!isNaN(num)) episodes.push(num);
        });
      }
    }
  }

  const relations: Av1DetailsRaw['relations'] = [];
  const relContent = extractArrayInner(html, 'relations');
  if (relContent !== null) {
    for (const block of splitTopLevelItems(relContent)) {
      try {
        const typeM = block.match(REGEX.REL_TYPE);
        const destInner = extractBalancedBlock(block, 'destination:{', '{', '}');
        if (!typeM || !destInner) continue;
        const rIdM = destInner.match(/id:(\d+)/);
        const rSlugM = destInner.match(/slug:"([^"]+)"/);
        const rTitleM = destInner.match(REGEX.QUOTED_TITLE);
        if (rIdM && rSlugM && rTitleM) {
          relations.push({
            type: parseInt(typeM[1]),
            id: rIdM[1],
            slug: rSlugM[1],
            title: unescapeSvelteString(rTitleM[1]),
          });
        }
      } catch {
        continue;
      }
    }
  } else {
    const relMatch = html.match(REGEX.DETAILS_RELATIONS);
    if (relMatch) {
      const legacyBlocks = relMatch[1].split('},{');
      for (const block of legacyBlocks) {
        try {
          const typeM = block.match(REGEX.REL_TYPE);
          const destBlockMatch = block.match(/destination:\{(.*?)\}/);
          if (typeM && destBlockMatch) {
            const destBlock = destBlockMatch[1];
            const rIdM = destBlock.match(/id:(\d+)/);
            const rSlugM = destBlock.match(/slug:"([^"]+)"/);
            const rTitleM = destBlock.match(/title:"([^"]+)"/);
            if (rIdM && rSlugM && rTitleM) {
              relations.push({
                type: parseInt(typeM[1]),
                id: rIdM[1],
                slug: rSlugM[1],
                title: unescapeSvelteString(rTitleM[1]),
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
  // Cada campo se intenta por separado: uno roto no tumba los demás.
  try {
    const genresInner = mediaStr ? extractBalancedBlock(mediaStr, 'genres:[', '[', ']') : null;
    const genresSrc = genresInner !== null ? genresInner : scope.match(REGEX.GENRES_BLOCK)?.[1];
    if (genresSrc) {
      const genreNameRegex = new RegExp(REGEX.GENRE_NAME.source, 'g');
      let gm;
      while ((gm = genreNameRegex.exec(genresSrc)) !== null) {
        genres.push(gm[1]);
      }
    }
  } catch {
    // Sin géneros.
  }

  let status: string | null = null;
  try {
    const sMatch = scope.match(REGEX.STATUS);
    if (sMatch) status = sMatch[1];
  } catch {
    // Estado por defecto.
  }

  let startDate: Av1DetailsRaw['startDate'] = null;
  try {
    const dateMatch = scope.match(REGEX.START_DATE);
    if (dateMatch) startDate = { year: dateMatch[1], month: parseInt(dateMatch[2]) };
  } catch {
    // Sin año/temporada.
  }

  let category: string | null = null;
  try {
    const catMatch = scope.match(REGEX.CATEGORY_NAME);
    if (catMatch) category = catMatch[1];
  } catch {
    // Categoría por defecto.
  }

  let aka = { en: '', ja: '' };
  try {
    aka = extractAkaTitles(scope);
  } catch {
    // Sin títulos alternativos.
  }

  let malId: number | null = null;
  try {
    malId = extractMediaMalId(scope, slug);
  } catch {
    // Sin MAL ID.
  }

  let score = 0;
  let votes = 0;
  try {
    const scoreMatch = scope.match(REGEX.SCORE_VOTES);
    if (scoreMatch) {
      score = parseFloat(scoreMatch[1]);
      votes = parseInt(scoreMatch[2]);
    }
  } catch {
    // Puntuación por defecto.
  }

  return {
    id,
    title: resolveDetailsTitle($, mediaTitle, slug),
    description: resolveDetailsDescription($, mediaSynopsis),
    episodes,
    relations,
    genres,
    status,
    startDate,
    category,
    aka,
    malId,
    score,
    votes,
  };
}

export interface Av1LinkRaw {
  server: string;
  url: string;
}

export function parseAv1LinkEntries(html: string, lang: string): Av1LinkRaw[] {
  const out: Av1LinkRaw[] = [];
  // Secciones `embeds:{...}` y `downloads:{...}` por balanceo: el orden
  // de SUB/DUB dentro no importa.
  for (const section of ['embeds', 'downloads']) {
    const sectionInner = extractBalancedBlock(html, `${section}:{`, '{', '}');
    if (sectionInner === null) continue;
    const subContent = extractBalancedBlock(sectionInner, `${lang}:[`, '[', ']');
    if (subContent === null || !subContent) continue;

    const serverUrlRegex = new RegExp(REGEX.SERVER_URL.source, 'g');
    let sm: RegExpExecArray | null;
    while ((sm = serverUrlRegex.exec(subContent)) !== null) {
      out.push({ server: sm[1].trim(), url: String(sm[2] || '').trim() });
    }
  }
  return out;
}

export interface Av1FiltersRaw {
  genres: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
  years: [number, number] | null;
}

export function parseAv1Filters(html: string): Av1FiltersRaw {
  const genres: Av1FiltersRaw['genres'] = [];
  const genreRegex = new RegExp(REGEX.GENRE.source, 'g');
  let m;
  while ((m = genreRegex.exec(html)) !== null) {
    if (!genres.find((g) => g.id === m![2])) {
      genres.push({ id: m[2], name: m[1] });
    }
  }

  const categories: Av1FiltersRaw['categories'] = [];
  const catRegex = new RegExp(REGEX.CATEGORY.source, 'g');
  while ((m = catRegex.exec(html)) !== null) {
    if (!categories.find((c) => c.id === m![2])) {
      categories.push({ id: m[2], name: m[1] });
    }
  }

  const yearMatch = html.match(REGEX.YEARS);
  const years: Av1FiltersRaw['years'] = yearMatch ? [parseInt(yearMatch[1]), parseInt(yearMatch[2])] : null;
  return { genres, categories, years };
}
