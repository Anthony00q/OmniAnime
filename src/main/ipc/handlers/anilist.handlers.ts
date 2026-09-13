import { ipcMain } from 'electron';
import axios from 'axios';
import { USER_AGENT } from '../../../utils/windowUtils';
import { normalizeAllowedImageUrl } from '../../../utils/networkSecurity';
import { ANILIST_API_URL, resolveAniListBanner } from '../../../services/AniListService';
import type { IpcRegistryDependencies } from '../../IpcRegistry';

// Banner visual opcional: ante error o duda devuelve null y la ficha sigue igual.
export function registerAniListHandlers({ writeGlobalLog }: IpcRegistryDependencies): void {
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
        const resolved = await resolveAniListBanner(
          { title, alternativeTitles, providerYear, providerFormat, providerSeason, malId: hasMalId ? malId : null },
          (body) =>
            axios
              .post(ANILIST_API_URL, body, {
                headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/json', Accept: 'application/json' },
                timeout: 8000,
                maxContentLength: 512 * 1024,
                maxBodyLength: 512 * 1024,
                maxRedirects: 2,
              })
              .then((res) => res.data),
        );
        if (!resolved) return null;
        const banner = normalizeAllowedImageUrl(resolved.banner);
        if (!banner) return null;
        return { anilistId: resolved.anilistId, banner };
      } catch (error) {
        writeGlobalLog(`AniList banner error: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    },
  );
}
