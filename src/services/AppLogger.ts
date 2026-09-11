import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { RuntimeDirectories } from './RuntimeDirectories';
import {
  MAX_SESSION_FILES,
  buildSessionFilename,
  buildSessionHeaderText,
  pruneSessionFiles,
} from '../utils/sessionFiles';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogScope =
  | 'app'
  | 'queue'
  | 'download'
  | 'provider'
  | 'db'
  | 'settings'
  | 'window'
  | 'splash'
  | 'protocol'
  | 'ui'
  | 'ipc'
  | 'updater';

export interface AppLogContext {
  provider?: string;
  queueId?: string;
  episode?: number | string;
  server?: string;
  version?: string;
  scope?: LogScope;
}

export interface AppLoggerOptions {
  maxBytes?: number;
  appVersion?: string;
  homeDir?: string;
  minLevel?: LogLevel;
}

export interface ScopedLogger {
  debug(message: unknown, context?: AppLogContext): void;
  info(message: unknown, context?: AppLogContext): void;
  warn(message: unknown, context?: AppLogContext): void;
  error(message: unknown, context?: AppLogContext): void;
}

const noop = (): void => {};
export const noopScopedLogger: ScopedLogger = { debug: noop, info: noop, warn: noop, error: noop };

export { APP_LOG_FILENAME } from '../utils/sessionFiles';
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const MAX_SINGLE_WRITE = 20000;

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function redactLogText(text: string, homeDir = os.homedir()): string {
  if (!text) return text;
  let out = text;
  if (homeDir) {
    const home = homeDir.replace(/[\\/]+$/, '');
    if (home) out = out.replace(new RegExp(escapeRegExp(home), 'gi'), '~');
  }
  out = out.replace(/[A-Za-z]:\\Users\\[^\\/:*?"<>|\s]+/gi, '~');
  out = out.replace(/\/Users\/[^/\s:]+/g, '~');
  out = out.replace(
    /(api[_-]?key|token|bearer|authorization|client[_-]?secret|password|passwd)\s*[:=]\s*\S+/gi,
    '$1=[REDACTED]',
  );
  out = out.replace(/([?&](token|key|auth|signature|sig)=)[^&\s'"]+/gi, '$1[REDACTED]');
  return out;
}

function contextSuffix(context: AppLogContext | undefined, appVersion: string | undefined): string {
  const parts: string[] = [];
  if (context?.provider) parts.push(`provider=${context.provider}`);
  if (context?.queueId) parts.push(`queue=${context.queueId}`);
  if (context?.episode !== undefined) parts.push(`ep=${context.episode}`);
  if (context?.server) parts.push(`server=${context.server}`);
  const version = context?.version || appVersion;
  if (version) parts.push(`v=${version}`);
  return parts.length > 0 ? ` [${parts.join(' ')}]` : '';
}

function detailsOf(value: unknown): string {
  const withStack = value as { stack?: unknown } | null | undefined;
  let details = String(withStack?.stack ?? value ?? 'error desconocido');
  // Anti-forgery: un mensaje con "[2026-..T..]" al inicio de linea forjaria
  // entradas en el visor (parse por cabecera). Se rompe el ancla sin perder legibilidad.
  details = details.replace(/\r/g, '').replace(/\n(?=\[\d{4}-\d{2}-\d{2}T)/g, '\n ');
  if (details.length > MAX_SINGLE_WRITE) details = `${details.slice(0, MAX_SINGLE_WRITE)}…[truncado]`;
  return details;
}

export class AppLogger {
  private readonly maxBytes: number;
  private readonly appVersion?: string;
  private readonly homeDir: string;
  private minLevel: LogLevel;

  private readonly sessionFilename: string;

  constructor(
    private readonly directories: RuntimeDirectories,
    options?: AppLoggerOptions,
  ) {
    this.maxBytes = options?.maxBytes && options.maxBytes > 0 ? options.maxBytes : DEFAULT_MAX_BYTES;
    this.appVersion = options?.appVersion;
    this.homeDir = options?.homeDir ?? os.homedir();
    this.minLevel = options?.minLevel ?? 'info';
    this.sessionFilename = buildSessionFilename(new Date());
  }

  getLogFile(): string {
    return path.join(this.directories.logDir, this.sessionFilename);
  }

  getSessionFilename(): string {
    return this.sessionFilename;
  }

  pruneOldSessions(keep = MAX_SESSION_FILES): { kept: number; removed: number } {
    try {
      const names = fs.readdirSync(this.directories.logDir);
      const { keep: keptNames, remove, removeBackups } = pruneSessionFiles(names, keep);
      let removed = 0;
      for (const name of [...remove, ...removeBackups]) {
        try {
          fs.rmSync(path.join(this.directories.logDir, name), { force: true });
          removed += 1;
        } catch {}
      }
      // Restos de reescrituras interrumpidas: nunca son logs validos.
      for (const name of names) {
        if (!name.endsWith('.tmp')) continue;
        try {
          fs.rmSync(path.join(this.directories.logDir, name), { force: true });
          removed += 1;
        } catch {}
      }
      return { kept: keptNames.length, removed };
    } catch {
      return { kept: 0, removed: 0 };
    }
  }

  setMinLevel(level: LogLevel): void {
    if (LEVEL_ORDER[level] !== undefined) this.minLevel = level;
  }

  child(scope: LogScope): ScopedLogger {
    const withScope = (level: LogLevel) => (message: unknown, context?: AppLogContext) =>
      this.log(level, message, { ...context, scope });
    return { debug: withScope('debug'), info: withScope('info'), warn: withScope('warn'), error: withScope('error') };
  }

  log(level: LogLevel, message: unknown, context?: AppLogContext): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;
    try {
      const scope = context?.scope ?? 'app';
      const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${scope}]${contextSuffix(context, this.appVersion)}:\n${redactLogText(detailsOf(message), this.homeDir)}\n\n`;
      this.appendTo(this.getLogFile(), `${this.sessionFilename}.1.log`, line);
    } catch (loggerError) {
      console.error('Logger falló:', loggerError);
    }
  }

  write(error: unknown, isRenderer = false, context?: AppLogContext): void {
    // Via de errores: severidad error, respeta minLevel como log('error').
    if (LEVEL_ORDER.error < LEVEL_ORDER[this.minLevel]) return;
    try {
      const line = this.legacyLine(error, isRenderer, context);
      this.appendTo(this.getLogFile(), `${this.sessionFilename}.1.log`, line);
    } catch (loggerError) {
      console.error('Logger falló:', loggerError);
    }
  }

  writeSessionHeader(info?: {
    version?: string;
    electron?: string;
    node?: string;
    platform?: string;
    arch?: string;
    userData?: string;
  }): void {
    try {
      const startedAt = new Date().toISOString();
      const header =
        buildSessionHeaderText({
          startedAt,
          version: info?.version || this.appVersion || 'dev',
          electron: info?.electron,
          node: info?.node,
          platform: info?.platform || process.platform,
          arch: info?.arch || process.arch,
          userData: info?.userData ? redactLogText(info.userData, this.homeDir) : undefined,
        }) + '\n\n';
      this.appendTo(this.getLogFile(), `${this.sessionFilename}.1.log`, header);
      // El fichero de errores solo se toca ante errores reales, nunca por arrancar.
    } catch (loggerError) {
      console.error('Logger falló:', loggerError);
    }
  }

  private legacyLine(error: unknown, isRenderer: boolean, context?: AppLogContext): string {
    const prefix = isRenderer ? 'FRONTEND_ERROR' : 'BACKEND_ERROR';
    return `[${new Date().toISOString()}] ${prefix}${contextSuffix(context, this.appVersion)}:\n${redactLogText(detailsOf(error), this.homeDir)}\n\n`;
  }

  private appendTo(file: string, backupName: string, msg: string): void {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
    } catch {
      // Best-effort: el append reintentará y caerá al catch global.
    }
    try {
      const st = fs.statSync(file, { throwIfNoEntry: false });
      if (st && st.size >= this.maxBytes) {
        const backup = path.join(this.directories.logDir, backupName);
        try {
          fs.rmSync(backup, { force: true });
        } catch {}
        try {
          fs.renameSync(file, backup);
        } catch {}
      }
    } catch {}
    // Sync a propósito: los crash logs deben quedar en disco aunque el proceso muera.
    fs.appendFileSync(file, msg);
  }
}
