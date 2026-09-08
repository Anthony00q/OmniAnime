import * as fs from 'fs';
import * as path from 'path';

// Observabilidad por servidor de descarga. Recolecta contadores sanitizados
// (provider, server, etapas, categoría de fallo) en su propio JSON bajo
// userData: no toca DatabaseManager, QueueStore ni el esquema SQLite.
// Nunca guarda URLs, tokens ni mensajes con datos sensibles.
// Conclusión oficial vigente: la allowlist actual es adecuada y no existe
// evidencia suficiente para ampliarla; este store solo recoge evidencia.

export type ServerFailureCategory =
  'cancelled' | 'skipped' | 'timeout-start' | 'tool-error' | 'invalid-output' | 'attempt-failed';

const FAILURE_CATEGORIES: ReadonlySet<string> = new Set([
  'cancelled',
  'skipped',
  'timeout-start',
  'tool-error',
  'invalid-output',
  'attempt-failed',
]);

export interface ServerStatEntry {
  found: number;
  allowlisted: number;
  resolveSuccess: number;
  downloadStart: number;
  downloadSuccess: number;
  failures: Record<string, number>;
}

export interface ServerStatRow extends ServerStatEntry {
  provider: string;
  server: string;
  resolveRate: number | null;
  downloadRate: number | null;
}

export interface ServerStatsSnapshot {
  rows: ServerStatRow[];
  totalAttempts: number;
}

export interface ServerAttemptOutcome {
  provider: string;
  server: string;
  resolveSuccess: boolean;
  downloadStart: boolean;
  downloadSuccess: boolean;
  failureCategory?: ServerFailureCategory | null;
}

// Banderas mínimas del resultado de un intento, sin arrastrar tipos del
// motor de descargas (evita ciclos entre servicios).
export interface AttemptOutcomeFlags {
  success: boolean;
  parentAborted: boolean;
  skipRequested: boolean;
  attemptTimedOut: boolean;
  invalidMp4: boolean;
  toolFailureMessage: string | null;
}

// Categoría cerrada para el fallo de un intento no exitoso. Null si fue éxito.
export function categorizeAttemptFailure(flags: AttemptOutcomeFlags): ServerFailureCategory | null {
  if (flags.success) return null;
  if (flags.parentAborted) return 'cancelled';
  if (flags.skipRequested) return 'skipped';
  if (flags.attemptTimedOut) return 'timeout-start';
  if (flags.toolFailureMessage) return 'tool-error';
  if (flags.invalidMp4) return 'invalid-output';
  return 'attempt-failed';
}

const MAX_KEY_LEN = 96;
const MAX_SERVER_LEN = 64;
const MAX_ENTRIES = 64;

function sanitizeToken(value: unknown, maxLen: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase().slice(0, maxLen);
  // Solo slugs de provider/servidor: sin URLs, espacios ni separadores.
  if (!trimmed || !/^[a-z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}

function sanitizeCount(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

function sanitizeEntry(raw: unknown): ServerStatEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const failures: Record<string, number> = {};
  const rawFailures = record.failures;
  if (rawFailures && typeof rawFailures === 'object' && !Array.isArray(rawFailures)) {
    for (const [key, count] of Object.entries(rawFailures as Record<string, unknown>)) {
      if (FAILURE_CATEGORIES.has(key)) failures[key] = sanitizeCount(count);
    }
  }
  return {
    found: sanitizeCount(record.found),
    allowlisted: sanitizeCount(record.allowlisted),
    resolveSuccess: sanitizeCount(record.resolveSuccess),
    downloadStart: sanitizeCount(record.downloadStart),
    downloadSuccess: sanitizeCount(record.downloadSuccess),
    failures,
  };
}

function rate(numerator: number, denominator: number): number | null {
  if (!Number.isInteger(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}

export class ServerStatsStore {
  private readonly memory = new Map<string, ServerStatEntry>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly filePath: string,
    private readonly saveDelayMs = 1000,
  ) {}

  load(): void {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
      this.memory.clear();
      for (const [key, entry] of Object.entries(parsed as Record<string, unknown>)) {
        if (this.memory.size >= MAX_ENTRIES) break;
        if (typeof key !== 'string' || key.length === 0 || key.length > MAX_KEY_LEN) continue;
        const clean = sanitizeEntry(entry);
        if (clean) this.memory.set(key, clean);
      }
    } catch {
      // Best-effort: sin stats previas se empieza de cero.
    }
  }

  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.writeAtomic();
  }

  recordFound(provider: string, server: string): void {
    const entry = this.entryFor(provider, server);
    if (!entry) return;
    entry.found += 1;
    this.scheduleSave();
  }

  recordAllowlisted(provider: string, server: string): void {
    const entry = this.entryFor(provider, server);
    if (!entry) return;
    entry.allowlisted += 1;
    this.scheduleSave();
  }

  recordOutcome(outcome: ServerAttemptOutcome): void {
    const entry = this.entryFor(outcome.provider, outcome.server);
    if (!entry) return;
    if (outcome.resolveSuccess) entry.resolveSuccess += 1;
    if (outcome.downloadStart) entry.downloadStart += 1;
    if (outcome.downloadSuccess) entry.downloadSuccess += 1;
    if (!outcome.downloadSuccess && outcome.failureCategory && FAILURE_CATEGORIES.has(outcome.failureCategory)) {
      entry.failures[outcome.failureCategory] = (entry.failures[outcome.failureCategory] || 0) + 1;
    }
    this.scheduleSave();
  }

  getSnapshot(): ServerStatsSnapshot {
    const rows: ServerStatRow[] = [];
    let totalAttempts = 0;
    for (const [key, entry] of this.memory.entries()) {
      const sep = key.indexOf(':');
      if (sep < 0) continue;
      const attempts = entry.downloadSuccess + Object.values(entry.failures).reduce((acc, count) => acc + count, 0);
      totalAttempts += attempts;
      rows.push({
        provider: key.slice(0, sep),
        server: key.slice(sep + 1),
        ...entry,
        failures: { ...entry.failures },
        resolveRate: rate(entry.resolveSuccess, entry.allowlisted),
        downloadRate: rate(entry.downloadSuccess, entry.allowlisted),
      });
    }
    rows.sort((a, b) => a.provider.localeCompare(b.provider) || a.server.localeCompare(b.server));
    return { rows, totalAttempts };
  }

  private entryFor(provider: string, server: string): ServerStatEntry | null {
    const cleanProvider = sanitizeToken(provider, MAX_SERVER_LEN);
    const cleanServer = sanitizeToken(server, MAX_SERVER_LEN);
    if (!cleanProvider || !cleanServer) return null;
    const key = `${cleanProvider}:${cleanServer}`;
    let entry = this.memory.get(key);
    if (!entry) {
      if (this.memory.size >= MAX_ENTRIES) return null;
      entry = { found: 0, allowlisted: 0, resolveSuccess: 0, downloadStart: 0, downloadSuccess: 0, failures: {} };
      this.memory.set(key, entry);
    }
    return entry;
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.writeAtomic();
    }, this.saveDelayMs);
    (this.saveTimer as unknown as { unref?: () => void }).unref?.();
  }

  private writeAtomic(): void {
    try {
      const data: Record<string, ServerStatEntry> = {};
      for (const [key, entry] of this.memory.entries()) data[key] = entry;
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, this.filePath);
    } catch {
      // Best-effort: la observabilidad nunca rompe descargas.
    }
  }
}
