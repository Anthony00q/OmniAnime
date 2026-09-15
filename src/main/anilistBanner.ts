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

// Banner y estudio validados para la ficha, o null. Fail-closed: null ante
// error, offline o sin match. Sin reintentos; el llamador sigue sin ellos.
export async function resolveAniListBannerResult(
  input: AniListBannerInput,
  post?: (body: unknown) => Promise<unknown>,
): Promise<AniListBannerResult | null> {
  try {
    const postFn =
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
    const resolved = await resolveAniListBanner(input, postFn);
    if (!resolved) return null;
    const banner = normalizeAllowedImageUrl(resolved.banner);
    if (!banner) return null;
    return { anilistId: resolved.anilistId, banner, studio: resolved.studio ?? null };
  } catch {
    return null;
  }
}
