import * as fs from 'fs';
import * as path from 'path';
import {
  applyConcurrencyObservation,
  computeConcurrencyLearning,
  sanitizeConcurrency,
  type ConcurrencyLearning,
  type ConcurrencyLevelStats,
  type ServerFailureCategory,
} from '../persistence/ServerStatsStore';
import { concurrencyObservationsFromDecisions, DEFAULT_ADAPTIVE_POLICY } from './adaptiveConcurrency';
import type { AdaptiveDecision, AdaptiveDecisionCause, AdaptiveDecisionKind } from './adaptiveConcurrency';
import type { ConcurrencyApplicationMode } from './attemptConcurrency';
import { TELEMETRY_WINDOW_MS, type AttemptObservationSample, type AttemptThroughputWindow } from './attemptTelemetry';

// Modo experimental de concurrencia: registra el comportamiento del controller
// por provider:server en un fichero propio, sin tocar los umbrales ni el
// aprendizaje de producción. Solo agregados y registros recientes; sin telemetría
// cruda, sin URLs ni tokens (mismo patrón JSON atómico que ServerStatsStore).

// ---------------------------------------------------------------------------
// Perfiles de cadencia (los umbrales de mejora/degradación no cambian entre
// ellos). El activo lo decide OMNIANIME_CONCURRENCY_CADENCE; sin ella, el
// perfil por defecto.
// ---------------------------------------------------------------------------

export type ExperimentCadenceProfile = 'baseline' | 'fast';

export interface ExperimentCadenceSettings {
  profile: ExperimentCadenceProfile;
  windowMs: number;
  evidenceWindows: number;
  cooldownWindows: number;
}

export const CONCURRENCY_CADENCE_PROFILES: Record<ExperimentCadenceProfile, ExperimentCadenceSettings> = {
  // Comparador histórico (10 s, 2 de evidencia, 2 de cooldown).
  baseline: {
    profile: 'baseline',
    windowMs: TELEMETRY_WINDOW_MS,
    evidenceWindows: DEFAULT_ADAPTIVE_POLICY.evidenceWindows,
    cooldownWindows: DEFAULT_ADAPTIVE_POLICY.cooldownWindows,
  },
  // Perfil rápido (5 s, 1 de evidencia, 2 de cooldown): los probes caben en
  // descargas de 20-60 s.
  fast: {
    profile: 'fast',
    windowMs: 5_000,
    evidenceWindows: 1,
    cooldownWindows: DEFAULT_ADAPTIVE_POLICY.cooldownWindows,
  },
};

// Perfil de cadencia activo por defecto.
export const DEFAULT_CADENCE_PROFILE: ExperimentCadenceProfile = 'fast';

// `baseline` selecciona el comparador histórico; cualquier otro valor, el defecto.
export function resolveCadenceProfile(value: string | undefined): ExperimentCadenceProfile {
  return value === 'baseline' ? 'baseline' : DEFAULT_CADENCE_PROFILE;
}

// ¿Compartía el enlace con otros EPs al tomar la observación? Solo es una marca.
export type ExperimentSharing = 'solo' | 'shared';

// ---------------------------------------------------------------------------
// Registro estructurado de UN intento (equivalente al informe de descarga que
// se quiere analizar: semilla, probes con sus magnitudes, resultado y duración).
// ---------------------------------------------------------------------------

export interface AttemptExperimentDecision {
  at: number;
  atWindow: number;
  kind: AdaptiveDecisionKind;
  from: number;
  to: number;
  cause: AdaptiveDecisionCause;
  // Datos de la política, sin recalcular: solo vistas de presentación.
  baselineBps: number | null;
  observedBps: number | null;
  improvementPct: number | null;
  degradationPct: number | null;
  // Concurrencia real media de la ventana que disparó la decisión.
  avgActualConcurrency: number | null;
  // Cuánto tardó en aplicarse el cambio (decisión → actual == to). Null = no
  // llegó a aplicarse.
  applicationLagMs: number | null;
  // ¿La observación se tomó en solitario o compartiendo el enlace?
  sharing: ExperimentSharing;
  // Por ahora = (sharing === 'solo'). Sirve para decidir después si las
  // observaciones compartidas entran, pesan menos o se ignoran al aprender.
  learningEligible: boolean;
}

export interface AttemptExperimentProbeStats {
  total: number;
  improved: number;
  kept: number;
  degraded: number;
  expired: number;
  // Probes diferidos sin oportunidad de aplicarse: ni mejoran ni penalizan.
  notApplicable: number;
}

