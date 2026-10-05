import { AnimeSearchResult, AnimeDetails, DownloadLink, CatalogFiltersData } from '../../../types/anime';
import { decodeBase64Text, isHttpUrl } from '../../../utils/scrapeParse';
import { normalizeMegaUrl, normalizeMp4UploadUrl } from '../../../utils/serverUtils';
import { normalizeAllowedImageUrl } from '../../../utils/security/networkSecurity';
import type { ScopedLogger } from '../../logging/AppLogger';
import { jkImageUrl } from './client';
import type { JkDetailsRaw, JkFilterBucket, JkFilterOption, JkSearchRaw } from './parser';

// Mes español (1-12) → estación, mismo corte que AnimeAV1 por fecha.
const JK_MONTH_SEASON: Array<{ names: string[]; season: string }> = [
  { names: ['enero', 'febrero', 'marzo'], season: 'Invierno' },
  { names: ['abril', 'mayo', 'junio'], season: 'Primavera' },
  { names: ['julio', 'agosto', 'septiembre', 'setiembre'], season: 'Verano' },
  { names: ['octubre', 'noviembre', 'diciembre'], season: 'Otoño' },
];

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

// Cada sinónimo vale como variante propia; JK los publica en una sola línea.
export function splitJkSynonyms(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of String(raw || '').split(/[,;·|/]+/)) {
    const clean = piece.replace(/\s+/g, ' ').trim();
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
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

export function mapJkSearchResult(raw: JkSearchRaw): AnimeSearchResult {
  return {
    id: raw.slug,
    title: raw.title,
    slug: raw.slug,
    poster: raw.poster,
    synopsis: 'Sin sinopsis',
  };
}

export function mapJkCatalogFromSearch(results: AnimeSearchResult[]): AnimeSearchResult[] {
  return results.map((r) => ({
    ...r,
    category: r.category || 'Anime',
    year: r.year || '',
    status: r.status || '',
  }));
}

export function mapJkAnimeEntry(item: unknown): AnimeSearchResult | null {
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
      poster: jkImageUrl(typeof entry.image === 'string' ? entry.image : ''),
      synopsis: typeof entry.synopsis === 'string' && entry.synopsis ? entry.synopsis : 'Sin sinopsis',
    };
  } catch {
    return null;
  }
}

function mapJkStatus(status: JkDetailsRaw['status']): string {
  let out = 'Desconocido';
  if (status.present) {
    if (status.cls.includes('finished')) out = 'Finalizado';
    else if (status.cls.includes('currently')) out = 'En emisión';
    else if (status.cls.includes('proximo') || status.cls.includes('upcoming')) out = 'Próximamente';
    else if (status.text) out = status.text;
  }
  if (out === 'Desconocido') {
    if (status.dataStatus === 'finished') out = 'Finalizado';
    else if (status.dataStatus === 'currently') out = 'En emisión';
    else if (status.dataStatus === 'proximo') out = 'Próximamente';
  }
  return out;
}

export function mapJkDetails(
  raw: JkDetailsRaw,
  slug: string,
  extras: { episodes: number[]; episodeThumbnails: Record<number, string> },
): AnimeDetails {
  return {
    id: slug,
    title: raw.title,
    slug,
    description: raw.synopsis,
    poster: raw.image,
    banner: null,
    episodes: extras.episodes,
    relations: raw.relations.map((rel) => ({
      id: rel.slug,
      slug: rel.slug,
      title: rel.title,
      type: rel.type,
      poster: `https://cdn.jkdesa.com/assets/images/animes/image/${rel.slug}.jpg`,
    })),
    genres: raw.genres,
    status: mapJkStatus(raw.status),
    year: raw.year,
    category: raw.category || 'Anime',
    japaneseTitle: raw.alternativeTitle || '',
    malId: raw.malId,
    alternativeTitles: [
      raw.altTitles.english,
      raw.alternativeTitle,
      ...splitJkSynonyms(raw.altTitles.synonyms),
      raw.altTitles.japanese,
    ]
      .map((t) => String(t || '').trim())
      .filter((t, index, arr) => !!t && t !== raw.title && arr.indexOf(t) === index),
    season: resolveJkSeasonFromTexts(raw.temporadaValue, raw.emitidoText, raw.year),
    episodeThumbnails: extras.episodeThumbnails,
    score: 0,
    votes: 0,
    // DUB desactivado: solo SUB
    availableLanguages: ['SUB'],
    // Estudio solo desde AniList; el proveedor no aporta.
    studio: 'Desconocido',
    type: raw.type || 'TV',
  };
}

export function mapJkDownloadLinks(
  entries: unknown[],
  ctx: { slug: string; episode: number; logger: ScopedLogger },
): DownloadLink[] {
  // DUB desactivado: solo SUB
  const requestedJkLang: number = 1;
  const links: DownloadLink[] = [];
  const seen = new Set<string>();

  for (const s of entries) {
    try {
      if (!s || typeof s !== 'object') continue;
      const entry = s as Record<string, unknown>;
      if (Number(entry.lang) !== requestedJkLang) continue;
      const serverName = typeof entry.server === 'string' ? entry.server.trim() : '';
      if (!serverName) continue;

      const url = decodeBase64Text(entry.remote);
      if (!url || !isHttpUrl(url)) {
        ctx.logger.debug(`jkanime links ${ctx.slug}/${ctx.episode}: remoto descartado en ${serverName}.`);
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
        // DUB desactivado: solo SUB
        lang: 'SUB',
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
}

function pushFilterOptions(filters: CatalogFiltersData, bucket: string, options: JkFilterOption[]): void {
  for (const opt of options) {
    const valAttr = opt.value;
    const text = opt.text;
    switch (bucket) {
      case 'orders':
        if (text) filters.orders!.push({ id: valAttr ?? '', name: text });
        break;
      case 'genres':
        if (valAttr) filters.genres.push({ id: valAttr, name: text });
        break;
      case 'letters':
        if (valAttr === '') break;
        {
          const val = valAttr !== undefined && valAttr !== '' ? valAttr : text;
          if (val) filters.letters!.push({ id: val, name: text });
        }
        break;
      case 'demographics':
        if (!valAttr) break;
        filters.demographics!.push({ id: valAttr, name: text });
        break;
      case 'categories':
        if (valAttr) filters.categories.push({ id: valAttr, name: text });
        break;
      case 'types':
        if (!valAttr) break;
        filters.types!.push({ id: valAttr, name: text });
        break;
      case 'statuses':
        if (!valAttr) break;
        filters.statuses!.push({ id: valAttr, name: text });
        break;
      case 'years': {
        const val = valAttr || text;
        if (val && /^\d+$/.test(val)) filters.years.push(parseInt(val, 10));
        break;
      }
      case 'seasons':
        if (!valAttr) break;
        filters.seasons!.push({ id: valAttr, name: text });
        break;
      case 'orderDirs':
        if (text) filters.orderDirs!.push({ id: valAttr ?? '', name: text });
        break;
      default:
        break;
    }
  }
}

export function mapJkFiltersData(byBucket: Partial<Record<JkFilterBucket, JkFilterOption[]>>): CatalogFiltersData {
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
  for (const bucket of Object.keys(byBucket) as JkFilterBucket[]) {
    pushFilterOptions(filters, bucket, byBucket[bucket] || []);
  }
  return filters;
}
