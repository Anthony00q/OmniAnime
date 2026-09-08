export type ProviderId = 'animeav1' | 'jkanime' | string;

export function buildExternalUrl(rawSlug: string | null | undefined, providerId: ProviderId): string | null {
  const cleaned = String(rawSlug || '').trim();
  if (!cleaned) return null;
  const encoded = encodeURIComponent(cleaned);
  if (!encoded) return null;
  return providerId === 'jkanime' ? `https://jkanime.net/${encoded}/` : `https://animeav1.com/media/${encoded}`;
}

export function isAllowedExternalUrl(rawUrl: string | null | undefined): boolean {
  const raw = String(rawUrl || '').trim();
  if (!raw) return false;
  // Reject explicit port (including default 443 which URL normalizes away)
  try {
    const withoutProtocol = raw.replace(/^https:\/\//i, '');
    const hostPortion = withoutProtocol.split('/')[0].split('?')[0].split('#')[0];
    const hostWithoutUserInfo = hostPortion.includes('@') ? (hostPortion.split('@').pop() as string) : hostPortion;
    if (hostWithoutUserInfo.includes(':')) return false;
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
    if (host !== 'animeav1.com' && host !== 'jkanime.net') return false;
    // Ensure pathname starts with / to avoid https://animeav1.com (without slash) bypass? Allow root /
    // URL pathname is always at least '/', so check it exists
    if (!u.pathname.startsWith('/')) return false;
    return true;
  } catch {
    return false;
  }
}
