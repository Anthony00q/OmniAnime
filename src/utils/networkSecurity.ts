const ALLOWED_IMAGE_HOSTS = new Set(['cdn.animeav1.com', 'cdn.jkdesa.com']);

export function isAllowedImageUrl(rawUrl: string): boolean {
  try {
    const url = new URL(String(rawUrl || '').trim());
    return url.protocol === 'https:' && ALLOWED_IMAGE_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function normalizeAllowedImageUrl(rawUrl: string, baseUrl?: string): string {
  try {
    const normalized = new URL(String(rawUrl || '').trim(), baseUrl).href;
    return isAllowedImageUrl(normalized) ? normalized : '';
  } catch {
    return '';
  }
}

export function assertAllowedImageRedirect(options: { protocol?: string; hostname?: string; path?: string }): void {
  const protocol = options.protocol || 'https:';
  const hostname = options.hostname || '';
  const redirectUrl = `${protocol}//${hostname}${options.path || '/'}`;
  if (!isAllowedImageUrl(redirectUrl)) {
    throw new Error('Redireccion de imagen no permitida.');
  }
}
