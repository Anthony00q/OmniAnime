import { computeTitleMatchScore } from '../utils/titleUtils';

// Banner visual de AniList (ficha + carpeta), sin fallback al póster:
// si no vincula bien, no hay banner. Sin cuentas, sin identidad entre proveedores.
export const ANILIST_API_URL = 'https://graphql.anilist.co';
export const ANILIST_IMAGE_HOST = 's4.anilist.co';

const ANILIST_SEARCH_QUERY = `
query ($search: String) {
  Page(perPage: 10) {
    media(search: $search, type: ANIME, isAdult: false) {
      id
      title { romaji english native }
      synonyms
      bannerImage
      startDate { year }
      season
      seasonYear
      format
      popularity
    }
  }
}
`;

const IDMAL_SEARCH_QUERY = `
query ($malId: Int) {
  Media(idMal: $malId, type: ANIME) {
    id
    idMal
    title { romaji english native }
    bannerImage
  }
}
`;

const MAX_SEARCH_VARIANTS = 4;
const MAX_POOLED_CANDIDATES = 15;

// Conservador: mejor omitir el banner que mostrar el de otro anime.
// Año/formato/temporada solo rompen empates exactos.
const MIN_MATCH_SCORE = 85;
const MIN_SCORE_GAP = 15;

export interface AniListCandidate {
  id: number;
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
  synonyms?: Array<string | null> | null;
  bannerImage?: string | null;
  idMal?: number | null;
  startYear?: number | null;
  season?: string | null;
  seasonYear?: number | null;
  format?: string | null;
  popularity?: number | null;
}

export interface AniListBannerResult {
  anilistId: number;
  banner: string;
}

export interface AniListBannerInput {
  title: string;
  alternativeTitles?: Array<string | null | undefined> | null;
  providerYear?: number | string | null;
  providerFormat?: string | null;
  providerSeason?: string | null;
  malId?: number | null;
}

export interface AniListBannerSource {
  title?: string | null;
  alternativeTitles?: Array<string | null | undefined> | null;
  year?: number | string | null;
  type?: string | null;
  season?: string | null;
  malId?: number | null;
}

// Mismo input que la ficha de Detalles: el banner guardado en disco
// coincide con el mostrado. Sin fallback al póster en ningún punto.
export function anilistBannerInputFromDetails(details: AniListBannerSource | null | undefined): AniListBannerInput {
  return {
    title: String(details?.title ?? ''),
    alternativeTitles: details?.alternativeTitles ?? null,
    providerYear: details?.year ?? null,
    providerFormat: details?.type ?? null,
    providerSeason: details?.season ?? null,
    malId: details?.malId ?? null,
  };
}

