import axios from 'axios';
import * as https from 'https';
import {
  ANILIST_API_URL,
  resolveAniListBanner,
  type AniListBannerInput,
  type AniListBannerResult,
  type AniListPost,
} from '../services/providers/AniListService';
import { normalizeAllowedImageUrl } from '../utils/security/networkSecurity';
import { USER_AGENT } from '../utils/windowUtils';

// Fuente del banner persistido en la carpeta del anime.
export const ANILIST_REQUEST_TIMEOUT_MS = 8000;
export const ANILIST_MAX_BYTES = 512 * 1024;

// El match vale para el día; el sin-match caduca pronto por si el fallo fue de red.
const ANILIST_RESULT_TTL_MS = 24 * 60 * 60 * 1000;
const ANILIST_MISS_TTL_MS = 5 * 60 * 1000;

// Reutiliza la conexión con AniList entre consultas.
const anilistAgent = new https.Agent({ keepAlive: true, maxSockets: 8 });

const defaultAniListPost: AniListPost = (body: unknown) =>
  axios
    .post(ANILIST_API_URL, body, {
      headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/json', Accept: 'application/json' },
      timeout: ANILIST_REQUEST_TIMEOUT_MS,
      maxContentLength: ANILIST_MAX_BYTES,
      maxBodyLength: ANILIST_MAX_BYTES,
      maxRedirects: 2,
      httpsAgent: anilistAgent,
    })
    .then((res) => res.data);

export {
  anilistBannerInputFromDetails,
  type AniListBannerInput,
  type AniListBannerSource,
} from '../services/providers/AniListService';

export type AniListFailureKind = 'ratelimit' | 'network' | 'nomatch';

interface ResolvedAniList {
  result: AniListBannerResult | null;
  // null = nada que informar: éxito, o fallo imprevisto sin señal de red.
  failureKind: AniListFailureKind | null;
}

interface AniListCacheEntry {
  value: Promise<ResolvedAniList>;
  expiresAt: number;
}

// Caché por `post`: la app comparte la red real y los stubs de test no se pisan.
const cacheByPost = new WeakMap<AniListPost, Map<string, AniListCacheEntry>>();

function anilistCacheKey(input: AniListBannerInput): string {
  const titles = [input.title, ...(input.alternativeTitles ?? []).slice(0, 3)].map((t) =>
    String(t ?? '')
      .trim()
      .toLowerCase(),
  );
  return JSON.stringify([
    titles,
    String(input.providerYear ?? ''),
    String(input.providerFormat ?? '').toLowerCase(),
    String(input.providerSeason ?? '').toLowerCase(),
    String(input.malId ?? ''),
  ]);
}

async function resolveOnce(input: AniListBannerInput, post: AniListPost): Promise<ResolvedAniList> {
  let sawRateLimit = false;
  let sawNetwork = false;
  const kind = (): AniListFailureKind => (sawRateLimit ? 'ratelimit' : sawNetwork ? 'network' : 'nomatch');
  try {
    const trackingPost = async (body: unknown): Promise<unknown> => {
      try {
        return await post(body);
      } catch (error) {
        const status = (error as { response?: { status?: unknown } } | null | undefined)?.response?.status;
        if (status === 429) sawRateLimit = true;
        else sawNetwork = true;
        throw error;
      }
    };
    const resolved = await resolveAniListBanner(input, trackingPost);
    if (!resolved) return { result: null, failureKind: kind() };
    const banner = resolved.banner ? normalizeAllowedImageUrl(resolved.banner) : null;
    return {
      result: { anilistId: resolved.anilistId, banner, studio: resolved.studio ?? null, titles: resolved.titles },
      failureKind: null,
    };
  } catch {
    return { result: null, failureKind: sawRateLimit || sawNetwork ? kind() : null };
  }
}

// Banner y estudio validados, o null (fail-closed). Caché por input; onFailure
// informa fallos reales y también 'nomatch', para que el llamador decida.
export async function resolveAniListBannerResult(
  input: AniListBannerInput,
  post?: AniListPost,
  onFailure?: (kind: AniListFailureKind) => void,
): Promise<AniListBannerResult | null> {
  const effectivePost = post ?? defaultAniListPost;
  let cache = cacheByPost.get(effectivePost);
  if (!cache) {
    cache = new Map();
    cacheByPost.set(effectivePost, cache);
  }
  const key = anilistCacheKey(input);
  const now = Date.now();
  const hit = cache.get(key);
  const entry: AniListCacheEntry =
    hit && hit.expiresAt > now
      ? hit
      : {
          value: resolveOnce(input, effectivePost),
          expiresAt: Number.POSITIVE_INFINITY,
        };
  if (entry !== hit) {
    cache.set(key, entry);
    entry.value = entry.value.then((settled) => {
      entry.expiresAt = Date.now() + (settled.result ? ANILIST_RESULT_TTL_MS : ANILIST_MISS_TTL_MS);
      return settled;
    });
  }
  const settled = await entry.value;
  if (settled.failureKind) onFailure?.(settled.failureKind);
  return settled.result;
}

// Respuesta de get-anilist-banner: meta, transitorio ante fallo real, o null si no hay match.
export function aniListBannerResponse(
  resolved: AniListBannerResult | null,
  failureKind: AniListFailureKind | null,
): {
  anilistId?: number;
  banner?: string | null;
  studio?: string | null;
  titles?: AniListBannerResult['titles'];
  transientFailure?: boolean;
} | null {
  if (resolved) {
    return {
      anilistId: resolved.anilistId,
      banner: resolved.banner,
      studio: resolved.studio ?? null,
      titles: resolved.titles,
    };
  }
  return failureKind && failureKind !== 'nomatch' ? { transientFailure: true } : null;
}
