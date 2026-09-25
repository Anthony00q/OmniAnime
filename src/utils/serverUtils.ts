export const BLOCKED_SERVERS = new Set(['1fichier', 'fichier', 'drive', 'gdrive', 'google drive']);

export const SERVER_ORDER_ANIMEAV1_DEFAULT = ['Voe', 'Mega', 'MP4Upload'] as const;

export const SERVER_ORDER_JKANIME_DEFAULT = ['Mediafire', 'Mega', 'MP4Upload', 'Voe'] as const;

export const DEFAULT_SERVER_PRIORITY: readonly string[] = SERVER_ORDER_ANIMEAV1_DEFAULT;

export const SERVER_CANDIDATES_ANIMEAV1 = ['Voe', 'Mega', 'MP4Upload', 'HLS'] as const;

export const SERVER_CANDIDATES_JKANIME = ['Mediafire', 'Mega', 'MP4Upload', 'Voe'] as const;

export function sanitizeServerOrderList(raw: unknown, candidates: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const items = Array.isArray(raw) ? raw : [];
  for (const entry of items) {
    if (typeof entry !== 'string') continue;
    const name = entry.trim();
    if (!name || !candidates.includes(name) || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

export function sanitizeServerOrderMap(raw: unknown): { animeav1: string[]; jkanime: string[] } {
  const record = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    animeav1: sanitizeServerOrderList(record.animeav1, SERVER_CANDIDATES_ANIMEAV1),
    jkanime: sanitizeServerOrderList(record.jkanime, SERVER_CANDIDATES_JKANIME),
  };
}

export function resolveServerOrderList(
  stored: unknown,
  fallback: readonly string[],
  candidates: readonly string[],
): string[] {
  if (!Array.isArray(stored)) return [...fallback];
  const cleaned = sanitizeServerOrderList(stored, candidates);
  if (cleaned.length > 0) return cleaned;
  if (stored.length === 0) return [];
  return [...fallback];
}

export function effectiveServerOrder(providerId: string | undefined, stored: unknown): string[] {
  const normalized = String(providerId || '')
    .trim()
    .toLowerCase();
  const map = sanitizeServerOrderMap(stored);
  if (normalized === 'jkanime')
    return resolveServerOrderList(map.jkanime, SERVER_ORDER_JKANIME_DEFAULT, SERVER_CANDIDATES_JKANIME);
  return resolveServerOrderList(map.animeav1, SERVER_ORDER_ANIMEAV1_DEFAULT, SERVER_CANDIDATES_ANIMEAV1);
}

export function normalizeServerName(serverRaw: string): string {
  const raw = String(serverRaw || '').trim();
  const s = raw.toLowerCase();
  if (s === 'hls' || s.includes('m3u8')) return 'HLS';
  if (s.includes('mp4upload')) return 'MP4Upload';
  if (s === 'voe' || s.includes('voe')) return 'Voe';
  if (s.includes('1fichier') || s === 'fichier') return '1fichier';
  if (s.includes('google') || s.includes('gdrive') || s === 'drive') return 'Drive';
  if (s.includes('mega')) return 'Mega';
  return raw || 'Servidor';
}

export function resolveHlsPlaybackUrl(inputUrl: string): string {
  const raw = String(inputUrl || '').trim();
  const match = raw.match(/^https?:\/\/player\.zilla-networks\.com\/play\/([a-f0-9]{32})/i);
  if (!match) return raw;
  return `https://player.zilla-networks.com/m3u8/${match[1]}`;
}

export function isBlockedServer(canonicalServer: string): boolean {
  return BLOCKED_SERVERS.has(String(canonicalServer || '').toLowerCase());
}

export const JKANIME_SERVER_PRIORITY = SERVER_ORDER_JKANIME_DEFAULT;

export function getServerPriorityOrder(providerId?: string): string[] {
  const normalized = String(providerId || '')
    .trim()
    .toLowerCase();
  if (normalized === 'jkanime') return [...JKANIME_SERVER_PRIORITY];
  return [...DEFAULT_SERVER_PRIORITY];
}

export function normalizeMegaUrl(rawUrl: string): string {
  let url = String(rawUrl || '').trim();
  if (!url) return url;
  // mega embed -> file for megajs
  url = url.replace(/^https?:\/\/mega\.nz\/embed\//i, 'https://mega.nz/file/');
  url = url.replace(/^https?:\/\/mega\.co\.nz\/embed\//i, 'https://mega.co.nz/file/');
  url = url.replace(/\/embed\//i, '/file/');
  const legacyMatch = url.match(/^https?:\/\/mega\.(?:nz|co\.nz)\/#!([^!]+)!([^!]+)/i);
  if (legacyMatch) {
    const host = url.includes('mega.co.nz') ? 'https://mega.co.nz' : 'https://mega.nz';
    url = `${host}/file/${legacyMatch[1]}#${legacyMatch[2]}`;
  }
  return url.trim();
}

export function normalizeMp4UploadUrl(rawUrl: string): string {
  let url = String(rawUrl || '').trim();
  if (!url) return url;
  // mp4upload direct -> embed
  const directMatch = url.match(/^https?:\/\/(?:www\.)?mp4upload\.com\/([a-z0-9]+)\/?$/i);
  if (directMatch) {
    const id = directMatch[1];
    if (!id.toLowerCase().startsWith('embed')) {
      return `https://www.mp4upload.com/embed-${id}.html`;
    }
  }
  url = url.replace(/^https?:\/\/(?:www\.)?mp4upload\.com\//i, 'https://www.mp4upload.com/');
  return url.trim();
}

export function providerDownloadReferer(providerId?: string): string {
  if (
    String(providerId || '')
      .trim()
      .toLowerCase() === 'jkanime'
  )
    return 'https://jkanime.net/';
  return 'https://animeav1.com/';
}
