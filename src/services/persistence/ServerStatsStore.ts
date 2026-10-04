import * as fs from 'fs';
import * as path from 'path';
import { DIRECT_CONCURRENCY_LEVELS, isConcurrencyLevel, stepDownLevel } from '../downloads/attemptConcurrency';

// Observabilidad por servidor: contadores sanitizados en su propio JSON bajo
// userData, sin tocar SQLite. Sin URLs, tokens ni mensajes sensibles. La
// allowlist actual se mantiene: este store solo recoge evidencia.

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
  // Agregados de instrumentación (solo contadores; ausentes en JSON antiguo → 0).
  attempts: number;
  totalDurationMs: number;
  successDurationMs: number;
  fallbackAttempts: number;
  episodes: number;
  episodesSuccess: number;
  episodesWithFallback: number;
  // Aprendizaje de concurrencia por nivel (ausente en JSON antiguo). Solo agregados.
  concurrency?: Record<string, ConcurrencyLevelStats>;
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
  // Solo instrumentación (opcionales por compat con JSON/tests antiguos).
  durationMs?: number;
  attemptIndex?: number;
}

// Resumen en memoria de un EP (no se persiste; solo agrega contadores).
export interface EpisodeDownloadSummary {
  provider: string;
  episode: number;
  success: boolean;
  // Links realmente intentados (attempted:true). 0 = nada que agregar.
  attempts: number;
  serversTried: string[];
  finalServer: string | null;
  fallbackTriggered: boolean;
  totalDurationMs: number;
  failureCategory: ServerFailureCategory | null;
}

// Resultado mínimo de un intento, sin arrastrar tipos del motor (evita ciclos).
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

// ---------------------------------------------------------------------------
// Aprendizaje de concurrencia por provider:server y nivel. Solo agregados por
// nivel (pos/neu/neg, EWMA de bps y última vista); la telemetría cruda vive y
// muere en AttemptTelemetry.
//
// Fórmula:
//   EWMA de bps con α decreciente según la evidencia previa
//   recencia  = 0.5^(días/14)
//   confianza = ev / (ev + 2), con ev = observaciones × recencia
//   score     = bps × recencia × confianza × (1 − 0.5 × tasaNegativa)
//   preferred = mayor score con evidencia positiva y nivel seguro; sin compararse
//               en LEARNING_REVERIFY_DAYS la semilla baja un peldaño y se re-mide
//   safeMax   = mayor nivel no inseguro (tasaNegativa ≥ 0.5); se recupera solo
//               con la recencia y observaciones nuevas

export type ConcurrencyObservationKind = 'positive' | 'neutral' | 'negative';

// Una observación = una medición comparable de un nivel, con su throughput ya medido.
export interface ConcurrencyObservation {
  provider: string;
  server: string;
  level: number;
  kind: ConcurrencyObservationKind;
  bps: number;
  // Si el enlace se compartía con otros EPs, la observación no enseña. Ausente = elegible.
  learningEligible?: boolean;
  // Medición del nivel que corrió sin compararlo: no renueva la frescura de la preferencia.
  bootstrap?: boolean;
}

export interface ConcurrencyLevelStats {
  // Observaciones positivas (mejora demostrada / nivel refugio tras degradación).
  pos: number;
  // Observaciones neutrales (kept: rindió igual, sin demostrar preferencia).
  neu: number;
  // Observaciones negativas (degradación clara, stall con trabajo, backoff).
  neg: number;
  // EWMA del throughput (solo positivas y neutras; las negativas pesan aparte).
  bps: number;
  // Timestamp de la última observación (base de la recencia).
  seen: number;
  // Timestamp de la última vez que el nivel se comparó contra otro. Ausente = seen.
  lastComparedAt?: number;
}

export interface ConcurrencyLevelLearning {
  level: number;
  observations: number;
  effectiveEvidence: number;
  confidence: number;
  negRate: number;
  estimatedBps: number;
  score: number;
  safe: boolean;
  lastSeen: number;
  lastComparedAt: number;
}

export interface ConcurrencyLearning {
  provider: string;
  server: string;
  preferredConcurrency: number | null;
  // La preferencia lleva sin compararse demasiado: conviene volver a medirla.
  preferredStale: boolean;
  safeMax: number | null;
  levels: ConcurrencyLevelLearning[];
}

