// Traducción única entre los ids de vista del rail y las rutas del router.

export type ViewId =
  'home' | 'schedule' | 'catalog' | 'details' | 'downloader' | 'history' | 'scanner' | 'player' | 'settings';

export type ViewPath =
  '/' | '/schedule' | '/catalog' | '/anime' | '/downloader' | '/history' | '/scanner' | '/library' | '/settings';

const VIEW_PATHS: Record<ViewId, ViewPath> = {
  home: '/',
  schedule: '/schedule',
  catalog: '/catalog',
  details: '/anime',
  downloader: '/downloader',
  history: '/history',
  scanner: '/scanner',
  player: '/library',
  settings: '/settings',
};

const PATH_VIEWS: Record<string, ViewId> = {
  '/': 'home',
  '/schedule': 'schedule',
  '/catalog': 'catalog',
  '/anime': 'details',
  '/downloader': 'downloader',
  '/history': 'history',
  '/scanner': 'scanner',
  '/library': 'player',
  '/settings': 'settings',
};

function normalizePath(pathname: string): string {
  if (pathname.length <= 1) return '/';
  return pathname.replace(/\/+$/, '');
}

export function viewPath(view: string): ViewPath | null {
  return VIEW_PATHS[view as ViewId] ?? null;
}

export function viewIdFromPath(pathname: string): ViewId | null {
  const path = normalizePath(pathname);
  const direct = PATH_VIEWS[path];
  if (direct) return direct;

  // Los tramos con parámetro (/anime/$id, /settings/$tab) heredan la vista padre.
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 2 && (segments[0] === 'anime' || segments[0] === 'settings')) {
    return segments[0] === 'anime' ? 'details' : 'settings';
  }
  return null;
}
