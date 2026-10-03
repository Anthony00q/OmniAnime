export type ProviderId = 'animeav1' | 'jkanime' | string;

// Origen del repositorio; debe coincidir con `repository.url` de package.json.
const REPOSITORY_RELEASES_URL = 'https://github.com/Anthony00q/OmniAnime/releases';

export function buildExternalUrl(rawSlug: string | null | undefined, providerId: ProviderId): string | null {
  const cleaned = String(rawSlug || '').trim();
  if (!cleaned) return null;
  const encoded = encodeURIComponent(cleaned);
  if (!encoded) return null;
  return providerId === 'jkanime' ? `https://jkanime.net/${encoded}/` : `https://animeav1.com/media/${encoded}`;
}

export function buildAniListUrl(rawId: number | string | null | undefined): string | null {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return `https://anilist.co/anime/${id}`;
}

export function buildReleasePageUrl(version: string | null | undefined): string | null {
  const cleaned = String(version || '')
    .trim()
    .replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(cleaned)) return null;
  return `${REPOSITORY_RELEASES_URL}/tag/v${cleaned}`;
}

// Un puerto explícito (incluido el 443 que normaliza la URL) delata trampa:
// se detecta sobre la cruda antes de parsear.
function hasExplicitPort(raw: string): boolean {
  const withoutProtocol = raw.replace(/^https:\/\//i, '');
  const hostPortion = withoutProtocol.split('/')[0].split('?')[0].split('#')[0];
  const hostWithoutUserInfo = hostPortion.includes('@') ? (hostPortion.split('@').pop() as string) : hostPortion;
  return hostWithoutUserInfo.includes(':');
}

export function isAllowedExternalUrl(rawUrl: string | null | undefined): boolean {
  const raw = String(rawUrl || '').trim();
  if (!raw) return false;
  // Reject explicit port (including default 443 which URL normalizes away)
  try {
    if (hasExplicitPort(raw)) return false;
  } catch {
    return false;
  }
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    if (u.port !== '') return false;
    if (u.username !== '' || u.password !== '') return false;
    const host = u.hostname.toLowerCase();
    // Strict hostname match, no subdomains
    if (host !== 'animeav1.com' && host !== 'jkanime.net' && host !== 'anilist.co') return false;
    // Ensure pathname starts with / to avoid https://animeav1.com (without slash) bypass? Allow root /
    // URL pathname is always at least '/', so check it exists
    if (!u.pathname.startsWith('/')) return false;
    return true;
  } catch {
    return false;
  }
}

// Puerta aparte para enlaces del changelog: cualquier dominio público vale,
// pero sin localhost, IPs, `.local` ni host de un solo nivel. La de
// proveedores no se relaja.
export function isAllowedChangelogUrl(rawUrl: string | null | undefined): boolean {
  const raw = String(rawUrl || '').trim();
  if (!raw) return false;
  try {
    if (hasExplicitPort(raw)) return false;
  } catch {
    return false;
  }
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    if (u.port !== '') return false;
    if (u.username !== '' || u.password !== '') return false;
    const host = u.hostname.toLowerCase().replace(/\.$/, '');
    if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
    if (host.startsWith('[') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
    if (!host.includes('.')) return false;
    return true;
  } catch {
    return false;
  }
}