// A los 14 días la evidencia vale la mitad: una mala racha antigua no domina para siempre.
export const LEARNING_HALF_LIFE_DAYS = 14;
// Sin compararse en 2 días la preferencia se re-verifica desde un peldaño por debajo.
export const LEARNING_REVERIFY_DAYS = 2;
// Penalización máxima por degradación sobre el score (hasta −50%).
export const LEARNING_NEG_PENALTY = 0.5;
// Con ≥50% de evidencia negativa el nivel se marca inseguro (se recupera solo).
export const LEARNING_UNSAFE_NEG_RATE = 0.5;
// Techo de contadores por nivel: el JSON crece a tamaño acotado.
export const LEARNING_MAX_COUNT = 9999;
const LEARNING_MAX_BPS = 10_000_000_000;

function learningAlpha(previousObservations: number): number {
  // La primera observación fija el agregado; después pesa cada vez menos.
  if (previousObservations <= 0) return 1;
  return 1 / (1 + Math.min(previousObservations, 5));
}

function recencyFactor(lastSeen: number, now: number): number {
  const ageDays = Math.max(0, (now - lastSeen) / 86_400_000);
  return Math.pow(0.5, ageDays / LEARNING_HALF_LIFE_DAYS);
}

function isComparisonStale(lastComparedAt: number, now: number): boolean {
  const ageDays = Math.max(0, (now - lastComparedAt) / 86_400_000);
  return ageDays > LEARNING_REVERIFY_DAYS;
}

// Cálculo puro del aprendizaje a partir de los agregados guardados.
export function computeConcurrencyLearning(
  stats: Record<string, ConcurrencyLevelStats> | undefined,
  provider: string,
  server: string,
  now: number,
): ConcurrencyLearning | null {
  if (!stats) return null;
  const levels: ConcurrencyLevelLearning[] = [];
  for (const level of DIRECT_CONCURRENCY_LEVELS) {
    const entry = stats[String(level)];
    if (!entry) continue;
    const observations = entry.pos + entry.neu + entry.neg;
    if (observations <= 0) continue;
    const recency = recencyFactor(entry.seen, now);
    const effectiveEvidence = observations * recency;
    const confidence = effectiveEvidence / (effectiveEvidence + 2);
    const negRate = entry.neg / observations;
    // Una negativa castiga mientras pese media observación: con `>= 1` se perdía al instante.
    const safe = !(negRate >= LEARNING_UNSAFE_NEG_RATE && entry.neg * recency >= 0.5);
    levels.push({
      level,
      observations,
      effectiveEvidence,
      confidence,
      negRate,
      estimatedBps: entry.bps,
      // Score = rendimiento × recencia × confianza × penalización por degradación.
      score: entry.bps * recency * confidence * (1 - LEARNING_NEG_PENALTY * negRate),
      safe,
      lastSeen: entry.seen,
      lastComparedAt: entry.lastComparedAt ?? entry.seen,
    });
  }
  if (levels.length === 0) return null;

  // Lo desconocido no es inseguro y lo inseguro se recupera con la recencia.
  let safeMax = 0;
  for (const level of DIRECT_CONCURRENCY_LEVELS) {
    const known = levels.find((entry) => entry.level === level);
    if (!known || known.safe) safeMax = level;
  }

  // El de mayor score con evidencia positiva; en empate gana el nivel menor.
  let preferred: ConcurrencyLevelLearning | null = null;
  for (const entry of levels) {
    if (!entry.safe || entry.score <= 0) continue;
    const statsEntry = stats[String(entry.level)];
    if (!statsEntry || statsEntry.pos <= 0) continue;
    if (!preferred || entry.score > preferred.score) preferred = entry;
  }

  return {
    provider,
    server,
    preferredConcurrency: preferred ? preferred.level : null,
    preferredStale: preferred !== null && isComparisonStale(preferred.lastComparedAt, now),
    safeMax: safeMax > 0 ? safeMax : null,
    levels,
  };
}

// Semilla: manda el aprendizaje (preferred recortado al safeMax); la manual solo
// cuenta sin él. La preferencia sin comparar se re-mide desde un peldaño por debajo.
export function resolveConcurrencySeed(manualSeed: number, learning: ConcurrencyLearning | null): number {
  if (!learning) return manualSeed;
  const preferred = learning.preferredConcurrency;
  const base = preferred === null ? manualSeed : learning.preferredStale ? stepDownLevel(preferred) : preferred;
  return learning.safeMax !== null ? Math.min(base, learning.safeMax) : base;
}