export function parseMalId(rawId: number | string | null | undefined): number | null {
  const id = Number(rawId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export type AniListPost = (body: unknown) => Promise<unknown>;

// Fracciones vulgares que deben leerse como sus digitos ("1/2" de AniList).
const VULGAR_FRACTIONS: Record<string, string> = {
  '\u00bc': '1 4',
  '\u00bd': '1 2',
  '\u00be': '3 4',
  '\u2150': '1 7',
  '\u2151': '1 9',
  '\u2152': '1 10',
  '\u2153': '1 3',
  '\u2154': '2 3',
  '\u2155': '1 5',
  '\u2156': '2 5',
  '\u2157': '3 5',
  '\u2158': '4 5',
  '\u2159': '1 6',
  '\u215a': '5 6',
  '\u215b': '1 8',
  '\u215c': '3 8',
  '\u215d': '5 8',
  '\u215e': '7 8',
};

const ROMAN_SEASONS: Record<string, string> = {
  ii: '2',
  iii: '3',
  iv: '4',
  v: '5',
  vi: '6',
  vii: '7',
  viii: '8',
};

const WORD_SEASONS: Record<string, string> = {
  first: '1',
  second: '2',
  third: '3',
  fourth: '4',
  fifth: '5',
  primera: '1',
  segunda: '2',
  tercera: '3',
  cuarta: '4',
  quinta: '5',
};

// "S2", "2nd", "II" y "temporada 2" colapsan a "season 2" (el orden no distingue sagas).
export function canonicalizeSeasonTokens(rawText: string): string {
  let out = ` ${String(rawText || '').toLowerCase()} `;
  out = out.replace(/\btemporada\b/g, ' season ');
  out = out.replace(/\bs(\d{1,2})\b/g, ' season $1 ');
  out = out.replace(/\b(\d{1,2})(st|nd|rd|th)\b/g, ' $1 ');
  out = out.replace(/\b(\d{1,2})\s+season\b/g, ' season $1 ');
  out = out.replace(/\bseason\s+(ii|iii|iv|v|vi|vii|viii)\b/g, (_, r: string) => ` season ${ROMAN_SEASONS[r]} `);
  out = out.replace(
    /\b(first|second|third|fourth|fifth|primera|segunda|tercera|cuarta|quinta)\s+season\b/g,
    (_, w: string) => ` season ${WORD_SEASONS[w]} `,
  );
  return out.replace(/\s{2,}/g, ' ').trim();
}

// Fuera idioma/calidad/formato; dentro numeros, temporadas y años (distinguen sagas).
// Idempotente: se aplica igual a query y candidatos.
export function normalizeProviderTitleForAniList(rawTitle: string): string {
  const nfkc = String(rawTitle || '')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[\u0300-\u036f]/g, '');
  const withFractions = nfkc.replace(/[\u00bc-\u00be\u2150-\u215e]/g, (ch) => ` ${VULGAR_FRACTIONS[ch] || ''} `);
  const ascii = withFractions.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const years = Array.from(new Set(Array.from(ascii.matchAll(/\b(19|20)\d{2}\b/g)).map((m) => m[0])));
  const withoutYears = ascii.replace(/\b(19|20)\d{2}\b/g, ' ');
  const withoutBrackets = withoutYears.replace(/[[({][^\]})]*[\])}]/g, ' ');
  const spaced = withoutBrackets.replace(/[-_:;,.!?"'/\\|+#*~^\u2013\u2014\u2044\u2215]+/g, ' ');
  const withoutTags = spaced.replace(
    /\b(sub|subtitulad[oa]s?|espanol|latino|lat|castellano|audio|dual|doblado|dub|japones|vo|vose|1080p|720p|480p|2160p|4k|hd|fullhd|fhd|bluray|bdrip|brrip|webrip|web|dl|hdrip|hdtv|x264|x265|hevc|aac|10bit|mp4|mkv|avi)\b/g,
    ' ',
  );
  const collapsed = withoutTags.replace(/\s{2,}/g, ' ').trim();
  const canon = canonicalizeSeasonTokens(collapsed);
  return [canon, ...years.filter((y) => !canon.includes(y))]
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Sin el sufijo de temporada, por si AniList tokeniza distinto.
export function stripTrailingSeasonSuffix(rawTitle: string): string {
  return String(rawTitle || '')
    .replace(/\s+(?:\d+(?:st|nd|rd|th)\s+)?(?:season|s|part|cour|temporada)\b[\s\S]*$/i, '')
    .trim();
}

export function buildAniListSearchVariants(
  title: string,
  alternativeTitles?: Array<string | null | undefined> | null,
): string[] {
  const out: string[] = [];
  const push = (t: unknown) => {
    const s = String(t || '').trim();
    if (s && !out.includes(s)) out.push(s);
  };
  const base = String(title || '').trim();
  push(base);
  if (base) push(stripTrailingSeasonSuffix(base));
  for (const alt of (alternativeTitles || []).slice(0, 2)) push(alt);
  return out.slice(0, MAX_SEARCH_VARIANTS);
}

export function parseProviderYear(rawYear: number | string | null | undefined): number | null {
  const m = String(rawYear ?? '').match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : null;
}

// Texto libre a enum AniList; lo desconocido no participa.
export function mapProviderFormat(rawFormat: string | null | undefined): string | null {
  const text = String(rawFormat || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (/\bpelicula\b|\bmovies?\b|\bfilm\b/.test(text)) return 'MOVIE';
  if (/\bova\b/.test(text)) return 'OVA';
  if (/\bona\b/.test(text)) return 'ONA';
  if (/\bespecial\b|\bspecial\b/.test(text)) return 'SPECIAL';
  if (/\bserie\b|\btv\b/.test(text)) return 'TV';
  return null;
}

// Temporada del provider ("Temporada Otoño", "Otoño 2023"...) a enum AniList.
export function mapProviderSeason(rawSeason: string | null | undefined): string | null {
  const text = String(rawSeason || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (text.includes('invierno') || /\bwinter\b/.test(text)) return 'WINTER';
  if (text.includes('primavera') || /\bspring\b/.test(text)) return 'SPRING';
  if (text.includes('verano') || /\bsummer\b/.test(text)) return 'SUMMER';
  if (text.includes('otono') || /\bfall\b|\bautumn\b/.test(text)) return 'FALL';
  return null;
}

function candidateTitles(candidate: AniListCandidate): string[] {
  const titles = [candidate.romaji, candidate.english, candidate.native, ...(candidate.synonyms || [])];
  return titles.map((t) => String(t || '').trim()).filter(Boolean);
}

export function scoreAniListCandidate(normalizedQuery: string, candidate: AniListCandidate): number {
  let best = 0;
  for (const title of candidateTitles(candidate)) {
    const score = computeTitleMatchScore(normalizedQuery, normalizeProviderTitleForAniList(title));
    if (score > best) best = score;
  }
  return best;
}

function candidatePopularity(candidate: AniListCandidate): number {
  const n = Number(candidate.popularity);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function yearDistance(candidate: AniListCandidate, providerYear: number): number | null {
  const startYear = Number(candidate.startYear);
  if (!Number.isFinite(startYear) || startYear <= 0) return null;
  return Math.abs(providerYear - startYear);
}

type ScoredCandidate = { candidate: AniListCandidate; score: number };

// Desempata 100-100 en orden formato -> año -> temporada; sin ganador único, null.
function breakExactTie(
  tied: ScoredCandidate[],
  input: AniListBannerInput,
  providerYear: number | null,
): ScoredCandidate | null {
  let contenders = tied;
  const format = mapProviderFormat(input.providerFormat ?? null);
  if (format) {
    contenders = contenders.filter((s) => String(s.candidate.format || '').toUpperCase() === format);
    if (contenders.length === 0) return null;
  }
  if (contenders.length > 1 && providerYear !== null) {
    const ranked = contenders
      .map((entry) => ({ entry, dist: yearDistance(entry.candidate, providerYear) }))
      .filter((x): x is { entry: ScoredCandidate; dist: number } => x.dist !== null);
    if (ranked.length !== contenders.length) return null;
    const closest = Math.min(...ranked.map((x) => x.dist));
    contenders = ranked.filter((x) => x.dist === closest).map((x) => x.entry);
  }
  if (contenders.length > 1) {
    const season = mapProviderSeason(input.providerSeason ?? null);
    if (!season) return null;
    const matching = contenders.filter(
      (s) =>
        String(s.candidate.season || '').toUpperCase() === season &&
        (s.candidate.seasonYear == null || providerYear == null || s.candidate.seasonYear === providerYear),
    );
    if (matching.length !== 1) return null;
    contenders = matching;
  }
  return contenders.length === 1 ? contenders[0] : null;
}

// Gana el claramente mejor; en empate o duda, nada. El ganador debe traer banner.
export function selectAniListMatch(
  rawQuery: string | AniListBannerInput,
  candidates: AniListCandidate[],
): AniListCandidate | null {
  const input: AniListBannerInput = typeof rawQuery === 'string' ? { title: rawQuery } : rawQuery || { title: '' };
  const normalized = normalizeProviderTitleForAniList(input.title);
  if (!normalized || !Array.isArray(candidates) || candidates.length === 0) return null;
  const providerYear = parseProviderYear(input.providerYear ?? null);
  const scored = candidates
    .filter((c) => c && Number.isFinite(Number(c.id)))
    .map((c) => ({ candidate: c, score: scoreAniListCandidate(normalized, c) }))
    .sort((a, b) => b.score - a.score || candidatePopularity(b.candidate) - candidatePopularity(a.candidate));
  if (scored.length === 0 || scored[0].score < MIN_MATCH_SCORE) return null;
  const [best, runnerUp] = [scored[0], scored[1]];
  let winner = best;
  if (best.score === 100) {
    const tied = scored.filter((s) => s.score === 100);
    if (tied.length > 1) {
      const untied = breakExactTie(tied, input, providerYear);
      if (!untied) return null;
      winner = untied;
    }
  } else if (runnerUp && best.score - runnerUp.score < MIN_SCORE_GAP) {
    return null;
  }
  if (!winner.candidate.bannerImage || !String(winner.candidate.bannerImage).trim()) return null;
  return winner.candidate;
}

function toCandidate(raw: unknown): AniListCandidate | null {
  if (!raw || typeof raw !== 'object') return null;
  const node = raw as Record<string, unknown>;
  const id = Number(node.id);
  if (!Number.isFinite(id)) return null;
  const title = (node.title || {}) as Record<string, unknown>;
  const synonyms = Array.isArray(node.synonyms) ? (node.synonyms as Array<string | null>) : null;
  const startDate = (node.startDate || {}) as Record<string, unknown>;
  const asNumber = (value: unknown): number | null => (Number.isFinite(Number(value)) ? Number(value) : null);
  const asText = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);
  return {
    id,
    romaji: typeof title.romaji === 'string' ? title.romaji : null,
    english: typeof title.english === 'string' ? title.english : null,
    native: typeof title.native === 'string' ? title.native : null,
    synonyms,
    bannerImage: typeof node.bannerImage === 'string' ? node.bannerImage : null,
    idMal: asNumber(node.idMal),
    startYear: asNumber(startDate.year),
    season: asText(node.season),
    seasonYear: asNumber(node.seasonYear),
    format: asText(node.format),
    popularity: asNumber(node.popularity),
  };
}

async function fetchAniListSearch(search: string, post: AniListPost): Promise<AniListCandidate[]> {
  const query = String(search || '').trim();
  if (!query) return [];
  const envelope = (await post({ query: ANILIST_SEARCH_QUERY, variables: { search: query } })) as Record<
    string,
    unknown
  >;
  const page = (envelope?.data as Record<string, unknown> | undefined)?.Page as Record<string, unknown> | undefined;
  const list = page?.media as unknown[] | undefined;
  if (!Array.isArray(list)) return [];
  return list.map(toCandidate).filter((c): c is AniListCandidate => c !== null);
}

// Variantes en paralelo con fallo aislado; dedupe por id con tope.
export async function fetchAniListCandidates(searches: string[], post: AniListPost): Promise<AniListCandidate[]> {
  const lists = await Promise.all(
    (Array.isArray(searches) ? searches : []).map((s) => fetchAniListSearch(s, post).catch(() => [])),
  );
  const seen = new Set<number>();
  const pooled: AniListCandidate[] = [];
  for (const list of lists) {
    for (const c of list) {
      if (seen.has(c.id) || pooled.length >= MAX_POOLED_CANDIDATES) continue;
      seen.add(c.id);
      pooled.push(c);
    }
  }
  return pooled;
}

function isAniListBannerHost(rawUrl: string): boolean {
  try {
    const url = new URL(String(rawUrl || '').trim());
    return url.protocol === 'https:' && url.hostname.toLowerCase() === ANILIST_IMAGE_HOST;
  } catch {
    return false;
  }
}

// Vía directa por MAL ID: sin fuzzy; solo vale si AniList devuelve el
// mismo idMal pedido. El título puede diferir por idioma o romanización.
export async function fetchAniListByMalId(malId: number, post: AniListPost): Promise<AniListCandidate | null> {
  try {
    if (!Number.isInteger(malId) || malId <= 0) return null;
    const envelope = (await post({ query: IDMAL_SEARCH_QUERY, variables: { malId } })) as Record<string, unknown>;
    const media = (envelope?.data as Record<string, unknown> | undefined)?.Media as unknown;
    const candidate = toCandidate(media);
    if (!candidate || Number(candidate.id) <= 0) return null;
    return candidate;
  } catch {
    return null;
  }
}

function bannerFrom(candidate: AniListCandidate | null): AniListBannerResult | null {
  if (!candidate || !candidate.bannerImage) return null;
  const banner = String(candidate.bannerImage).trim();
  if (!isAniListBannerHost(banner)) return null;
  return { anilistId: candidate.id, banner };
}

// Orden: malId directo primero; fallback al matcher por título cuando no hay
// malId, no se encuentra o viene sin banner. Solo { anilistId, banner } o
// null; nunca lanza.
export async function resolveAniListBanner(
  input: string | AniListBannerInput,
  post: AniListPost,
): Promise<AniListBannerResult | null> {
  try {
    const query: AniListBannerInput = typeof input === 'string' ? { title: input } : input || { title: '' };
    const malId = parseMalId(query.malId ?? null);
    if (malId !== null) {
      const direct = await fetchAniListByMalId(malId, post);
      if (direct && direct.idMal === malId) {
        const resolved = bannerFrom(direct);
        if (resolved) return resolved;
      }
    }
    if (!String(query.title || '').trim()) return null;
    const variants = buildAniListSearchVariants(query.title, query.alternativeTitles);
    const match = selectAniListMatch(query, await fetchAniListCandidates(variants, post));
    return bannerFrom(match);
  } catch {
    return null;
  }
}
