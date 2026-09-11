import { redactLogText, type LogLevel } from './redactLog';
import { MAX_SESSION_FILES, SESSION_FILE_RE } from './sessionFiles';

export {
  APP_LOG_FILENAME,
  SESSION_BACKUP_SUFFIX,
  SESSION_FILE_RE,
  MAX_SESSION_FILES,
  buildSessionFilename,
  buildSessionHeaderText,
  isKnownLogFile,
  isSessionBackupFile,
  backupBaseName,
  type SessionHeaderInfo,
} from './sessionFiles';

// Lectura acotada del visor: colas por fichero y total para no bloquear main.
export const LOG_VIEW_MAX_FILES = 20;
export const LOG_VIEW_MAX_BYTES_PER_FILE = 256 * 1024;
export const LOG_VIEW_MAX_TOTAL_BYTES = 5 * 1024 * 1024;

export interface LogPageEntry {
  ts: string;
  level: LogLevel | 'session';
  scope: string;
  text: string;
  file?: string;
}

export function listSessionFiles(names: string[]): string[] {
  return names.filter((n) => SESSION_FILE_RE.test(n)).sort();
}

export function pruneSessionFiles(names: string[], keep = MAX_SESSION_FILES): { keep: string[]; remove: string[] } {
  const sessions = listSessionFiles(names);
  if (sessions.length <= keep) return { keep: sessions, remove: [] };
  return { keep: sessions.slice(sessions.length - keep), remove: sessions.slice(0, sessions.length - keep) };
}

export interface LogPageFilters {
  level?: LogLevel | 'all';
  scope?: string;
  query?: string;
}

const LEVEL_TAG: Record<LogLevel, string> = {
  debug: '[DEBUG]',
  info: '[INFO]',
  warn: '[WARN]',
  error: '[ERROR]',
};

// Particion por cabecera "[ISO ...]": el mensaje puede contener lineas en
// blanco (stacks) sin fragmentar la entrada. Fallback al split anterior si
// el texto no trae cabeceras con timestamp.
const HEADER_SPLIT_RE = /(?=^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/m;

export function splitLogBlocks(raw: string): string[] {
  if (!raw) return [];
  const parts = HEADER_SPLIT_RE.test(raw) ? raw.split(HEADER_SPLIT_RE) : raw.split(/\n\s*\n/);
  const out: string[] = [];
  for (const part of parts) {
    const text = part.trim();
    if (text) out.push(text);
  }
  return out;
}

const LEVEL_FROM_TAG: Record<string, LogLevel> = { DEBUG: 'debug', INFO: 'info', WARN: 'warn', ERROR: 'error' };

export function parseLogEntries(raw: string, file?: string): LogPageEntry[] {
  const entries: LogPageEntry[] = [];
  for (const text of splitLogBlocks(raw)) {
    const firstLine = text.split('\n')[0] || '';
    const ts = firstLine.match(/^\[([^\]]+)\]/)?.[1] || '';
    const rest = firstLine.replace(/^\[[^\]]+\]\s*/, '');
    let level: LogPageEntry['level'] = 'info';
    let scope = 'app';
    if (/^SESSION\b/.test(rest)) {
      level = 'session';
    } else {
      const tag = rest.match(/^\[([A-Za-z]+)\]/)?.[1];
      if (tag && LEVEL_FROM_TAG[tag.toUpperCase()]) {
        level = LEVEL_FROM_TAG[tag.toUpperCase()];
        const after = rest.slice(tag.length + 2).trim();
        const scopeMatch = after.match(/^\[([A-Za-z][A-Za-z0-9_-]*)\]/)?.[1];
        if (scopeMatch) scope = scopeMatch.toLowerCase();
      } else if (rest.includes('BACKEND_ERROR') || rest.includes('FRONTEND_ERROR')) {
        level = 'error';
      } else {
        for (const [name, tagText] of Object.entries(LEVEL_TAG)) {
          if (firstLine.includes(tagText)) {
            level = name as LogLevel;
            break;
          }
        }
      }
    }
    entries.push(file ? { ts, level, scope, text, file } : { ts, level, scope, text });
  }
  return entries;
}

export function filterLogEntries(entries: LogPageEntry[], filters: LogPageFilters): LogPageEntry[] {
  const query = (filters.query || '').trim().toLowerCase();
  return entries.filter((e) => {
    if (filters.level && filters.level !== 'all' && e.level !== filters.level) {
      if (!(filters.level === 'error' && (e.text.includes('BACKEND_ERROR') || e.text.includes('FRONTEND_ERROR')))) {
        return false;
      }
    }
    if (filters.scope && filters.scope !== 'all' && e.scope !== filters.scope) return false;
    if (query && !e.text.toLowerCase().includes(query)) return false;
    return true;
  });
}

