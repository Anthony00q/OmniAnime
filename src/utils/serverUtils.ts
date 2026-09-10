export const BLOCKED_SERVERS = new Set(['1fichier', 'fichier', 'drive', 'gdrive', 'google drive']);

export const DEFAULT_SERVER_PRIORITY = ['HLS', 'Mega', 'Mediafire', 'MP4Upload'];

export function normalizeServerName(serverRaw: string): string {
  const raw = String(serverRaw || '').trim();
  const s = raw.toLowerCase();
  if (s === 'hls' || s.includes('m3u8')) return 'HLS';
  if (s.includes('mp4upload')) return 'MP4Upload';
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

export const JKANIME_SERVER_PRIORITY = ['Mediafire', 'Mega', 'MP4Upload', 'HLS'];

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
