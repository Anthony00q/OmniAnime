// Modo de visualización del horario: 'grid' (tarjetas de póster, el default) o
// 'list' (agenda). Store en localStorage con el precedente de episode-view.
export type ScheduleViewMode = 'list' | 'grid';

const STORAGE_KEY = 'omnianime:schedule-view';

export function normalizeScheduleView(value: unknown): ScheduleViewMode {
  return value === 'list' ? 'list' : 'grid';
}

export function getScheduleViewMode(): ScheduleViewMode {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return 'grid';
    return normalizeScheduleView(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return 'grid';
  }
}

export function setScheduleViewMode(mode: ScheduleViewMode): void {
  const next = normalizeScheduleView(mode);
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {}
}