// Observación de nivel completado (sin probe): cómo rindió el nivel que corrió
// cuando el intento terminó bien. No es evidencia de probe: no crea preferencias
// ni penaliza; solo permite comparar niveles después.
export interface AttemptCompletedLevelObservation {
  level: number;
  avgBps: number;
  // Ventanas completas usadas como evidencia (0 = sin evidencia util).
  windows: number;
  // Marca de sharing (ver `AttemptExperimentDecision`).
  sharing: ExperimentSharing;
  learningEligible: boolean;
}

export interface AttemptExperimentRecord {
  itemId: string;
  episode: number;
  provider: string;
  server: string;
  startedAt: number;
  durationMs: number;
  // Semilla del intento y de dónde salió.
  seed: number;
  seedSource: 'manual' | 'learned';
  coldStart: boolean;
  learnedPreferred: number | null;
  learnedSafeMax: number | null;
  // Resultado del intento (también los fallidos: miden fallback y errores).
  success: boolean;
  interrupted: boolean;
  failureCategory: ServerFailureCategory | null;
  loadedBytes: number;
  progress01: number;
  // Decisiones y resumen del intento.
  decisions: AttemptExperimentDecision[];
  probes: AttemptExperimentProbeStats;
  changes: number;
  backoffs: number;
  finalLevel: number;
  // Rendimiento del nivel que corrió (null si hubo cambios aplicados o falta
  // evidencia: en ese caso las decisiones ya llevan los datos).
  completedLevel: AttemptCompletedLevelObservation | null;
  // Tiempo hasta el último cambio de nivel (0 = estable desde el inicio).
  timeToStableMs: number;
  // Completado por el emisor/registro para análisis de 1-3 EPs y fallback.
  concurrentPeers: number;
  isFallback: boolean;
  // Perfil de cadencia con el que corrió el intento (comparar baseline vs fast).
  cadenceProfile: ExperimentCadenceProfile;
  // Capacidad de aplicación final: 'hot' = pool ranged · 'not-applicable' =
  // camino simple u otro sin frontera · 'deferred' = aplicación diferida.
  // Ausente = sin dato (registros de rondas previas).
  applicationMode?: ConcurrencyApplicationMode | null;
  // Marca de sharing del intento (ver `ExperimentSharing`).
  sharing: ExperimentSharing;
}

// Entrada del constructor puro: datos ya existentes de política y telemetría.
export interface AttemptExperimentInput {
  itemId: string;
  episode: number;
  provider: string;
  server: string;
  startedAt: number;
  durationMs: number;
  seed: number;
  seedSource: 'manual' | 'learned';
  coldStart: boolean;
  learnedPreferred: number | null;
  learnedSafeMax: number | null;
  success: boolean;
  interrupted: boolean;
  failureCategory: ServerFailureCategory | null;
  loadedBytes: number;
  progress01: number;
  decisions: readonly AdaptiveDecision[];
  samples: readonly AttemptObservationSample[];
  windows: readonly AttemptThroughputWindow[];
  // Perfil de cadencia del intento (ausente = baseline).
  cadenceProfile?: ExperimentCadenceProfile;
  // Capacidad de aplicación final del intento (ausente = sin dato).
  applicationMode?: ConcurrencyApplicationMode | null;
}

function pct(
  observed: number | null,
  baseline: number | null,
): { improvementPct: number | null; degradationPct: number | null } {
  if (observed === null || baseline === null || !(baseline > 0)) {
    return { improvementPct: null, degradationPct: null };
  }
  const change = (observed - baseline) / baseline;
  return {
    improvementPct: change > 0 ? change : null,
    degradationPct: change < 0 ? change : null,
  };
}

function applicationLagMs(decision: AdaptiveDecision, samples: readonly AttemptObservationSample[]): number | null {
  if (decision.from === decision.to) return 0; // Sin cambio de nivel: aplicado al instante.
  const up = decision.to > decision.from;
  for (const sample of samples) {
    if (sample.at < decision.at) continue;
    const applied = up ? sample.actualConcurrency >= decision.to : sample.actualConcurrency <= decision.to;
    if (applied) return sample.at - decision.at;
  }
  return null; // El cambio no llegó a aplicarse dentro del intento (efecto diferido).
}

// Un `probe-not-applicable` SIN `probe-up` delante es una exploración que
// concluyó sin despegar; los que siguen a un `probe-up` lo resuelven.
function probeNeverStarted(previousKind: AdaptiveDecisionKind | undefined): boolean {
  return previousKind !== 'probe-up';
}

