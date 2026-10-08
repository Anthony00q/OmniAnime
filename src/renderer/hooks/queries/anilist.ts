import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { unwrap } from './unwrap';

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
  linkSource: 'auto' | 'manual' | null;
}

export interface AniListBannerRequest {
  title?: string | null | undefined;
  alternativeTitles?: Array<string | null | undefined> | null;
  providerYear?: number | string | null;
  providerFormat?: string | null;
  providerSeason?: string | null;
  malId?: number | null;
  providerId?: string | null;
  slug?: string | null;
}

export interface NormalizedAniListRequest {
  title: string;
  alternativeTitles: string[];
  providerYear: number | string | null;
  providerFormat: string | null;
  providerSeason: string | null;
  malId: number | null;
  providerId: string | null;
  slug: string | null;
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
    providerId: asOptionalText(raw.providerId),
    slug: asOptionalText(raw.slug),
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
    req.providerId ?? '',
    req.slug ?? '',
  ];
}

export async function fetchAniListMeta(
  input: string | AniListBannerRequest | null | undefined,
): Promise<AniListMeta | null> {
  const req = normalizeAniListRequest(input);
  if (!req.title && req.malId === null) return null;
  // AniList nunca avisa: silencio salvo el reintento transitorio.
  const res = unwrap(await window.api.invoke('get-anilist-banner', req), { toast: false }) as {
    anilistId: number;
    banner?: string | null;
    studio?: string | null;
    titles?: Partial<AniListMetaTitles> | null;
    transientFailure?: boolean;
    linkSource?: string | null;
  } | null;
  // El fallo transitorio va antes que el shape: sin él la query lanza y reintenta.
  if (res?.transientFailure) throw new Error('anilist-transient');
  if (!res || typeof res.anilistId !== 'number') return null;
  const banner = typeof res.banner === 'string' && res.banner.trim() ? res.banner : null;
  const studio = typeof res.studio === 'string' && res.studio.trim() ? res.studio.trim() : null;
  if (!banner && !studio) return null;
  return {
    anilistId: res.anilistId,
    banner,
    studio,
    titles: normalizeAniListTitles(res.titles),
    linkSource: res.linkSource === 'manual' || res.linkSource === 'auto' ? res.linkSource : null,
  };
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

export function useAniListLinkSource(input: string | AniListBannerRequest | null | undefined, enabled = true) {
  const { queryKey, queryFn } = getAniListBannerQuery(input);
  const req = normalizeAniListRequest(input);
  return useQuery({
    queryKey,
    queryFn,
    select: (meta) => meta?.linkSource ?? null,
    enabled: enabled && (queryKey[1].length > 0 || req.malId !== null),
    staleTime: ANILIST_BANNER_STALE_MS,
    gcTime: 7 * 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
    retryDelay: ANILIST_FAILURE_STALE_MS,
  });
}

export interface AniListSearchItem {
  id: number;
  romaji: string | null;
  english: string | null;
  format: string | null;
  startYear: number | null;
  cover: string | null;
}

export async function searchAniList(query: string): Promise<AniListSearchItem[]> {
  const text = String(query || '').trim();
  if (!text) return [];
  const list = (await unwrap(await window.api.invoke('search-anilist', { query: text }), {
    toast: false,
  })) as unknown;
  if (!Array.isArray(list)) return [];
  return (list as Array<Partial<AniListSearchItem> & { id: number }>).map((item) => ({
    id: item.id,
    romaji: item.romaji ?? null,
    english: item.english ?? null,
    format: item.format ?? null,
    startYear: item.startYear ?? null,
    cover: typeof item.cover === 'string' && item.cover.trim() ? item.cover : null,
  }));
}

export function useAniListSearch(query: string, enabled = true) {
  const text = String(query || '').trim();
  return useQuery({
    queryKey: ['anilist-search', text],
    queryFn: () => searchAniList(text),
    enabled: enabled && text.length >= 3,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 0,
  });
}

export function useSetAniListLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { providerId: string; slug: string; anilistId: number }) =>
      unwrap(await window.api.invoke('set-anilist-link', params)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['anilist-banner'] });
    },
  });
}

export function useRemoveAniListLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { providerId: string; slug: string }) =>
      unwrap(await window.api.invoke('remove-anilist-link', params)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['anilist-banner'] });
    },
  });
}