// Aplica una observación a los agregados por nivel; la comparten producción y
// el shadow learning.
export function applyConcurrencyObservation(
  stats: Record<string, ConcurrencyLevelStats> | undefined,
  observation: ConcurrencyObservation,
  now: number,
): Record<string, ConcurrencyLevelStats> {
  const out: Record<string, ConcurrencyLevelStats> = { ...(stats ?? {}) };
  const key = String(observation.level);
  const previous = out[key] ?? { pos: 0, neu: 0, neg: 0, bps: 0, seen: 0 };
  const before = previous.pos + previous.neu + previous.neg;
  const next: ConcurrencyLevelStats = {
    pos: previous.pos,
    neu: previous.neu,
    neg: previous.neg,
    bps: previous.bps,
    seen: sanitizeTimestamp(now),
    lastComparedAt: previous.lastComparedAt ?? previous.seen,
  };
  if (observation.kind === 'positive') next.pos = Math.min(previous.pos + 1, LEARNING_MAX_COUNT);
  else if (observation.kind === 'neutral') next.neu = Math.min(previous.neu + 1, LEARNING_MAX_COUNT);
  else next.neg = Math.min(previous.neg + 1, LEARNING_MAX_COUNT);
  // Medir sin comparar no renueva la frescura de la preferencia.
  if (observation.bootstrap !== true) next.lastComparedAt = next.seen;
  // El EWMA solo aprende de positivas y neutras; las negativas penalizan aparte.
  if (observation.kind !== 'negative') {
    const bps = sanitizeBps(observation.bps);
    const alpha = learningAlpha(before);
    next.bps = before === 0 ? bps : alpha * bps + (1 - alpha) * previous.bps;
  }
  out[key] = next;
  return out;
}

function sanitizeConcurrencyLevelStats(raw: unknown): ConcurrencyLevelStats | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  return {
    pos: Math.min(sanitizeCount(record.pos), LEARNING_MAX_COUNT),
    neu: Math.min(sanitizeCount(record.neu), LEARNING_MAX_COUNT),
    neg: Math.min(sanitizeCount(record.neg), LEARNING_MAX_COUNT),
    bps: sanitizeBps(record.bps),
    seen: sanitizeTimestamp(record.seen),
    lastComparedAt: sanitizeTimestamp(record.lastComparedAt ?? record.seen),
  };
}

function sanitizeBps(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return Math.min(value, LEARNING_MAX_BPS);
}

function sanitizeTimestamp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.floor(value), 4_102_444_800_000); // año 2100
}

// Sanitiza los agregados por nivel (solo claves de la escalera).
export function sanitizeConcurrency(raw: unknown): Record<string, ConcurrencyLevelStats> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  const out: Record<string, ConcurrencyLevelStats> = {};
  // Solo los niveles de la escalera: tamaño acotado y sin claves ajenas.
  for (const level of DIRECT_CONCURRENCY_LEVELS) {
    const stats = sanitizeConcurrencyLevelStats(record[String(level)]);
    if (stats) out[String(level)] = stats;
  }
  return Object.keys(out).length > 0 ? out : undefined;
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

// Tope defensivo: un intento real nunca llega a 24h.
const MAX_DURATION_MS = 86_400_000;

function sanitizeDurationMs(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.floor(value), MAX_DURATION_MS);
}