// Constructor puro del registro: presenta los datos de la política con sus
// porcentajes y correlaciones, sin recalcular nada.
export function buildAttemptExperimentRecord(input: AttemptExperimentInput): AttemptExperimentRecord {
  const decisions: AttemptExperimentDecision[] = input.decisions.map((decision) => {
    const { improvementPct, degradationPct } = pct(decision.observedBps, decision.baselineBps);
    const window = input.windows[decision.atWindow - 1];
    return {
      at: decision.at,
      atWindow: decision.atWindow,
      kind: decision.kind,
      from: decision.from,
      to: decision.to,
      cause: decision.cause,
      baselineBps: decision.baselineBps,
      observedBps: decision.observedBps,
      improvementPct,
      degradationPct,
      avgActualConcurrency: window ? window.avgActualConcurrency : null,
      applicationLagMs: applicationLagMs(decision, input.samples),
      // Arrancan en solitario; el store las ajusta al conocer los EPs simultáneos.
      sharing: 'solo',
      learningEligible: true,
    };
  });

  const probes: AttemptExperimentProbeStats = {
    total: 0,
    improved: 0,
    kept: 0,
    degraded: 0,
    expired: 0,
    notApplicable: 0,
  };
  let changes = 0;
  let backoffs = 0;
  let lastChangeAt: number | null = null;
  for (let i = 0; i < input.decisions.length; i += 1) {
    const decision = input.decisions[i];
    if (decision.kind === 'probe-up') {
      probes.total += 1;
      changes += 1;
      lastChangeAt = decision.at;
    } else if (decision.kind === 'probe-improved') probes.improved += 1;
    else if (decision.kind === 'probe-kept') probes.kept += 1;
    else if (decision.kind === 'probe-degraded') {
      probes.degraded += 1;
      changes += 1;
      lastChangeAt = decision.at;
    } else if (decision.kind === 'probe-timeout') probes.expired += 1;
    else if (decision.kind === 'probe-not-applicable') {
      probes.notApplicable += 1;
      // Sin probe-up delante: exploración que concluyó sin despegar. Cuenta
      // como probe intentado.
      if (probeNeverStarted(input.decisions[i - 1]?.kind)) probes.total += 1;
    } else if (decision.kind === 'decrease') {
      changes += 1;
      lastChangeAt = decision.at;
    } else if (decision.kind === 'strong-backoff') {
      changes += 1;
      backoffs += 1;
      lastChangeAt = decision.at;
    }
  }
  const last = input.decisions[input.decisions.length - 1];

  // Solo para intentos OK y sin cambios aplicados (si lo hubo, la evidencia está
  // en las decisiones). Exige ventanas completas y comparables; sin evidencia
  // suficiente no se registra nada en lugar de una media engañosa.
  const appliedChange = decisions.some((d) => d.from !== d.to && d.applicationLagMs !== null);
  let completedLevel: AttemptCompletedLevelObservation | null = null;
  if (input.success && !appliedChange) {
    const level = input.seed;
    const tolerance = level * DEFAULT_ADAPTIVE_POLICY.actualTolerance;
    const usable = input.windows.filter(
      (window) =>
        window.valid &&
        window.complete &&
        window.progressAtEnd < DEFAULT_ADAPTIVE_POLICY.tailProgress &&
        Math.abs(window.avgActualConcurrency - level) <= tolerance,
    );
    if (usable.length > 0) {
      completedLevel = {
        level,
        avgBps: usable.reduce((acc, window) => acc + window.throughputBps, 0) / usable.length,
        windows: usable.length,
        sharing: 'solo',
        learningEligible: true,
      };
    }
  }

  return {
    itemId: input.itemId,
    episode: input.episode,
    provider: input.provider,
    server: input.server,
    startedAt: input.startedAt,
    durationMs: input.durationMs,
    seed: input.seed,
    seedSource: input.seedSource,
    coldStart: input.coldStart,
    learnedPreferred: input.learnedPreferred,
    learnedSafeMax: input.learnedSafeMax,
    success: input.success,
    interrupted: input.interrupted,
    failureCategory: input.failureCategory,
    loadedBytes: input.loadedBytes,
    progress01: input.progress01,
    decisions,
    probes,
    changes,
    backoffs,
    finalLevel: last ? last.to : input.seed,
    completedLevel,
    timeToStableMs: lastChangeAt === null ? 0 : Math.max(0, lastChangeAt - input.startedAt),
    concurrentPeers: 0,
    isFallback: false,
    cadenceProfile: input.cadenceProfile ?? 'baseline',
    applicationMode: input.applicationMode ?? null,
    sharing: 'solo',
  };
}

