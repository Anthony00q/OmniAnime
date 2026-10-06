import type { ScheduleEntry } from '@/types/anime';

export const WEEKDAY_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// Día ISO de la semana en hora local: 1=Lunes … 7=Domingo.
export function isoWeekday(date: Date): number {
  return ((date.getDay() + 6) % 7) + 1;
}

export function todayIsoWeekday(now: Date = new Date()): number {
  return isoWeekday(now);
}

function parseTime(time: string | null | undefined): [number, number] | null {
  const match = String(time || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return [hours, minutes];
}

export type ScheduleSlotState = 'emitido' | 'proximo' | 'retrasado' | 'concluido';

// Reglas de la fuente: emitido solo si publicó hoy, retrasado si hace más de
// una semana que no publican, concluido si la fuente lo marca.
export function scheduleEntryState(
  entry: Pick<ScheduleEntry, 'updatedAt' | 'finished'>,
  nowMs: number,
): ScheduleSlotState {
  if (entry.finished) return 'concluido';
  const at = entry.updatedAt ? Date.parse(entry.updatedAt) : NaN;
  if (!Number.isFinite(at)) return 'proximo';
  const hours = (nowMs - at) / (60 * 60 * 1000);
  if (hours < 24 && isoWeekday(new Date(at)) === isoWeekday(new Date(nowMs))) return 'emitido';
  if (hours > 24 * 7) return 'retrasado';
  return 'proximo';
}

export type ScheduleLabelTone = 'success' | 'danger' | 'neutral';

export interface ScheduleRowLabel {
  // Palabra de estado (Emitido/Retrasado/Concluido) o null si solo hay hora.
  state: string | null;
  time: string | null;
  text: string;
  tone: ScheduleLabelTone;
}

// Etiqueta única de la fila con la forma de la fuente: el estado pegado a la
// hora. `state`/`time` van por separado para poder pintarlos con contraste
// propio cuando la etiqueta cae sobre un póster.
export function scheduleRowLabel(
  entry: Pick<ScheduleEntry, 'time'>,
  state: ScheduleSlotState,
): ScheduleRowLabel | null {
  if (entry.time) {
    if (state === 'emitido') {
      return { state: 'Emitido', time: entry.time, text: `Emitido · ${entry.time}`, tone: 'success' };
    }
    if (state === 'retrasado') {
      return { state: 'Retrasado', time: entry.time, text: `Retrasado · ${entry.time}`, tone: 'danger' };
    }
    return { state: null, time: entry.time, text: entry.time, tone: 'neutral' };
  }
  if (state === 'concluido') return { state: 'Concluido', time: null, text: 'Concluido', tone: 'neutral' };
  return null;
}

// Con hora primero (ascendente); sin hora al final en su orden de origen.
export function sortDayEntries(entries: ScheduleEntry[]): ScheduleEntry[] {
  const timed: Array<{ entry: ScheduleEntry; minutes: number }> = [];
  const untimed: ScheduleEntry[] = [];
  for (const entry of entries) {
    const parsed = parseTime(entry.time);
    if (parsed) timed.push({ entry, minutes: parsed[0] * 60 + parsed[1] });
    else untimed.push(entry);
  }
  timed.sort((a, b) => a.minutes - b.minutes);
  return [...timed.map((item) => item.entry), ...untimed];
}

export function visibleScheduleEntries(entries: ScheduleEntry[]): ScheduleEntry[] {
  return entries.filter((entry) => !entry.finished);
}

function timeToMinutes(time: string | null | undefined): number | null {
  const parsed = parseTime(time);
  return parsed ? parsed[0] * 60 + parsed[1] : null;
}

// Fechas de la semana ISO del día dado, en hora local: índice 0 = Lunes.
export function weekDates(now: Date = new Date()): Date[] {
  const backToMonday = isoWeekday(now) - 1;
  return Array.from({ length: 7 }, (_, idx) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    date.setDate(date.getDate() - backToMonday + idx);
    return date;
  });
}

export interface ScheduleTimeGroup {
  // Hora "HH:mm" del grupo; null en el bloque sin hora publicada.
  time: string | null;
  // Minutos desde medianoche del grupo; null sin hora.
  minutes: number | null;
  entries: ScheduleEntry[];
}

// Junta por franja horaria aunque las iguales no vengan seguidas; las sin hora van todas juntas al final.
export function groupDayEntriesByTime(entries: ScheduleEntry[]): ScheduleTimeGroup[] {
  const groups: ScheduleTimeGroup[] = [];
  const byMinutes = new Map<number, ScheduleTimeGroup>();
  const untimed: ScheduleEntry[] = [];
  for (const entry of entries) {
    const minutes = timeToMinutes(entry.time);
    if (minutes === null) {
      untimed.push(entry);
      continue;
    }
    const group = byMinutes.get(minutes);
    if (group) group.entries.push(entry);
    else {
      const created: ScheduleTimeGroup = { time: entry.time, minutes, entries: [entry] };
      byMinutes.set(minutes, created);
      groups.push(created);
    }
  }
  if (untimed.length > 0) groups.push({ time: null, minutes: null, entries: untimed });
  return groups;
}

// La próxima en emitir: primera con hora por delante y sin publicar; emitido, retrasado o sin hora no cuentan.
export function nextUpcomingEntry(entries: ScheduleEntry[], nowMs: number): ScheduleEntry | null {
  const now = new Date(nowMs);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  for (const entry of entries) {
    const minutes = timeToMinutes(entry.time);
    if (minutes === null) continue;
    if (minutes > nowMinutes && scheduleEntryState(entry, nowMs) === 'proximo') return entry;
  }
  return null;
}

// La marca "ahora" va antes de la primera franja que aún no suena; -1 si ya no queda nada por delante.
export function nowMarkerIndex(groups: ScheduleTimeGroup[], nowMs: number): number {
  const now = new Date(nowMs);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  for (let idx = 0; idx < groups.length; idx++) {
    const minutes = groups[idx].minutes;
    if (minutes !== null && minutes > nowMinutes) return idx;
  }
  return -1;
}
