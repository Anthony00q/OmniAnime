import type { LogLevel } from '../services/AppLogger';

export interface LoggingSettings {
  level: LogLevel;
  verbose: boolean;
}

export const DEFAULT_LOGGING_SETTINGS: LoggingSettings = { level: 'info', verbose: false };

const LEVELS: ReadonlySet<string> = new Set(['debug', 'info', 'warn', 'error']);

export function normalizeLoggingSettings(raw: unknown): LoggingSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_LOGGING_SETTINGS };
  const record = raw as Record<string, unknown>;
  const level = typeof record.level === 'string' && LEVELS.has(record.level) ? (record.level as LogLevel) : 'info';
  return { level, verbose: record.verbose === true };
}

export function effectiveMinLevel(settings: LoggingSettings): LogLevel {
  if (settings.verbose) return 'debug';
  return LEVELS.has(settings.level) ? settings.level : 'info';
}