// ---------------------------------------------------------------------------
// Agregados por provider:server y por nivel: responden a las preguntas del
// análisis sin guardar telemetría cruda.
// ---------------------------------------------------------------------------

export interface ExperimentLevelStats {
  observations: number;
  sumBps: number;
  sumSqBps: number;
  minBps: number;
  maxBps: number;
  lastAt: number;
  // Procedencia (no mezclar observación simple con resultado de probe).
  fromProbes: number;
  fromCompleted: number;
}

export interface ExperimentSeedSourceStats {
  attempts: number;
  probes: number;
  changes: number;
}

// Desglose por perfil de cadencia: ¿resuelve más probes la cadencia rápida?
// `resolved` = probes con veredicto de evidencia; `expired`/`notApplicable` son
// conclusiones sin evidencia y van aparte.
export interface ExperimentCadenceProfileStats {
  attempts: number;
  probes: number;
  resolved: number;
  improved: number;
  kept: number;
  degraded: number;
  expired: number;
  notApplicable: number;
  timeToStableSumMs: number;
}

export interface ConcurrencyExperimentAggregate {
  provider: string;
  server: string;
  attempts: number;
  ok: number;
  failed: number;
  interrupted: number;
  fallbacks: number;
  probes: AttemptExperimentProbeStats;
  // Transiciones contadas como '4->6' (acotadas a la escalera).
  transitions: Record<string, number>;
  changes: number;
  backoffs: number;
  // Throughput observado por nivel (para comparar 1 vs 2 vs 4 vs 6 vs 8).
  levels: Record<string, ExperimentLevelStats>;
  // Cold start vs learned start (cuántos probes evita el aprendizaje).
  bySeedSource: Record<'manual' | 'learned', ExperimentSeedSourceStats>;
  // Baseline vs fast (cadencia de exploración), para decidir con datos.
  byCadenceProfile: Record<ExperimentCadenceProfile, ExperimentCadenceProfileStats>;
  timeToStableSumMs: number;
  lastAt: number;
}

// ¿El throughput cae cuando varios EPs comparten el enlace? Se deriva de los
// registros (concurrentPeers simétrico) para clasificar sin sesgo.
export interface ExperimentSharingStats {
  provider: string;
  server: string;
  alone: { attempts: number; avgBps: number };
  shared: { attempts: number; avgBps: number };
  // Solo vs 2 EPs vs 3 EPs. `peers` = otros EPs en vuelo (2 EPs → peers 1).
  byPeers: Array<{ peers: number; attempts: number; avgBps: number }>;
}

export interface ExperimentAnomaly {
  kind: 'oscilacion' | 'reprobe-degradado' | 'safe-max-estancado';
  provider: string;
  server: string;
  level: number;
  count: number;
}

export interface ConcurrencyExperimentReport {
  aggregates: ConcurrencyExperimentAggregate[];
  records: readonly AttemptExperimentRecord[];
  anomalies: ExperimentAnomaly[];
  sharing: ExperimentSharingStats[];
}

export interface ConcurrencyExperimentSnapshot {
  version: 1;
  records: AttemptExperimentRecord[];
  aggregates: Record<string, ConcurrencyExperimentAggregate>;
  // Shadow learning del experimento (cold vs learned): agregados por
  // provider:server con la misma semántica que producción. Ausente en JSON antiguo.
  learning?: Record<string, Record<string, ConcurrencyLevelStats>>;
}

// Marcas de sharing del registro y de sus observaciones. El store las ajusta al
// conocer los EPs simultáneos.
function stampSharing(record: AttemptExperimentRecord, sharing: ExperimentSharing): void {
  const eligible = sharing === 'solo';
  record.sharing = sharing;
  for (const decision of record.decisions) {
    decision.sharing = sharing;
    decision.learningEligible = eligible;
  }
  if (record.completedLevel) {
    record.completedLevel.sharing = sharing;
    record.completedLevel.learningEligible = eligible;
  }
}

const MAX_RECORDS = 200;
const MAX_TRANSITIONS = 32;
// Mismo tope de entradas que ServerStatsStore: el JSON crece acotado.
const MAX_SHADOW_ENTRIES = 64;
const MAX_SHADOW_KEY_LEN = 96;

