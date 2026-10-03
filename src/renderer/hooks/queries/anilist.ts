import { useQuery } from '@tanstack/react-query';

// Banner y estudio de AniList: éxitos con caché larga (24h); fallos de
// red/límite con caché corta (2 min) para reintentar pronto sin golpear la API.
export const ANILIST_BANNER_STALE_MS = 24 * 60 * 60 * 1000;
export const ANILIST_FAILURE_STALE_MS = 2 * 60 * 1000;

export interface AniListMetaTitles {
  romaji: string | null;
  english: string | null;
  native: string | null;
  synonyms: string[];
}

export interface AniListMeta {
  anilistId: number;
  banner: string | null;
  studio: string | null;
  titles: AniListMetaTitles;
}

export interface AniListBannerRequest {
  title?: string | null | undefined;
  alternativeTitles?: Array<string | null | undefined> | null;
  providerYear?: number | string | null;
  providerFormat?: string | null;
  providerSeason?: string | null;
  malId?: number | null;
}

export interface NormalizedAniListRequest {
  title: string;
  alternativeTitles: string[];
  providerYear: number | string | null;
  providerFormat: string | null;
  providerSeason: string | null;
  malId: number | null;
}

function asOptionalText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

export function normalizeAniListRequest(
  input: string | AniListBannerRequest | null | undefined,
): NormalizedAniListRequest {
  const raw: AniListBannerRequest = typeof input === 'string' ? { title: input } : input || {};
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const alternativeTitles = Array.isArray(raw.alternativeTitles)
    ? raw.alternativeTitles.filter((t): t is string => typeof t === 'string').slice(0, 3)
    : [];
  const malId = Number(raw.malId);
  return {
    title,
    alternativeTitles,
    providerYear: raw.providerYear ?? null,
    providerFormat: asOptionalText(raw.providerFormat),
    providerSeason: asOptionalText(raw.providerSeason),
    malId: Number.isInteger(malId) && malId > 0 ? malId : null,
  };
}

// La key incluye todo el input: el prefetch con solo título usa otra key.
export function anilistBannerKey(input: string | AniListBannerRequest | null | undefined): string[] {
  const req = normalizeAniListRequest(input);
  return [
    'anilist-banner',
    req.title,
    req.alternativeTitles.join('\n'),
    String(req.providerYear ?? ''),
    req.providerFormat ?? '',
    req.providerSeason ?? '',
    String(req.malId ?? ''),
  ];
}

export async function fetchAniListMeta(
  input: string | AniListBannerRequest | null | undefined,
): Promise<AniListMeta | null> {
  const req = normalizeAniListRequest(input);
  if (!req.title && req.malId === null) return null;
  const res = (await window.api.invoke('get-anilist-banner', req)) as {
    anilistId: number;
    banner?: string | null;
    studio?: string | null;
    titles?: Partial<AniListMetaTitles> | null;
    transientFailure?: boolean;
  } | null;
  // El fallo transitorio va antes que el shape: sin él la query lanza y reintenta.
  if (res?.transientFailure) throw new Error('anilist-transient');
  if (!res || typeof res.anilistId !== 'number') return null;
  const banner = typeof res.banner === 'string' && res.banner.trim() ? res.banner : null;
  const studio = typeof res.studio === 'string' && res.studio.trim() ? res.studio.trim() : null;
  if (!banner && !studio) return null;
  return { anilistId: res.anilistId, banner, studio, titles: normalizeAniListTitles(res.titles) };
}

function normalizeAniListTitles(raw: Partial<AniListMetaTitles> | null | undefined): AniListMetaTitles {
  return {
    romaji: asOptionalText(raw?.romaji),
    english: asOptionalText(raw?.english),
    native: asOptionalText(raw?.native),
    synonyms: Array.isArray(raw?.synonyms) ? raw.synonyms.map((s) => String(s ?? '').trim()).filter(Boolean) : [],
  };
}

export async function fetchAniListBanner(
  input: string | AniListBannerRequest | null | undefined,
): Promise<string | null> {
  return (await fetchAniListMeta(input))?.banner ?? null;
}

// Constructor único de la query: misma key/fn en todos los usos.
export function getAniListBannerQuery(input: string | AniListBannerRequest | null | undefined) {
  const queryKey = anilistBannerKey(input);
  return { queryKey, queryFn: () => fetchAniListMeta(input) };
}

export function useAniListBanner(input: string | AniListBannerRequest | null | undefined, enabled = true) {
  const { queryKey, queryFn } = getAniListBannerQuery(input);
  const req = normalizeAniListRequest(input);
  return useQuery({
    queryKey,
    queryFn,
    select: (meta) => meta?.banner ?? null,
    enabled: enabled && (queryKey[1].length > 0 || req.malId !== null),
    staleTime: ANILIST_BANNER_STALE_MS,
    gcTime: 7 * 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    retryDelay: ANILIST_FAILURE_STALE_MS,
  });
}

export function useAniListStudio(input: string | AniListBannerRequest | null | undefined, enabled = true) {
  const { queryKey, queryFn } = getAniListBannerQuery(input);
  const req = normalizeAniListRequest(input);
  return useQuery({
    queryKey,
    queryFn,
    select: (meta) => meta?.studio ?? null,
    enabled: enabled && (queryKey[1].length > 0 || req.malId !== null),
    staleTime: ANILIST_BANNER_STALE_MS,
    gcTime: 7 * 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    retryDelay: ANILIST_FAILURE_STALE_MS,
  });
}

export function useAniListId(input: string | AniListBannerRequest | null | undefined, enabled = true) {
  const { queryKey, queryFn } = getAniListBannerQuery(input);
  const req = normalizeAniListRequest(input);
  return useQuery({
    queryKey,
    queryFn,
    select: (meta) => meta?.anilistId ?? null,
    enabled: enabled && (queryKey[1].length > 0 || req.malId !== null),
    staleTime: ANILIST_BANNER_STALE_MS,
    gcTime: 7 * 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    retryDelay: ANILIST_FAILURE_STALE_MS,
  });
}
