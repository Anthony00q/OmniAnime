import {
  bannerResultFrom,
  fetchAniListById,
  type AniListBannerInput,
  type AniListBannerResult,
  type AniListPost,
} from '../services/providers/AniListService';
import type { AniLinkRecord, AniLinkSource } from '../services/persistence/AniLinkRows';
import { defaultAniListPost, resolveAniListBannerResult, type AniListFailureKind } from './anilistBanner';

export interface AniLinkStore {
  getAniLink(providerId: string, slug: string): AniLinkRecord | null;
  setAniLink(providerId: string, slug: string, anilistId: number, source: AniLinkSource): void;
  removeAniLink(providerId: string, slug: string): void;
}

const LINK_RESULT_TTL_MS = 24 * 60 * 60 * 1000;

interface LinkCacheEntry {
  value: Promise<AniListBannerResult | null>;
  expiresAt: number;
}

const cacheByPost = new WeakMap<AniListPost, Map<string, LinkCacheEntry>>();

function linkCacheKey(providerId: string, slug: string): string {
  return `${providerId.toLowerCase()}\u0000${slug.toLowerCase()}`;
}

export function invalidateAniLinkCache(providerId: string, slug: string, post?: AniListPost): void {
  const entries = cacheByPost.get(post ?? defaultAniListPost);
  entries?.delete(linkCacheKey(providerId, slug));
}

export async function resolveAniListWithLink(
  input: AniListBannerInput,
  store: AniLinkStore | null,
  post?: AniListPost,
  onFailure?: (kind: AniListFailureKind) => void,
): Promise<AniListBannerResult | null> {
  const providerId = String(input.providerId ?? '').trim();
  const slug = String(input.slug ?? '').trim();
  const hasKey = !!store && !!providerId && !!slug;
  const effectivePost = post ?? defaultAniListPost;

  if (hasKey && store) {
    const link = store.getAniLink(providerId, slug);
    if (link) {
      try {
        const resolved = await resolveLinkHit(link.anilistId, providerId, slug, effectivePost);
        if (resolved) return resolved;
      } catch (error) {
        const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
        onFailure?.(status === 429 ? 'ratelimit' : 'network');
        return null;
      }
    }
  }

  const resolved = await resolveAniListBannerResult(input, post, onFailure);
  if (resolved && hasKey && store) {
    store.setAniLink(providerId, slug, resolved.anilistId, 'auto');
    if (store.getAniLink(providerId, slug)?.anilistId === resolved.anilistId) {
      cacheByPost.get(effectivePost)?.set(linkCacheKey(providerId, slug), {
        value: Promise.resolve(resolved),
        expiresAt: Date.now() + LINK_RESULT_TTL_MS,
      });
    }
  }
  return resolved;
}

async function resolveLinkHit(
  anilistId: number,
  providerId: string,
  slug: string,
  post: AniListPost,
): Promise<AniListBannerResult | null> {
  let cache = cacheByPost.get(post);
  if (!cache) {
    cache = new Map();
    cacheByPost.set(post, cache);
  }
  const key = linkCacheKey(providerId, slug);
  const now = Date.now();
  const hit = cache.get(key);
  const entry: LinkCacheEntry =
    hit && hit.expiresAt > now
      ? hit
      : {
          value: (async () => {
            let failure: unknown;
            const candidate = await fetchAniListById(anilistId, async (body) => {
              try {
                const response = await post(body);
                const data = (response as { data?: { Media?: unknown } } | null)?.data;
                if (!data || !Object.hasOwn(data, 'Media')) throw new Error('anilist-transient');
                return response;
              } catch (error) {
                failure = error;
                throw error;
              }
            });
            if (failure) throw failure;
            return candidate ? bannerResultFrom(candidate) : null;
          })(),
          expiresAt: Number.POSITIVE_INFINITY,
        };
  if (entry !== hit) {
    cache.set(key, entry);
    entry.value = entry.value.then(
      (settled) => {
        entry.expiresAt = settled ? Date.now() + LINK_RESULT_TTL_MS : 0;
        return settled;
      },
      (error: unknown) => {
        entry.expiresAt = 0;
        throw error;
      },
    );
  }
  return entry.value;
}