function emptyProfileStats(): ExperimentCadenceProfileStats {
  return {
    attempts: 0,
    probes: 0,
    resolved: 0,
    improved: 0,
    kept: 0,
    degraded: 0,
    expired: 0,
    notApplicable: 0,
    timeToStableSumMs: 0,
  };
}

function emptyAggregate(provider: string, server: string): ConcurrencyExperimentAggregate {
  return {
    provider,
    server,
    attempts: 0,
    ok: 0,
    failed: 0,
    interrupted: 0,
    fallbacks: 0,
    probes: { total: 0, improved: 0, kept: 0, degraded: 0, expired: 0, notApplicable: 0 },
    transitions: {},
    changes: 0,
    backoffs: 0,
    levels: {},
    bySeedSource: {
      manual: { attempts: 0, probes: 0, changes: 0 },
      learned: { attempts: 0, probes: 0, changes: 0 },
    },
    byCadenceProfile: { baseline: emptyProfileStats(), fast: emptyProfileStats() },
    timeToStableSumMs: 0,
    lastAt: 0,
  };
}

function transitionKey(from: number, to: number): string {
  return `${from}->${to}`;
}

function aggregateKey(provider: string, server: string): string {
  return `${provider}:${server}`;
}

function levelThroughputs(
  record: AttemptExperimentRecord,
): Array<{ level: number; bps: number; source: 'probe' | 'completed' }> {
  // Cada decisión aporta la medición del nivel sobre el que se decidió.
  const out: Array<{ level: number; bps: number; source: 'probe' | 'completed' }> = [];
  for (const decision of record.decisions) {
    if (decision.observedBps === null) continue;
    if (decision.kind === 'probe-improved' || decision.kind === 'probe-kept') {
      out.push({ level: decision.to, bps: decision.observedBps, source: 'probe' });
    } else if (
      decision.kind === 'probe-degraded' ||
      decision.kind === 'decrease' ||
      decision.kind === 'strong-backoff'
    ) {
      out.push({ level: decision.from, bps: decision.observedBps, source: 'probe' });
    }
  }
  // El nivel completado entra con su propia procedencia.
  if (record.completedLevel) {
    out.push({
      level: record.completedLevel.level,
      bps: record.completedLevel.avgBps,
      source: 'completed',
    });
  }
  return out;
}

function updateAggregate(aggregate: ConcurrencyExperimentAggregate, record: AttemptExperimentRecord): void {
  aggregate.attempts += 1;
  if (record.success) aggregate.ok += 1;
  else if (record.interrupted) aggregate.interrupted += 1;
  else aggregate.failed += 1;
  if (record.isFallback) aggregate.fallbacks += 1;
  aggregate.probes.total += record.probes.total;
  aggregate.probes.improved += record.probes.improved;
  aggregate.probes.kept += record.probes.kept;
  aggregate.probes.degraded += record.probes.degraded;
  aggregate.probes.expired += record.probes.expired;
  aggregate.probes.notApplicable += record.probes.notApplicable ?? 0;
  aggregate.changes += record.changes;
  aggregate.backoffs += record.backoffs;
  aggregate.timeToStableSumMs += record.timeToStableMs;
  aggregate.lastAt = Math.max(aggregate.lastAt, record.startedAt);

  const seedStats = aggregate.bySeedSource[record.seedSource];
  seedStats.attempts += 1;
  seedStats.probes += record.probes.total;
  seedStats.changes += record.changes;

  // Perfil de cadencia (los agregados previos al desglose arrancan en cero).
  if (!aggregate.byCadenceProfile) {
    aggregate.byCadenceProfile = { baseline: emptyProfileStats(), fast: emptyProfileStats() };
  }
  const profileKey = record.cadenceProfile ?? 'baseline';
  const profileStats = aggregate.byCadenceProfile[profileKey] ?? emptyProfileStats();
  aggregate.byCadenceProfile[profileKey] = profileStats;
  profileStats.attempts += 1;
  profileStats.probes += record.probes.total;
  profileStats.improved += record.probes.improved;
  profileStats.kept += record.probes.kept;
  profileStats.degraded += record.probes.degraded;
  profileStats.expired += record.probes.expired;
  profileStats.notApplicable += record.probes.notApplicable ?? 0;
  profileStats.resolved += record.probes.improved + record.probes.kept + record.probes.degraded;
  profileStats.timeToStableSumMs += record.timeToStableMs;

  for (let i = 0; i < record.decisions.length; i += 1) {
    const decision = record.decisions[i];
    // Sin probe-up delante: exploración sin despegar. Cuenta como probe intentado.
    const explores =
      decision.kind === 'probe-up' ||
      (decision.kind === 'probe-not-applicable' && probeNeverStarted(record.decisions[i - 1]?.kind));
    if (!explores) continue;
    const key = transitionKey(decision.from, decision.to);
    if (Object.keys(aggregate.transitions).length < MAX_TRANSITIONS || key in aggregate.transitions) {
      aggregate.transitions[key] = (aggregate.transitions[key] ?? 0) + 1;
    }
  }

  for (const measurement of levelThroughputs(record)) {
    const key = String(measurement.level);
    const stats = aggregate.levels[key] ?? {
      observations: 0,
      sumBps: 0,
      sumSqBps: 0,
      minBps: measurement.bps,
      maxBps: measurement.bps,
      lastAt: record.startedAt,
      fromProbes: 0,
      fromCompleted: 0,
    };
    stats.observations += 1;
    stats.sumBps += measurement.bps;
    stats.sumSqBps += measurement.bps * measurement.bps;
    stats.minBps = Math.min(stats.minBps, measurement.bps);
    if (measurement.source === 'probe') stats.fromProbes += 1;
    else stats.fromCompleted += 1;
    stats.maxBps = Math.max(stats.maxBps, measurement.bps);
    stats.lastAt = Math.max(stats.lastAt, record.startedAt);
    aggregate.levels[key] = stats;
  }
}

