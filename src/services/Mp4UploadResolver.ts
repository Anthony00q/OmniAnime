import axios from 'axios';

// Resolución directa propia de MP4Upload: del embed HTML se extrae
// el fichero `https://<host>.mp4upload.com:<port>/d/<id>/<file>` para
// descargarlo por axios directo (única vía; si falla, al siguiente servidor).
// Nunca lanza.

export const MP4UPLOAD_REFERER = 'https://www.mp4upload.com/';
const MP4UPLOAD_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 10_000;

export interface Mp4UploadResolveResult {
  ok: boolean;
  directUrl?: string;
}

export type Mp4UploadResolveFn = (embedUrl: string) => Promise<Mp4UploadResolveResult>;

// Forma estricta del fichero: host mp4upload, ruta /d/, extensión de vídeo.
export function isMp4UploadFileUrl(candidate: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(String(candidate || '').trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  if (host !== 'mp4upload.com' && !host.endsWith('.mp4upload.com')) return false;
  if (!parsed.pathname.includes('/d/')) return false;
  return /\.(mp4|mkv|avi|flv|webm|m4v|mov)($|\?)/i.test(parsed.pathname);
}

// Capas de extracción, de precisa a amplia. La primera URL válida gana.
export function extractMp4UploadDirectUrl(html: string): string | null {
  const text = String(html || '');
  if (!text) return null;
  const playerSrc = text.match(/player\.src\(\s*\{[^}]{0,800}?src\s*:\s*"([^"]+)"/is);
  if (playerSrc?.[1] && isMp4UploadFileUrl(playerSrc[1])) return playerSrc[1].trim();
  const fileProps = text.matchAll(/\bfile\s*:\s*"([^"]+)"/gi);
  for (const match of fileProps) {
    if (match[1] && isMp4UploadFileUrl(match[1])) return match[1].trim();
  }
  const broad = text.match(/https?:\/\/[a-z0-9.-]*mp4upload\.com(?::\d+)?\/[^\s"'<>\\]+/gi);
  if (broad) {
    for (const candidate of broad) {
      if (isMp4UploadFileUrl(candidate)) return candidate.trim();
    }
  }
  return null;
}

export interface Mp4UploadResolverDeps {
  fetchHtml?: (url: string) => Promise<string>;
  timeoutMs?: number;
}

async function defaultFetchHtml(url: string, timeoutMs: number): Promise<string> {
  const response = await axios.get(url, {
    headers: { 'User-Agent': MP4UPLOAD_USER_AGENT, Referer: MP4UPLOAD_REFERER },
    timeout: timeoutMs,
    responseType: 'text',
    maxRedirects: 5,
    validateStatus: (status) => status >= 200 && status < 300,
  });
  return String(response.data || '');
}

export async function resolveMp4UploadDirect(
  embedUrl: string,
  deps: Mp4UploadResolverDeps = {},
): Promise<Mp4UploadResolveResult> {
  try {
    const clean = String(embedUrl || '').trim();
    if (!/^https?:\/\/(www\.)?mp4upload\.com\//i.test(clean)) return { ok: false };
    const timeoutMs =
      typeof deps.timeoutMs === 'number' && Number.isFinite(deps.timeoutMs) && deps.timeoutMs > 0
        ? Math.min(30_000, deps.timeoutMs)
        : FETCH_TIMEOUT_MS;
    const html = await (deps.fetchHtml ? deps.fetchHtml(clean) : defaultFetchHtml(clean, timeoutMs));
    const directUrl = extractMp4UploadDirectUrl(html);
    if (!directUrl) return { ok: false };
    return { ok: true, directUrl };
  } catch {
    return { ok: false };
  }
}
