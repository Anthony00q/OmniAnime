import * as cheerio from 'cheerio';
import { HomeEpisode, HomeEpisodeKind, ScheduleData, ScheduleEntry } from '../../../types/anime';
import { extractBalancedBlock, extractBalancedObjects } from '../../../utils/scrapeParse';
import type { ScopedLogger } from '../../logging/AppLogger';
import { JK_BASE_URL, jkImageUrl } from './client';

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

// Secciones "Programacion" de la portada por id → kind; el orden es fijo, no el del documento.
const JK_HOME_SECTIONS: Array<{ id: string; kind: HomeEpisodeKind }> = [
  { id: 'animes', kind: 'anime' },
  { id: 'donghuas', kind: 'donghua' },
  { id: 'ovas', kind: 'ova' },
];

// Días del horario en orden de documento; los acentos se normalizan al comparar.
const JK_WEEKDAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

function jkDayNumber(name: unknown): number | null {
  const norm = String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  const idx = JK_WEEKDAYS.indexOf(norm);
  return idx >= 0 ? idx + 1 : null;
}

// Tarjeta de la portada: el episodio sale de la URL aunque el badge diga ONA/OVA.
function readJkHomeCard($: ReturnType<typeof cheerio.load>, el: any): Omit<HomeEpisode, 'kind'> | null {
  const url = $(el).find('a').first().attr('href') || '';
  if (!url) return null;
  const parts = url.split('/').filter(Boolean);
  const episode = parts.pop() || '1';
  const slug = parts.pop() || '';
  const img = $(el).find('img').first();
  const poster = jkImageUrl(img.attr('data-animepic') || img.attr('src') || '');
  const title = $(el).find('.card-title').text().trim() || slug.replace(/-/g, ' ');
  const timeAgo = $(el).find('.badge-secondary').text().trim() || 'Reciente';
  return { title, slug, episode, poster, timeAgo };
}

// Paneles de la portada con su seccion. Sin paneles reconocibles, todo cuenta como anime.
export function collectJkHomeEpisodes($: ReturnType<typeof cheerio.load>): HomeEpisode[] {
  const out: HomeEpisode[] = [];
  const cardSelector = '.mb-4.d-flex.align-items-stretch .card';
  const panels = JK_HOME_SECTIONS.map((section) => ({ kind: section.kind, el: $(`#${section.id}`).first() })).filter(
    (panel) => panel.el.length > 0,
  );
  for (const panel of panels) {
    panel.el.find(cardSelector).each((_: any, el: any) => {
      const card = readJkHomeCard($, el);
      if (card) out.push({ ...card, kind: panel.kind });
    });
  }
  // Fuera de los paneles (o sin paneles): cuentan como anime.
  $(cardSelector).each((_: any, el: any) => {
    if ($(el).closest('#animes, #donghuas, #ovas').length > 0) return;
    const card = readJkHomeCard($, el);
    if (card) out.push({ ...card, kind: 'anime' });
  });
  return out;
}

// Horario semanal (/horario): día y frescura del último capítulo; la fuente no publica hora.
export function collectJkSchedule($: ReturnType<typeof cheerio.load>): ScheduleData {
  const entries: ScheduleEntry[] = [];

  $('.box.semana').each((dayIdx: number, el: any) => {
    const day = jkDayNumber($(el).find('h2').first().text()) ?? dayIdx + 1;
    $(el)
      .find('.cajas .box.img')
      .each((_: number, card: any) => {
        const $card = $(card);
        const href = String($card.find('a').first().attr('href') || '');
        const slug = href.split('?')[0].split('/').filter(Boolean).pop() || '';
        if (!/^[a-z0-9-]+$/i.test(slug)) return;
        const title =
          String(
            $card.attr('title') || $card.find('img').attr('title') || $card.find('h3').first().text() || '',
          ).trim() || slug.replace(/-/g, ' ');
        const poster = jkImageUrl(String($card.find('img').first().attr('src') || ''));
        const epMatch = $card.find('.last span').first().text().match(/(\d+)/);
        const note = $card.find('.last time').first().text().replace(/\s+/g, ' ').trim() || null;
        const finished =
          $card.find('strong.finished_anime').length > 0 || $card.find('.dropmenu').attr('data-status') === 'finished';
        entries.push({
          slug,
          title,
          poster,
          day,
          time: null,
          episode: epMatch ? Number(epMatch[1]) : null,
          updatedAt: null,
          note,
          finished,
        });
      });
  });

  return { entries };
}

