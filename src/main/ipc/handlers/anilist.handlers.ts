import { ipcMain } from 'electron';
import { aniListBannerResponse, resolveAniListBannerResult, type AniListFailureKind } from '../../anilistBanner';
import { safeErrorMessage } from '../../../utils/logging/redactLog';
import type { IpcRegistryDependencies } from '../../IpcRegistry';

// Banner y estudio opcionales: ante error o duda devuelve null y la ficha sigue igual.
export function registerAniListHandlers({ writeGlobalLog, scopedLog }: IpcRegistryDependencies): void {
  const fileLog = scopedLog('anilist');
  ipcMain.handle(
    'get-anilist-banner',
    async (
      _,
      payload:
        | string
        | {
            title?: string;
            alternativeTitles?: unknown;
            providerYear?: unknown;
            providerFormat?: unknown;
            providerSeason?: unknown;
            malId?: unknown;
          }
        | null
        | undefined,
    ) => {
      try {
        const raw = typeof payload === 'string' ? { title: payload } : payload || {};
        const title = String(raw.title ?? '');
        const malId = Number(raw.malId);
        const hasMalId = Number.isInteger(malId) && malId > 0;
        if (!title.trim() && !hasMalId) return null;
        const alternativeTitles = Array.isArray(raw.alternativeTitles)
          ? raw.alternativeTitles.filter((t): t is string => typeof t === 'string').slice(0, 3)
          : undefined;
        const providerYear =
          typeof raw.providerYear === 'number' || typeof raw.providerYear === 'string' ? raw.providerYear : undefined;
        const providerFormat = typeof raw.providerFormat === 'string' ? raw.providerFormat : undefined;
        const providerSeason = typeof raw.providerSeason === 'string' ? raw.providerSeason : undefined;
        let failureKind: AniListFailureKind | null = null;
        const resolved = await resolveAniListBannerResult(
          {
            title,
            alternativeTitles,
            providerYear,
            providerFormat,
            providerSeason,
            malId: hasMalId ? malId : null,
          },
          undefined,
          (kind: AniListFailureKind) => {
            failureKind = kind;
            if (kind !== 'nomatch') fileLog.warn(`banner no resuelto (${kind})`);
          },
        );
        return aniListBannerResponse(resolved, failureKind);
      } catch (error) {
        writeGlobalLog(`AniList banner error: ${safeErrorMessage(error)}`);
        return null;
      }
    },
  );
}
