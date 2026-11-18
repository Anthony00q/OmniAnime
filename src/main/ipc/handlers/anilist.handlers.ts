import { handleIpc } from '../ipcGuard';
import { ok } from '../../../types/api';
import { aniListBannerResponse, defaultAniListPost, type AniListFailureKind } from '../../anilistBanner';
import { invalidateAniLinkCache, resolveAniListWithLink } from '../../anilistLink';
import { fetchAniListCandidates, fetchAniListById } from '../../../services/providers/AniListService';
import { isAllowedImageUrl } from '../../../utils/security/networkSecurity';
import { safeErrorMessage } from '../../../utils/logging/redactLog';
import type { IpcRegistryDependencies } from '../../IpcRegistry';

type BannerPayload =
  | string
  | {
      title?: string;
      alternativeTitles?: unknown;
      providerYear?: unknown;
      providerFormat?: unknown;
      providerSeason?: unknown;
      malId?: unknown;
      providerId?: unknown;
      slug?: unknown;
      persistMatch?: unknown;
      forceRefresh?: unknown;
    }
  | null
  | undefined;

// Banner y estudio opcionales: ante error o duda devuelve null y la ficha sigue igual.
export function registerAniListHandlers({ writeGlobalLog, scopedLog, aniLinkStore }: IpcRegistryDependencies): void {
  const fileLog = scopedLog('anilist');
  handleIpc('get-anilist-banner', async (_, payload: BannerPayload) => {
    try {
      const raw = typeof payload === 'string' ? { title: payload } : payload || {};
      const title = String(raw.title ?? '');
      const malId = Number(raw.malId);
      const hasMalId = Number.isInteger(malId) && malId > 0;
      if (!title.trim() && !hasMalId) return ok(null);
      const alternativeTitles = Array.isArray(raw.alternativeTitles)
        ? raw.alternativeTitles.filter((t): t is string => typeof t === 'string').slice(0, 3)
        : undefined;
      const providerYear =
        typeof raw.providerYear === 'number' || typeof raw.providerYear === 'string' ? raw.providerYear : undefined;
      const providerFormat = typeof raw.providerFormat === 'string' ? raw.providerFormat : undefined;
      const providerSeason = typeof raw.providerSeason === 'string' ? raw.providerSeason : undefined;
      const providerId = typeof raw.providerId === 'string' ? raw.providerId.trim() : '';
      const slug = typeof raw.slug === 'string' ? raw.slug.trim() : '';
      let failureKind: AniListFailureKind | null = null;
      const resolved = await resolveAniListWithLink(
        {
          title,
          alternativeTitles,
          providerYear,
          providerFormat,
          providerSeason,
          malId: hasMalId ? malId : null,
          providerId: providerId || null,
          slug: slug || null,
          persistMatch: raw.persistMatch !== false,
          forceRefresh: raw.forceRefresh === true,
        },
        aniLinkStore,
        undefined,
        (kind: AniListFailureKind) => {
          failureKind = kind;
          if (kind !== 'nomatch') fileLog.warn(`banner no resuelto (${kind})`);
        },
      );
      const link = providerId && slug ? aniLinkStore.getAniLink(providerId, slug) : null;
      return ok(aniListBannerResponse(resolved, failureKind, link));
    } catch (error) {
      writeGlobalLog(`AniList banner error: ${safeErrorMessage(error)}`);
      return ok({ transientFailure: true });
    }
  });

  handleIpc('search-anilist', async (_, payload: string | { query?: unknown } | null | undefined) => {
    try {
      const query = String(typeof payload === 'string' ? payload : (payload?.query ?? '')).trim();
      if (!query) return ok([]);
      const direct = query.match(/^(?:https:\/\/anilist\.co\/anime\/)?(\d+)(?:\/[^?#]*)?\/?$/i);
      const entry = direct ? await fetchAniListById(Number(direct[1]), defaultAniListPost, true) : null;
      const candidates = direct
        ? entry
          ? [entry]
          : []
        : await fetchAniListCandidates([query], defaultAniListPost, 15);
      return ok(
        candidates.map((c) => ({
          id: c.id,
          romaji: c.romaji ?? null,
          english: c.english ?? null,
          format: c.format ?? null,
          startYear: c.startYear ?? null,
          cover: typeof c.coverImage === 'string' && isAllowedImageUrl(c.coverImage) ? c.coverImage : null,
          banner: typeof c.bannerImage === 'string' && isAllowedImageUrl(c.bannerImage) ? c.bannerImage : null,
          native: c.native ?? null,
          episodes: c.episodes ?? null,
        })),
      );
    } catch (error) {
      writeGlobalLog(`AniList search error: ${safeErrorMessage(error)}`);
      return ok({ transientFailure: true });
    }
  });

  handleIpc(
    'set-anilist-link',
    async (_, payload: { providerId?: unknown; slug?: unknown; anilistId?: unknown } | null | undefined) => {
      try {
        const providerId = String(payload?.providerId ?? '').trim();
        const slug = String(payload?.slug ?? '').trim();
        const anilistId = Number(payload?.anilistId);
        if (
          !['animeav1', 'jkanime'].includes(providerId) ||
          !slug ||
          !Number.isSafeInteger(anilistId) ||
          anilistId <= 0
        )
          return ok(false);
        const candidate = await fetchAniListById(anilistId, defaultAniListPost, true);
        if (!candidate) return ok(false);
        aniLinkStore.setAniLink(providerId, slug, anilistId, 'manual');
        invalidateAniLinkCache(providerId, slug);
        return ok(true);
      } catch (error) {
        writeGlobalLog(`AniList link error: ${safeErrorMessage(error)}`);
        return ok(false);
      }
    },
  );

  handleIpc('remove-anilist-link', async (_, payload: { providerId?: unknown; slug?: unknown } | null | undefined) => {
    try {
      const providerId = String(payload?.providerId ?? '').trim();
      const slug = String(payload?.slug ?? '').trim();
      if (!providerId || !slug) return ok(false);
      aniLinkStore.removeAniLink(providerId, slug);
      invalidateAniLinkCache(providerId, slug);
      return ok(true);
    } catch (error) {
      writeGlobalLog(`AniList link error: ${safeErrorMessage(error)}`);
      return ok(false);
    }
  });
}
