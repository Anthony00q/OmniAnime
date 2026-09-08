export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
export const YOUTUBE_EMBED_APP_ORIGIN = 'https://animeav1.app';
export const YOUTUBE_EMBED_REFERER = `${YOUTUBE_EMBED_APP_ORIGIN}/`;

export type WindowCloseAction = 'allow' | 'hide' | 'confirm-update' | 'confirm-downloads';

export function resolveWindowCloseAction(
  isQuitting: boolean,
  minimizeToTray: boolean,
  hasUpdateInProgress: boolean,
  hasActiveDownloads: boolean,
): WindowCloseAction {
  if (isQuitting) return 'allow';
  if (minimizeToTray) return 'hide';
  if (hasUpdateInProgress) return 'confirm-update';
  if (hasActiveDownloads) return 'confirm-downloads';
  return 'allow';
}

export function applyYouTubeEmbedIdentityHeaders(headers: Record<string, string>): Record<string, string> {
  const nextHeaders = { ...headers };
  const currentReferer = String(nextHeaders.Referer || nextHeaders.referer || '').trim();
  const currentOrigin = String(nextHeaders.Origin || nextHeaders.origin || '').trim();
  const currentUserAgent = String(nextHeaders['User-Agent'] || nextHeaders['user-agent'] || '').trim();

  if (!currentReferer || currentReferer.startsWith('file:') || currentReferer === 'null') {
    nextHeaders.Referer = YOUTUBE_EMBED_REFERER;
  }
  if (!currentOrigin || currentOrigin === 'null' || currentOrigin.startsWith('file:')) {
    nextHeaders.Origin = YOUTUBE_EMBED_APP_ORIGIN;
  }
  if (!currentUserAgent) {
    nextHeaders['User-Agent'] = USER_AGENT;
  }

  return nextHeaders;
}