export interface LogDeleteRules {
  now: number;
  sessionStart: string;
  minAgeMs?: number;
}

export const LOG_ENTRY_MAX_CHARS = 2000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function capEntryText(text: string): string {
  return text.length > LOG_ENTRY_MAX_CHARS ? text.slice(0, LOG_ENTRY_MAX_CHARS) + '…[recortado]' : text;
}

function timestampMs(ts: string): number | null {
  if (!ts) return null;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : null;
}

export function isDeletableEntry(ts: string, rules: LogDeleteRules): boolean {
  const t = timestampMs(ts);
  if (t === null) return false;
  if (rules.now - t < (rules.minAgeMs ?? DAY_MS)) return false;
  const session = timestampMs(rules.sessionStart);
  if (session !== null && t >= session) return false;
  return true;
}

export function removeLogEntries(
  raw: string,
  targets: string[],
  rules: LogDeleteRules,
  toViewerText: (text: string) => string = (text) => redactLogText(capEntryText(text)),
): { kept: string; deleted: number; skipped: number } {
  // Por contenido: los duplicados identicos son indistinguibles y se borran
  // juntos al seleccionar uno (suite: "borra duplicados identicos").
  const wanted = new Set(targets);
  const keptBlocks: string[] = [];
  let deleted = 0;
  let skipped = 0;
  for (const block of splitLogBlocks(raw)) {
    if (!wanted.has(toViewerText(block))) {
      keptBlocks.push(block);
      continue;
    }
    const ts = block.split('\n')[0]?.match(/^\[([^\]]+)\]/)?.[1] || '';
    if (isDeletableEntry(ts, rules)) deleted += 1;
    else {
      skipped += 1;
      keptBlocks.push(block);
    }
  }
  return { kept: keptBlocks.length > 0 ? keptBlocks.join('\n\n') + '\n' : '', deleted, skipped };
}

export function filterSessionOnly(entries: LogPageEntry[], sessionStart: string): LogPageEntry[] {
  const start = timestampMs(sessionStart);
  if (start === null) return entries;
  return entries.filter((e) => {
    const t = timestampMs(e.ts);
    return t === null || t >= start;
  });
}

export interface LogSource {
  name: string;
  raw: string;
}

export interface CollectLogSourcesOptions {
  maxFiles?: number;
  maxBytesPerFile?: number;
  maxTotalBytes?: number;
  includeBackups?: boolean;
}

export interface LogSelection {
  level?: unknown;
  scope?: unknown;
  query?: unknown;
  sessionOnly?: unknown;
}

const SELECT_LEVELS: ReadonlySet<string> = new Set(['all', 'debug', 'info', 'warn', 'error']);

export function applyLogSelection(
  entries: LogPageEntry[],
  selection: LogSelection,
  sessionStart: string,
): LogPageEntry[] {
  const level =
    typeof selection.level === 'string' && SELECT_LEVELS.has(selection.level)
      ? (selection.level as LogLevel | 'all')
      : 'all';
  const scopeRaw = typeof selection.scope === 'string' ? selection.scope.trim().toLowerCase().slice(0, 32) : 'all';
  const scope = scopeRaw === '' || scopeRaw === 'all' || !/^[a-z:]+$/.test(scopeRaw) ? 'all' : scopeRaw;
  const query = typeof selection.query === 'string' ? selection.query.slice(0, 200) : '';
  const filtered = filterLogEntries(entries, { level, scope, query });
  if (selection.sessionOnly === true) return filterSessionOnly(filtered, sessionStart);
  return filtered;
}

export function selectLogEntries(raw: string, selection: LogSelection, sessionStart: string): LogPageEntry[] {
  return applyLogSelection(parseLogEntries(raw), selection, sessionStart);
}

export function selectLogEntriesFromSources(
  sources: LogSource[],
  selection: LogSelection,
  sessionStart: string,
): LogPageEntry[] {
  const entries: LogPageEntry[] = [];
  for (const source of sources) {
    for (const entry of parseLogEntries(source.raw, source.name)) entries.push(entry);
  }
  return applyLogSelection(entries, selection, sessionStart);
}

export function paginateLogEntries(
  entries: LogPageEntry[],
  cursor: number,
  limit: number,
): { page: LogPageEntry[]; nextCursor: number | null; total: number } {
  const safeLimit = Math.min(500, Math.max(1, Math.floor(limit) || 50));
  const safeCursor = Math.max(0, Math.floor(cursor) || 0);
  const page = entries.slice(safeCursor, safeCursor + safeLimit);
  const next = safeCursor + safeLimit;
  return { page, nextCursor: next < entries.length ? next : null, total: entries.length };
}