function sanitizeAttemptIndex(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : null;
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
  const concurrency = sanitizeConcurrency(record.concurrency);
  return {
    found: sanitizeCount(record.found),
    allowlisted: sanitizeCount(record.allowlisted),
    resolveSuccess: sanitizeCount(record.resolveSuccess),
    downloadStart: sanitizeCount(record.downloadStart),
    downloadSuccess: sanitizeCount(record.downloadSuccess),
    failures,
    // JSON antiguo sin estos campos → 0 (compat hacia atrás).
    attempts: sanitizeCount(record.attempts),
    totalDurationMs: sanitizeDurationMs(record.totalDurationMs),
    successDurationMs: sanitizeDurationMs(record.successDurationMs),
    fallbackAttempts: sanitizeCount(record.fallbackAttempts),
    episodes: sanitizeCount(record.episodes),
    episodesSuccess: sanitizeCount(record.episodesSuccess),
    episodesWithFallback: sanitizeCount(record.episodesWithFallback),
    // JSON antiguo sin `concurrency` → undefined: sin aprendizaje, sin efectos.
    ...(concurrency ? { concurrency } : {}),
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
    // Solo llega attempted:true; cada llamada es un intento real.
    entry.attempts += 1;
    const durationMs = sanitizeDurationMs(outcome.durationMs);
    entry.totalDurationMs += durationMs;
    if (outcome.downloadSuccess) {
      entry.successDurationMs += durationMs;
    }
    const attemptIndex = sanitizeAttemptIndex(outcome.attemptIndex);
    if (attemptIndex !== null && attemptIndex > 1) entry.fallbackAttempts += 1;
    if (outcome.resolveSuccess) entry.resolveSuccess += 1;
    if (outcome.downloadStart) entry.downloadStart += 1;
    if (outcome.downloadSuccess) entry.downloadSuccess += 1;
    if (!outcome.downloadSuccess && outcome.failureCategory && FAILURE_CATEGORIES.has(outcome.failureCategory)) {
      entry.failures[outcome.failureCategory] = (entry.failures[outcome.failureCategory] || 0) + 1;
    }
    this.scheduleSave();
  }

  // Solo EPs evaluables: con intentos reales y sin cancel/skip.
  recordEpisode(summary: EpisodeDownloadSummary): void {
    const attempts = sanitizeCount(summary.attempts);
    if (attempts <= 0) return;
    if (summary.failureCategory === 'cancelled' || summary.failureCategory === 'skipped') return;
    // Las duraciones ya las agregó recordOutcome; aquí solo se cuentan EPs.
    const tried = Array.isArray(summary.serversTried) ? summary.serversTried : [];
    const lastTried = tried.length > 0 ? tried[tried.length - 1] : null;
    // Un EP cuenta una vez: en el servidor final o en el último intentado.
    const keyServer = summary.success ? summary.finalServer || lastTried : lastTried;
    if (!keyServer) return;
    const entry = this.entryFor(summary.provider, keyServer);
    if (!entry) return;
    entry.episodes += 1;
    if (summary.success) entry.episodesSuccess += 1;
    if (summary.fallbackTriggered || attempts > 1) entry.episodesWithFallback += 1;
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
      // El aprendizaje de concurrencia no viaja en las filas del IPC: se lee
      // por su propia API (`getConcurrencyLearning`) y el payload no cambia.
      const row: ServerStatRow = {
        provider: key.slice(0, sep),
        server: key.slice(sep + 1),
        ...entry,
        failures: { ...entry.failures },
        resolveRate: rate(entry.resolveSuccess, entry.allowlisted),
        downloadRate: rate(entry.downloadSuccess, entry.allowlisted),
      };
      delete (row as Partial<ServerStatEntry>).concurrency;
      rows.push(row);
    }
    rows.sort((a, b) => a.provider.localeCompare(b.provider) || a.server.localeCompare(b.server));
    return { rows, totalAttempts };
  }

  // Registra una observación de concurrencia (best-effort: no rompe descargas).
  recordConcurrencyObservation(observation: ConcurrencyObservation, now: number = Date.now()): void {
    try {
      if (!observation || !isConcurrencyLevel(observation.level)) return;
      // Una observación no elegible (enlace compartido) no toca el aprendizaje
      // persistente. Los contadores operacionales no dependen de esta llamada.
      if (observation.learningEligible === false) return;
      const entry = this.entryFor(observation.provider, observation.server);
      if (!entry) return;
      entry.concurrency = applyConcurrencyObservation(entry.concurrency, observation, now);
      this.scheduleSave();
    } catch {
      // El aprendizaje es observabilidad: nunca rompe descargas.
    }
  }

  // Lectura del aprendizaje de un servidor; sin datos, null.
  getConcurrencyLearning(provider: string, server: string, now: number = Date.now()): ConcurrencyLearning | null {
    const key = this.keyFor(provider, server);
    if (!key) return null;
    return computeConcurrencyLearning(
      this.memory.get(key)?.concurrency,
      key.slice(0, key.indexOf(':')),
      key.slice(key.indexOf(':') + 1),
      now,
    );
  }

  private keyFor(provider: string, server: string): string | null {
    const cleanProvider = sanitizeToken(provider, MAX_SERVER_LEN);
    const cleanServer = sanitizeToken(server, MAX_SERVER_LEN);
    if (!cleanProvider || !cleanServer) return null;
    return `${cleanProvider}:${cleanServer}`;
  }

  private entryFor(provider: string, server: string): ServerStatEntry | null {
    const key = this.keyFor(provider, server);
    if (!key) return null;
    let entry = this.memory.get(key);
    if (!entry) {
      if (this.memory.size >= MAX_ENTRIES) return null;
      entry = {
        found: 0,
        allowlisted: 0,
        resolveSuccess: 0,
        downloadStart: 0,
        downloadSuccess: 0,
        failures: {},
        attempts: 0,
        totalDurationMs: 0,
        successDurationMs: 0,
        fallbackAttempts: 0,
        episodes: 0,
        episodesSuccess: 0,
        episodesWithFallback: 0,
      };
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