// ¿Cae el throughput cuando varios EPs comparten el enlace? Clasificación
// simétrica: solo vs compartido, derivada de los registros.
function computeSharing(records: readonly AttemptExperimentRecord[]): ExperimentSharingStats[] {
  const byServer = new Map<string, ExperimentSharingStats>();
  const peersTotals = new Map<string, Map<number, { attempts: number; sumBps: number }>>();
  for (const record of records) {
    const key = aggregateKey(record.provider, record.server);
    const stats = byServer.get(key) ?? {
      provider: record.provider,
      server: record.server,
      alone: { attempts: 0, avgBps: 0 },
      shared: { attempts: 0, avgBps: 0 },
      byPeers: [],
    };
    const bps = record.durationMs > 0 ? (record.loadedBytes * 1000) / record.durationMs : 0;
    const bucket = record.concurrentPeers > 0 ? stats.shared : stats.alone;
    bucket.attempts += 1;
    bucket.avgBps += bps;
    byServer.set(key, stats);
    // Desglose por número de EPs compañeros (solo vs 2 EPs vs 3 EPs).
    const peers = Math.max(0, record.concurrentPeers ?? 0);
    const totals = peersTotals.get(key) ?? new Map<number, { attempts: number; sumBps: number }>();
    const entry = totals.get(peers) ?? { attempts: 0, sumBps: 0 };
    entry.attempts += 1;
    entry.sumBps += bps;
    totals.set(peers, entry);
    peersTotals.set(key, totals);
  }
  for (const stats of byServer.values()) {
    if (stats.alone.attempts > 0) stats.alone.avgBps /= stats.alone.attempts;
    if (stats.shared.attempts > 0) stats.shared.avgBps /= stats.shared.attempts;
    const totals = peersTotals.get(aggregateKey(stats.provider, stats.server));
    if (totals) {
      stats.byPeers = Array.from(totals.entries())
        .map(([peers, entry]) => ({ peers, attempts: entry.attempts, avgBps: entry.sumBps / entry.attempts }))
        .sort((a, b) => a.peers - b.peers);
    }
  }
  return Array.from(byServer.values());
}

