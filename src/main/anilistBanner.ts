import axios from 'axios';
import * as https from 'https';
import {
  ANILIST_API_URL,
  resolveAniListBanner,
  type AniListBannerInput,
  type AniListBannerResult,
} from '../services/AniListService';
import { normalizeAllowedImageUrl } from '../utils/networkSecurity';
import { USER_AGENT } from '../utils/windowUtils';

// Fuente del banner persistido en la carpeta del anime.
export const ANILIST_REQUEST_TIMEOUT_MS = 8000;
export const ANILIST_MAX_BYTES = 512 * 1024;

// Reutiliza la conexión con AniList entre consultas.
const anilistAgent = new https.Agent({ keepAlive: true, maxSockets: 8 });

export {
  anilistBannerInputFromDetails,
  type AniListBannerInput,
  type AniListBannerSource,
} from '../services/AniListService';

export type AniListFailureKind = 'ratelimit' | 'network' | 'nomatch';

// Banner y estudio validados para la ficha, o null. Fail-closed: null ante
// error, offline o sin match. Sin reintentos; el llamador sigue sin ellos.
// onFailure solo informa fallos reales (límite/red); el sin-match es
// el caso normal y queda en silencio.
export async function resolveAniListBannerResult(
  input: AniListBannerInput,
  post?: (body: unknown) => Promise<unknown>,
  onFailure?: (kind: AniListFailureKind) => void,
): Promise<AniListBannerResult | null> {
  let sawRateLimit = false;
  let sawNetwork = false;
  const report = (): void => {
    onFailure?.(sawRateLimit ? 'ratelimit' : sawNetwork ? 'network' : 'nomatch');
  };
  try {
    const base =
      post ??
      ((body: unknown) =>
        axios
          .post(ANILIST_API_URL, body, {
            headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/json', Accept: 'application/json' },
            timeout: ANILIST_REQUEST_TIMEOUT_MS,
            maxContentLength: ANILIST_MAX_BYTES,
            maxBodyLength: ANILIST_MAX_BYTES,
            maxRedirects: 2,
            httpsAgent: anilistAgent,
          })
          .then((res) => res.data));
    const trackingPost = async (body: unknown): Promise<unknown> => {
      try {
        return await base(body);
      } catch (error) {
        const status = (error as { response?: { status?: unknown } } | null | undefined)?.response?.status;
        if (status === 429) sawRateLimit = true;
        else sawNetwork = true;
        throw error;
      }
    };
    const resolved = await resolveAniListBanner(input, trackingPost);
    if (!resolved) {
      report();
      return null;
    }
    const banner = normalizeAllowedImageUrl(resolved.banner);
    if (!banner) {
      report();
      return null;
    }
    return { anilistId: resolved.anilistId, banner, studio: resolved.studio ?? null };
  } catch {
    if (sawRateLimit || sawNetwork) report();
    return null;
  }
}
