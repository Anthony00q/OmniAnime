export const APP_LOG_FILENAME = 'app.log';
export const APP_ERROR_LOG_FILENAME = 'app_errors.log';
export const SESSION_FILE_RE = /^sesion-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.log$/;
export const MAX_SESSION_FILES = 20;

export function isKnownLogFile(name: string): boolean {
  if (name === APP_LOG_FILENAME || name === APP_ERROR_LOG_FILENAME) return true;
  if (name.includes('/') || name.includes('\\')) return false;
  return SESSION_FILE_RE.test(name);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function buildSessionFilename(date: Date): string {
  return (
    `sesion-${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` +
    `_${pad2(date.getHours())}-${pad2(date.getMinutes())}-${pad2(date.getSeconds())}.log`
  );
}

export function listSessionFiles(names: string[]): string[] {
  return names.filter((n) => SESSION_FILE_RE.test(n)).sort();
}

export function pruneSessionFiles(names: string[], keep = MAX_SESSION_FILES): { keep: string[]; remove: string[] } {
  const sessions = listSessionFiles(names);
  if (sessions.length <= keep) return { keep: sessions, remove: [] };
  return { keep: sessions.slice(sessions.length - keep), remove: sessions.slice(0, sessions.length - keep) };
}

export interface SessionHeaderInfo {
  startedAt: string;
  version: string;
  electron?: string;
  node?: string;
  platform?: string;
  arch?: string;
  userData?: string;
}

export function buildSessionHeaderText(info: SessionHeaderInfo): string {
  const lines = [
    `[${info.startedAt}] SESSION: v=${info.version} ${info.platform || '?'} ${info.arch || ''}`.trim(),
    `App v${info.version} · Electron ${info.electron || '?'} · Node ${info.node || '?'} · ${info.platform || '?'} ${info.arch || ''}`.trim(),
    `Arrancado: ${info.startedAt}`,
  ];
  if (info.userData) lines.push(`userData: ${info.userData}`);
  return lines.join('\n');
}