// Detección de casos problemáticos: describe hechos, no decide acciones.
export function detectExperimentAnomalies(records: readonly AttemptExperimentRecord[]): ExperimentAnomaly[] {
  const anomalies: ExperimentAnomaly[] = [];
  const byServer = new Map<string, AttemptExperimentRecord[]>();
  for (const record of records) {
    const key = aggregateKey(record.provider, record.server);
    const list = byServer.get(key) ?? [];
    list.push(record);
    byServer.set(key, list);
  }
  for (const list of byServer.values()) {
    const provider = list[0].provider;
    const server = list[0].server;
    let oscillations = 0;
    const degradedByLevel = new Map<number, number>();
    const degradationAt = new Map<number, number>();
    for (const record of list) {
      // Oscilación: cambios que alternan dirección dentro de un intento.
      const directions = record.decisions
        .filter((decision) => decision.from !== decision.to)
        .map((decision) => (decision.to > decision.from ? 1 : -1));
      for (let i = 2; i < directions.length; i += 1) {
        if (directions[i] === directions[i - 2] && directions[i] !== directions[i - 1]) {
          oscillations += 1;
          break;
        }
      }
      for (const decision of record.decisions) {
        // Re-probe de un nivel que ya degradó.
        if (decision.kind === 'probe-degraded') {
          degradedByLevel.set(decision.from, (degradedByLevel.get(decision.from) ?? 0) + 1);
          if (!degradationAt.has(decision.from)) degradationAt.set(decision.from, record.startedAt);
        }
        // Backoff fuerte: el nivel debe poder volver a explorarse.
        if (decision.kind === 'strong-backoff') {
          if (!degradationAt.has(decision.from)) degradationAt.set(decision.from, record.startedAt);
        }
      }
    }
    if (oscillations > 0) {
      anomalies.push({ kind: 'oscilacion', provider, server, level: 0, count: oscillations });
    }
    for (const [level, count] of degradedByLevel) {
      if (count >= 2) anomalies.push({ kind: 'reprobe-degradado', provider, server, level, count });
    }
    // SafeMax estancado: el nivel degradó y nunca más se volvió a explorar.
    for (const [level, since] of degradationAt) {
      const later = list.filter((record) => record.startedAt > since);
      if (later.length < 3) continue;
      const reExplored = later.some((record) =>
        record.decisions.some((decision) => decision.kind === 'probe-up' && decision.to === level),
      );
      if (!reExplored) {
        anomalies.push({ kind: 'safe-max-estancado', provider, server, level, count: later.length });
      }
    }
  }
  return anomalies;
}

// ---------------------------------------------------------------------------
// Store experimental: fichero propio (`concurrency-experiments.json`), escritura
// atómica y registros acotados. No toca `server-stats.json`.
// ---------------------------------------------------------------------------