// Bloque "Titulos Alternativos": Sinonimos / Ingles / Japones. Solo fondo
// para matching: la UI sigue mostrando `title` como antes.
export function extractJkAlternativeTitles($: ReturnType<typeof cheerio.load>): {
  synonyms: string;
  english: string;
  japanese: string;
} {
  const out = { synonyms: '', english: '', japanese: '' };
  try {
    const container = $('.alternativost #c').first();
    if (!container.length) return out;
    let current: keyof typeof out | null = null;
    container.contents().each((_: any, node: any) => {
      if (node.type === 'tag' && node.name === 'b') {
        const label = $(node)
          .text()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        if (label.includes('sinonimo')) current = 'synonyms';
        else if (label.includes('ingles')) current = 'english';
        else if (label.includes('japones')) current = 'japanese';
        else current = null;
      } else if (node.type === 'text' && current) {
        const text = $(node).text().replace(/\s+/g, ' ').trim();
        if (text) out[current] = out[current] ? `${out[current]} ${text}` : text;
      }
    });
  } catch {}
  return out;
}

// MAL ID del anime: `.anisabi_player[data-id]` (`data-anime` es el ID
// interno de JKAnime, no un MAL ID). Solo fondo para matching.
export function extractJkMalId($: ReturnType<typeof cheerio.load>): number | null {
  try {
    const raw = String($('.anisabi_player').first().attr('data-id') || '').trim();
    if (!/^\d+$/.test(raw)) return null;
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export interface JkSearchRaw {
  slug: string;
  title: string;
  poster: string;
}

export function parseJkSearchResults($: ReturnType<typeof cheerio.load>): JkSearchRaw[] {
  const out: JkSearchRaw[] = [];
  $('.anime__item').each((i: any, el: any) => {
    const a = $(el).find('a').first();
    const url = a.attr('href');
    if (!url) return;

    const slug = url.replace(JK_BASE_URL, '').split('/').filter(Boolean)[0] || '';
    const title = $(el).find('h5 a').text().trim() || slug;
    const img = jkImageUrl($(el).find('.anime__item__pic').attr('data-setbg') || '');

    if (title && slug) out.push({ slug, title, poster: img });
  });
  return out;
}

export interface JkCatalogEntries {
  entries: unknown[];
  // true cuando el JSON completo no parseó y las entradas se recuperaron una a una.
  recovered: boolean;
}

export function extractJkAnimesEntries(data: string, logger: ScopedLogger): JkCatalogEntries {
  const match = data.match(/var animes = (\{.*?\});/);
  if (!match) return { entries: [], recovered: false };
  try {
    const parsed: unknown = JSON.parse(match[1]);
    const rows = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>).data : undefined;
    return { entries: Array.isArray(rows) ? rows : [], recovered: false };
  } catch {
    logger.warn('jkanime catalog: payload var animes ilegible, reintentando por entradas.');
  }
  try {
    const inner = extractBalancedBlock(data, '"data":', '[', ']');
    if (inner === null) return { entries: [], recovered: true };
    const recovered: unknown[] = [];
    for (const entry of extractBalancedObjects(inner)) {
      try {
        recovered.push(JSON.parse(entry));
      } catch {
        logger.warn('jkanime catalog: entrada de anime corrupta descartada.');
      }
    }
    return { entries: recovered, recovered: true };
  } catch (error) {
    logger.error(`jkanime catalog: ${error}`);
    return { entries: [], recovered: true };
  }
}

// Parsea `var servers = [...]`. Si el JSON completo no parsea, recupera
// entrada por entrada para no perder los servidores válidos.
export function extractJkServersArray(
  data: string,
  slug: string,
  episode: number,
  logger: ScopedLogger,
): unknown[] | null {
  const match = data.match(/var servers\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) return null;
  try {
    const parsed: unknown = JSON.parse(match[1]);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    logger.debug(`jkanime links ${slug}/${episode}: array var servers ilegible, reintentando por entradas.`);
  }
  try {
    const inner = extractBalancedBlock(data, 'var servers =', '[', ']');
    if (inner === null) return null;
    const recovered: unknown[] = [];
    for (const entry of extractBalancedObjects(inner)) {
      try {
        recovered.push(JSON.parse(entry));
      } catch {
        logger.debug(`jkanime links ${slug}/${episode}: entrada de servidor corrupta descartada.`);
      }
    }
    return recovered;
  } catch (error) {
    logger.error(`jkanime links: ${error}`);
    return null;
  }
}

export interface JkFilterOption {
  value: string | undefined;
  text: string;
}

export type JkFilterBucket = (typeof LEGACY_FILTER_ORDER)[number];

// Cada select se identifica por `name`, luego por su <label> y solo en
// último caso por posición histórica: reordenarlos no rompe el mapeo.
export function parseJkFilterOptions(
  $: ReturnType<typeof cheerio.load>,
  logger: ScopedLogger,
): Partial<Record<JkFilterBucket, JkFilterOption[]>> {
  const out: Partial<Record<JkFilterBucket, JkFilterOption[]>> = {};
  const selects = $('select').toArray();
  const assigned = new Set<number>();
  const filled = new Set<string>();

  const claim = (idx: number, bucket: string): boolean => {
    if (assigned.has(idx) || filled.has(bucket)) return false;
    assigned.add(idx);
    filled.add(bucket);
    try {
      const options: JkFilterOption[] = [];
      $(selects[idx])
        .find('option')
        .each((i: any, el: any) => {
          options.push({ value: $(el).attr('value'), text: $(el).text().trim() });
        });
      out[bucket as JkFilterBucket] = options;
    } catch (error) {
      logger.warn(`jkanime filters: select ${bucket} ilegible, se omite. ${error}`);
    }
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

  return out;
}

export interface JkAjaxSeed {
  token: string | undefined;
  animeId: string | undefined;
  img: string;
}

export function parseJkAjaxSeed($: ReturnType<typeof cheerio.load>): JkAjaxSeed {
  return {
    token: $('meta[name="csrf-token"]').attr('content'),
    animeId: $('#guardar-anime').attr('data-anime'),
    img: jkImageUrl($('.anime_pic img').attr('src') || ''),
  };
}

export interface JkDetailsRaw {
  title: string;
  synopsis: string;
  image: string;
  alternativeTitle: string;
  altTitles: { synonyms: string; english: string; japanese: string };
  malId: number | null;
  genres: string[];
  status: { present: boolean; cls: string; text: string; dataStatus: string };
  year: string;
  category: string;
  type: string | null;
  temporadaValue: string;
  emitidoText: string;
  relations: Array<{ type: string; title: string; slug: string }>;
}

export function parseJkDetails($: ReturnType<typeof cheerio.load>, slug: string): JkDetailsRaw {
  const titleContainer = $('.anime_info h3').first();
  const titleText = titleContainer.text().trim();
  const title =
    titleText === 'Buscado recientemente:' || titleText === 'Más secciones'
      ? $('.anime_info h3').eq(1).text().trim() || slug.replace(/-/g, ' ')
      : titleText || slug.replace(/-/g, ' ');

  const synopsis = $('p.scroll').text().trim() || 'No hay sinopsis disponible para este anime.';
  const image = jkImageUrl($('.anime_pic img').attr('src') || '');

  const alternativeTitle = $('.anime_info h3').first().next('span').text().trim() || '';
  const altTitles = extractJkAlternativeTitles($);

  const genres: string[] = [];
  $('a[href*="/genero/"]').each((_: any, el: any) => {
    const g = $(el).text().trim();
    if (g && !genres.includes(g)) genres.push(g);
  });

  const statusEl = $('.enemision').first();
  const status = {
    present: statusEl.length > 0,
    cls: statusEl.length ? statusEl.attr('class') || '' : '',
    text: statusEl.length ? statusEl.text().trim() : '',
    dataStatus: $('.dropmenu').attr('data-status') || '',
  };

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

  const category = $('a[href*="/categoria/"]').first().text().trim();

  let type: string | null = null;
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

  const relations: JkDetailsRaw['relations'] = [];
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
            relations.push({ type: currentType, title: rTitle, slug: slugMatch[1] });
          }
        }
      }
    });
  }

  return {
    title,
    synopsis,
    image,
    alternativeTitle,
    altTitles,
    malId: extractJkMalId($),
    genres,
    status,
    year,
    category,
    type,
    temporadaValue,
    emitidoText,
    relations,
  };
}
