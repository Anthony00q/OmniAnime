import {
  AnimeSearchResult,
  AnimeRelation,
  AnimeDetails,
  DownloadLink,
  HomeEpisode,
  CatalogFiltersData,
} from '../../../types/anime';
import { unescapeSvelteString } from '../../../utils/scrapeParse';
import { normalizeMegaUrl, normalizeMp4UploadUrl } from '../../../utils/serverUtils';
import { av1CoverUrl } from './client';
import {
  parseAv1Timestamp,
  type Av1HomeRaw,
  type Av1ResultRaw,
  type Av1DetailsRaw,
  type Av1LinkRaw,
  type Av1FiltersRaw,
} from './parser';

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

function relativeTimeText(past: Date, now: Date = new Date()): string {
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
}

function av1TimeAgo(dateStr: string): string {
  const past = parseAv1Timestamp(dateStr);
  return past ? relativeTimeText(past) : 'Reciente';
}

const RELATION_TYPES: { [key: number]: string } = {
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

const AV1_STATUS: Record<string, string> = {
  '0': 'Finalizado',
  '1': 'Próximamente',
  '2': 'En emisión',
};

const BAD_SERVERS = ['drive', 'gdrive', 'google drive', 'zippyshare', 'openload', 'uptobox', 'vidcloud', 'yourupload'];

export function mapAv1HomeEpisode(raw: Av1HomeRaw): HomeEpisode {
  return {
    title: unescapeSvelteString(raw.title),
    slug: raw.slug,
    episode: raw.episode,
    poster: av1CoverUrl(raw.mediaId),
    timeAgo: raw.publishedAt ? av1TimeAgo(raw.publishedAt) : 'Reciente',
  };
}

export function mapAv1SearchResult(raw: Av1ResultRaw, categoryById: { [key: string]: string }): AnimeSearchResult {
  return {
    id: raw.id,
    title: unescapeSvelteString(raw.title),
    slug: raw.slug,
    poster: av1CoverUrl(raw.id),
    category: raw.categoryId && categoryById[raw.categoryId] ? categoryById[raw.categoryId] : 'Anime',
    year: '',
    status: '',
    synopsis: raw.synopsis ? unescapeSvelteString(raw.synopsis) : 'Sin sinopsis disponible.',
  };
}

function mapAv1Season(startDate: Av1DetailsRaw['startDate']): string {
  if (!startDate) return '';
  const month = startDate.month;
  if (month >= 1 && month <= 3) return 'Temporada Invierno';
  if (month >= 4 && month <= 6) return 'Temporada Primavera';
  if (month >= 7 && month <= 9) return 'Temporada Verano';
  if (month >= 10 && month <= 12) return 'Temporada Otoño';
  return '';
}

export function mapAv1Details(raw: Av1DetailsRaw, slug: string): AnimeDetails {
  const category = raw.category ?? 'Anime';
  const status = raw.status !== null ? AV1_STATUS[raw.status] || 'Desconocido' : 'Desconocido';
  const episodeThumbnails: Record<number, string> = {};
  for (const num of raw.episodes) {
    const thumb = buildAv1EpisodeThumbUrl(raw.id, num);
    if (thumb) episodeThumbnails[num] = thumb;
  }
  const relations: AnimeRelation[] = raw.relations.map((rel) => ({
    id: rel.id,
    slug: rel.slug,
    title: rel.title,
    type: RELATION_TYPES[rel.type] || 'Relacionado',
    poster: av1CoverUrl(rel.id),
  }));

  return {
    id: raw.id,
    title: raw.title,
    slug,
    description: raw.description,
    poster: av1CoverUrl(raw.id),
    banner: null,
    episodes: [...new Set(raw.episodes)].sort((a, b) => a - b),
    relations,
    genres: raw.genres,
    status,
    year: raw.startDate ? raw.startDate.year : '',
    category,
    japaneseTitle: raw.aka.ja,
    malId: raw.malId,
    alternativeTitles: [raw.aka.en, raw.aka.ja]
      .map((t) => String(t || '').trim())
      .filter((t, index, arr) => !!t && t !== raw.title && arr.indexOf(t) === index),
    season: mapAv1Season(raw.startDate),
    score: raw.score,
    votes: raw.votes,
    episodeThumbnails,
    // DUB desactivado: solo SUB
    availableLanguages: ['SUB'],
    studio: 'Desconocido',
    type: category || 'TV',
  };
}

export function mapAv1DownloadLinks(raws: Av1LinkRaw[]): DownloadLink[] {
  const links: DownloadLink[] = [];
  const seen = new Set<string>();
  for (const raw of raws) {
    try {
      if (BAD_SERVERS.includes(raw.server.toLowerCase()) || !raw.url) continue;
      const low = raw.server.toLowerCase();
      let url = raw.url;
      if (low.includes('mega')) {
        url = normalizeMegaUrl(url);
      } else if (low.includes('mp4upload')) {
        url = normalizeMp4UploadUrl(url);
      }
      const dedupeKey = `${raw.server.toLowerCase()}|${url}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      // DUB desactivado: solo SUB
      links.push({ server: raw.server, url, lang: 'SUB' });
    } catch {
      continue;
    }
  }
  return links;
}

export function mapAv1FiltersData(raw: Av1FiltersRaw): CatalogFiltersData {
  return {
    categories: raw.categories.map((c) => ({ id: c.id, name: c.name })),
    genres: raw.genres.map((g) => ({ id: g.id, name: g.name })).sort((a, b) => a.name.localeCompare(b.name)),
    years: raw.years ? [raw.years[0], raw.years[1]] : [],
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
}