export class ConcurrencyExperimentStore {
  private readonly records: AttemptExperimentRecord[] = [];
  private readonly aggregates = new Map<string, ConcurrencyExperimentAggregate>();
  // Shadow learning: `provider:server` → agregados por nivel con la semántica de
  // producción (reutilizada). Vive solo en este fichero.
  private readonly shadow = new Map<string, Record<string, ConcurrencyLevelStats>>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly filePath: string,
    private readonly saveDelayMs = 1000,
  ) {}

  load(): void {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as ConcurrencyExperimentSnapshot;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
      if (Array.isArray(parsed.records)) {
        for (const record of parsed.records.slice(-MAX_RECORDS)) {
          if (record && typeof record === 'object') this.records.push(record);
        }
      }
      if (parsed.aggregates && typeof parsed.aggregates === 'object' && !Array.isArray(parsed.aggregates)) {
        for (const [key, aggregate] of Object.entries(parsed.aggregates)) {
          if (aggregate && typeof aggregate === 'object') this.aggregates.set(key, aggregate);
        }
      }
      if (parsed.learning && typeof parsed.learning === 'object' && !Array.isArray(parsed.learning)) {
        for (const [key, levels] of Object.entries(parsed.learning)) {
          if (this.shadow.size >= MAX_SHADOW_ENTRIES) break;
          if (typeof key !== 'string' || key.length === 0 || key.length > MAX_SHADOW_KEY_LEN) continue;
          const clean = sanitizeConcurrency(levels);
          if (clean) this.shadow.set(key, clean);
        }
      }
    } catch {
      // Best-effort: sin fichero experimental se empieza de cero.
    }
  }

  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.writeAtomic();
  }

  // Registra un intento y actualiza los agregados. Aquí se completa el registro
  // con lo que solo el conjunto conoce: intentos simultáneos y fallback.
  recordAttempt(record: AttemptExperimentRecord): void {
    try {
      const copy: AttemptExperimentRecord = {
        ...record,
        // Copia profunda: las marcas de sharing no deben salir hacia el emisor.
        decisions: record.decisions.map((decision) => ({ ...decision })),
        probes: { ...record.probes },
        completedLevel: record.completedLevel ? { ...record.completedLevel } : null,
      };
      copy.isFallback = this.records.some(
        (existing) => existing.itemId === copy.itemId && existing.episode === copy.episode,
      );
      // Peers simétricos: quien corre a la vez comparte el enlace, así que ambos
      // lados quedan marcados como compartido.
      let peers = 0;
      for (const existing of this.records) {
        if (
          existing.startedAt < copy.startedAt + copy.durationMs &&
          copy.startedAt < existing.startedAt + existing.durationMs
        ) {
          peers += 1;
          existing.concurrentPeers += 1;
          // Lo ya registrado también compartió el enlace y deja de ser elegible.
          // Si ya había alimentado el aprendizaje, su contribución sale del
          // shadow al reconstruir la clave.
          const flipped = existing.sharing === 'solo';
          stampSharing(existing, 'shared');
          if (flipped) this.rebuildShadowFor(existing.provider, existing.server);
        }
      }
      copy.concurrentPeers = peers;
      stampSharing(copy, peers > 0 ? 'shared' : 'solo');

      this.records.push(copy);
      if (this.records.length > MAX_RECORDS) this.records.splice(0, this.records.length - MAX_RECORDS);
      const key = aggregateKey(copy.provider, copy.server);
      const aggregate = this.aggregates.get(key) ?? emptyAggregate(copy.provider, copy.server);
      updateAggregate(aggregate, copy);
      this.aggregates.set(key, aggregate);
      this.feedShadowLearning(copy);
      this.scheduleSave();
    } catch {
      // El modo experimental nunca debe romper una descarga.
    }
  }

  // Shadow learning del experimento: la misma semántica que producción, aplicada
  // solo a intentos OK y guardada únicamente en este fichero. Es el brazo
  // "learned"; `server-stats.json` queda fuera del circuito.
  getShadowLearning(provider: string, server: string, now: number = Date.now()): ConcurrencyLearning | null {
    return computeConcurrencyLearning(this.shadow.get(`${provider}:${server}`), provider, server, now);
  }

  private feedShadowLearning(record: AttemptExperimentRecord): void {
    // Misma regla que producción: solo enseñan los intentos que terminaron bien.
    // `completed-level` no entra: describe cómo rindió un nivel, no demuestra
    // mejora frente a baseline.
    const key = `${record.provider}:${record.server}`;
    const levels = this.foldShadowLevels(record.provider, record.server, this.shadow.get(key), [record]);
    if (levels) this.shadow.set(key, levels);
    else this.shadow.delete(key);
  }

  // Aplica las observaciones de unos registros sobre los agregados. Solo entran
  // las decisiones elegibles: `learningEligible=false` queda en el registro para
  // análisis pero no toca pos/neu/neg/bps. Sin marca se comporta como siempre.
  private foldShadowLevels(
    provider: string,
    server: string,
    base: Record<string, ConcurrencyLevelStats> | undefined,
    records: readonly AttemptExperimentRecord[],
  ): Record<string, ConcurrencyLevelStats> | undefined {
    let levels = base;
    for (const record of records) {
      if (!record.success) continue;
      const eligible = record.decisions.filter((decision) => decision.learningEligible !== false);
      const at = record.startedAt + record.durationMs;
      for (const observation of concurrencyObservationsFromDecisions(eligible)) {
        levels = applyConcurrencyObservation(levels, { provider, server, ...observation }, at);
      }
    }
    return levels;
  }

  // Un registro que ya alimentó el aprendizaje puede quedar marcado después como
  // compartido (llega el EP solapado que corrige sus marcas). Al dejar de ser
  // elegible, su contribución sale del shadow: se reconstruye la clave desde los
  // registros visibles con el mismo filtro. (Los ya fuera del ring no entran en
  // la reconstrucción; a volúmenes reales no hay ninguno.)
  private rebuildShadowFor(provider: string, server: string): void {
    const key = `${provider}:${server}`;
    const records = this.records.filter((record) => record.provider === provider && record.server === server);
    const levels = this.foldShadowLevels(provider, server, undefined, records);
    if (levels) this.shadow.set(key, levels);
    else this.shadow.delete(key);
  }

  getReport(): ConcurrencyExperimentReport {
    return {
      aggregates: Array.from(this.aggregates.values()),
      records: [...this.records],
      anomalies: detectExperimentAnomalies(this.records),
      sharing: computeSharing(this.records),
    };
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
      const snapshot: ConcurrencyExperimentSnapshot = {
        version: 1,
        records: [...this.records],
        aggregates: Object.fromEntries(this.aggregates),
        learning: Object.fromEntries(this.shadow),
      };
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(snapshot));
      fs.renameSync(tmp, this.filePath);
    } catch {
      // El modo experimental nunca debe romper descargas.
    }
  }
}
