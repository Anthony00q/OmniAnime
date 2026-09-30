import type { ConcurrencyObservationKind, ServerFailureCategory } from '../persistence/ServerStatsStore';
import type { ConcurrencyApplicationMode } from './downloadContracts';
import {
  DIRECT_CONCURRENCY_LEVELS,
  readApplicationMode,
  stepDownLevel,
  stepUpLevel,
  type AttemptConcurrencyHandle,
} from './attemptConcurrency';
import {
  coefficientOfVariation,
  type AttemptStability,
  type AttemptTelemetryEvent,
  type AttemptThroughputWindow,
} from './attemptTelemetry';

// Controlador de concurrencia por intento (un EP contra un servidor): observa el
// rendimiento por ventanas y mueve el número de conexiones del intento hacia el
// nivel estable con mejor throughput, no hacia el máximo posible. Ante la duda
// mantiene el nivel: subir pide evidencia clara de mejora, bajar, de degradación.
// Entre dos cambios median ventanas de cooldown.
//
// Niveles: solo la escalera 1→2→4→6→8 (stepUpLevel/stepDownLevel).

export type AdaptiveConcurrencyState = 'warmup' | 'stable' | 'probing' | 'cooldown' | 'inert';

export type AdaptiveDecisionKind =
  | 'probe-up'
  | 'probe-improved'
  | 'probe-kept'
  | 'probe-degraded'
  | 'probe-timeout'
  | 'probe-not-applicable'
  | 'decrease'
  | 'strong-backoff';

export type AdaptiveDecisionCause =
  | 'exploracion'
  | 'mejora-clara'
  | 'sin-mejora'
  | 'degradacion-clara'
  | 'stall-con-trabajo'
  | 'errores-repetidos'
  | 'senal-fuerte'
  | 'evidencia-agotada'
  | 'sin-oportunidad';

export interface AdaptiveDecision {
  atWindow: number;
  // Timestamp de la decisión (para correlacionar con la telemetría).
  at: number;
  kind: AdaptiveDecisionKind;
  from: number;
  to: number;
  cause: AdaptiveDecisionCause;
  baselineBps: number | null;
  observedBps: number | null;
}

// Vista de solo lectura de la medición (la satisface `AttemptTelemetry`).
export interface AdaptiveTelemetryView {
  windows(): readonly AttemptThroughputWindow[];
  stability(): AttemptStability;
  events(): readonly AttemptTelemetryEvent[];
  snapshot(): { progress01: number; targetConcurrency: number; actualConcurrency: number };
}

export interface AdaptiveConcurrencyPolicy {
  // Ventanas de calentamiento que se ignoran como evidencia.
  warmupWindows: number;
  // Ventanas comparables de evidencia para decidir en un nivel.
  evidenceWindows: number;
  // Ventanas mínimas entre dos cambios (cooldown, en ambas direcciones).
  cooldownWindows: number;
  // Ventanas máximas esperando evidencia comparable de un probe.
  probeTimeoutWindows: number;
  // Margen de mejora para aceptar una subida (porcentual + absoluto + variación).
  minImprovementPct: number;
  minImprovementAbsBps: number;
  // Margen de degradación para revertir o bajar (siempre más agresivo que la mejora).
  minDegradationPct: number;
  minDegradationAbsBps: number;
  // Ventanas degradadas consecutivas para bajar un nivel.
  degradationWindows: number;
  // Ventanas sin progreso (con trabajo) para bajar un nivel.
  stallWindows: number;
  // Errores repetidos (categorías ambiguas) para bajar / hacer backoff.
  weakErrorCount: number;
  strongErrorCount: number;
  // A partir de este progreso la ventana es "final de archivo" y nunca penaliza.
  tailProgress: number;
  // Tolerancia de avgActual/avgTarget respecto al nivel para comparar ventanas.
  actualTolerance: number;
  // Niveles que salta una señal fuerte (backoff) hacia abajo.
  strongBackoffLevels: number;
}

export const DEFAULT_ADAPTIVE_POLICY: AdaptiveConcurrencyPolicy = {
  // El arranque (DNS, TLS, probe Range) contamina la primera ventana.
  warmupWindows: 1,
  // Con una sola ventana de evidencia cualquier fluctuación parecería mejora.
  evidenceWindows: 2,
  // Hysteresis temporal: sin esto habría bucles 4→6→4→6 en segundos.
  cooldownWindows: 2,
  // Sin evidencia comparable en 6 ventanas, el cambio no se está aplicando.
  probeTimeoutWindows: 6,
  // 5% de mejora: por debajo, subir conexiones solo acepta ruido.
  minImprovementPct: 0.05,
  // Suelo para enlaces lentos donde el 5% sería micro-ruido.
  minImprovementAbsBps: 32 * 1024,
  // 15% de caída para bajar: más tolerante que la mejora, porque una bajada
  // injusta castiga al servidor y al usuario.
  minDegradationPct: 0.15,
  // La caída debe ser material.
  minDegradationAbsBps: 128 * 1024,
  // Una caída aislada es la vida normal de una red: hacen falta dos.
  degradationWindows: 2,
  // Dos ventanas sin progreso con trabajo pendiente (~20 s).
  stallWindows: 2,
  // Errores ambiguos: 2 para bajar, 3 para backoff. Uno solo no penaliza.
  weakErrorCount: 2,
  strongErrorCount: 3,
  // Al 95% la cola se agota: ese "actual < target" no es el servidor limitando.
  tailProgress: 0.95,
  // Tolerancia para comparar ventanas; deja fuera el efecto diferido de Mega.
  actualTolerance: 0.15,
  // Una señal fuerte salta 2 niveles (8→4): la evidencia indica sobrecarga real.
  strongBackoffLevels: 2,
};

// Solo estas categorías penalizan, y solo por acumulación: la taxonomía actual
// no distingue rate-limit, así que un error aislado no prueba nada sobre la
// concurrencia. 'cancelled'/'skipped' (usuario), 'timeout-start' e
// 'invalid-output' no penalizan nunca.
const PENALIZABLE_CATEGORIES: ReadonlySet<ServerFailureCategory> = new Set<ServerFailureCategory>([
  'tool-error',
  'attempt-failed',
]);

const MAX_LEVEL = DIRECT_CONCURRENCY_LEVELS[DIRECT_CONCURRENCY_LEVELS.length - 1];

export interface AdaptiveConcurrencyControllerOptions {
  itemId: string;
  episode: number;
  // Solo metadata de identidad: la política no hace lógica por servidor.
  server: string;
  handle: AttemptConcurrencyHandle;
  telemetry: AdaptiveTelemetryView;
  policy?: Partial<AdaptiveConcurrencyPolicy>;
  // Cadencia del auto-tick en producción. `null` lo desactiva (los tests llaman
  // `evaluate()` a mano).
  tickIntervalMs?: number | null;
  // Techo inicial de exploración (el safeMax aprendido); solo guía, no fija nada.
  initialProbeCeiling?: number;
  // Reloj para los timestamps de decisión (tests deterministas).
  now?: () => number;
  // Capacidad declarada del engine ('hot'/'deferred'/'not-applicable'). La
  // realidad en vivo la reporta quien descarga al handle y manda sobre esta.
  applicationMode?: ConcurrencyApplicationMode;
}

interface WindowStats {
  mean: number;
  cv: number;
}

function windowStats(list: readonly AttemptThroughputWindow[]): WindowStats {
  const rates = list.map((w) => w.throughputBps);
  const mean = rates.reduce((acc, rate) => acc + rate, 0) / rates.length;
  return { mean, cv: coefficientOfVariation(rates) ?? 0 };
}

export class AdaptiveConcurrencyController {
  readonly itemId: string;
  readonly episode: number;
  readonly server: string;

  private readonly handle: AttemptConcurrencyHandle;
  private readonly telemetry: AdaptiveTelemetryView;
  private readonly policy: AdaptiveConcurrencyPolicy;
  private readonly now: () => number;
  private readonly applicationMode: ConcurrencyApplicationMode;
  private readonly timer: ReturnType<typeof setInterval> | null = null;

  private phase: AdaptiveConcurrencyState = 'warmup';
  private level: number;
  private probeCeiling: number;
  private baseline: WindowStats | null = null;
  private evidence: AttemptThroughputWindow[] = [];
  private probeEvidence: AttemptThroughputWindow[] = [];
  private probeSettle = 0;
  private probeDeadline = 0;
  private probeFrom = 0;
  // El probe cuenta como aplicado cuando una ventana del nivel nuevo sale
  // comparable (en engines diferidos, al crear el siguiente stream).
  private probeApplied = false;
  private stallStreak = 0;
  private degradedStreak = 0;
  private penalizableSinceChange = 0;
  private eventCursor = 0;
  private consumed = 0;
  private cooldownRemaining = 0;
  private readonly decisions: AdaptiveDecision[] = [];
  private disposed = false;

  constructor(options: AdaptiveConcurrencyControllerOptions) {
    this.itemId = options.itemId;
    this.episode = options.episode;
    this.server = options.server;
    this.handle = options.handle;
    this.telemetry = options.telemetry;
    this.policy = { ...DEFAULT_ADAPTIVE_POLICY, ...(options.policy ?? {}) };
    this.now = typeof options.now === 'function' ? options.now : () => Date.now();
    this.applicationMode = options.applicationMode ?? 'hot';
    // Se explora desde donde esté el usuario; nunca se obliga a empezar de cero.
    this.level = options.handle.current();
    this.probeCeiling = normalizeProbeCeiling(options.initialProbeCeiling) ?? MAX_LEVEL;

    const tickMs = options.tickIntervalMs === undefined ? 1000 : options.tickIntervalMs;
    if (typeof tickMs === 'number' && tickMs > 0) {
      this.timer = setInterval(() => this.evaluate(), tickMs);
      (this.timer as unknown as { unref?: () => void }).unref?.();
    }
  }

  // Un paso de decisión: consume ventanas, hechos y señales vivas.
  evaluate(): void {
    if (this.disposed) return;
    const windows = this.telemetry.windows();
    while (this.consumed < windows.length) {
      const window = windows[this.consumed];
      this.consumed += 1;
      this.consumeWindow(window);
      if (this.disposed) return;
    }
    this.consumeNewEvents();
    this.checkLiveSignals();
    this.checkProbeApplication();
  }

  // El controlador muere con el intento: sin timers ni decisiones tardías.
  dispose(): void {
    if (this.disposed) return;
    // Un probe pendiente sin dónde aplicarse concluye como no-aplicable.
    if (this.phase === 'probing' && this.effectiveApplicationMode() !== 'hot' && !this.probeApplied) {
      this.resolveProbeNotApplicable();
    }
    this.disposed = true;
    this.phase = 'inert';
    if (this.timer) clearInterval(this.timer);
  }

  state(): AdaptiveConcurrencyState {
    return this.disposed ? 'inert' : this.phase;
  }

  snapshot(): {
    itemId: string;
    episode: number;
    server: string;
    state: AdaptiveConcurrencyState;
    level: number;
    probeCeiling: number;
    decisions: readonly AdaptiveDecision[];
    baselineMeanBps: number | null;
    consumedWindows: number;
    disposed: boolean;
  } {
    return {
      itemId: this.itemId,
      episode: this.episode,
      server: this.server,
      state: this.state(),
      level: this.level,
      probeCeiling: this.probeCeiling,
      decisions: [...this.decisions],
      baselineMeanBps: this.baseline?.mean ?? null,
      consumedWindows: this.consumed,
      disposed: this.disposed,
    };
  }

  private consumeWindow(window: AttemptThroughputWindow): void {
    const tail = window.progressAtEnd >= this.policy.tailProgress;
    const comparable =
      !tail &&
      window.valid &&
      window.complete &&
      this.fits(window.avgTargetConcurrency) &&
      this.fits(window.avgActualConcurrency);

    // El final de archivo no cuenta como stall: no hay trabajo que repartir.
    if (!tail && window.valid && window.complete && this.fits(window.avgActualConcurrency)) {
      this.stallStreak = window.bytes > 0 ? 0 : this.stallStreak + 1;
    } else if (tail || !window.valid) {
      this.stallStreak = 0;
    }

    if (this.phase === 'warmup') {
      // La primera ventana absorbe el arranque: nunca decide.
      if (window.index + 1 >= this.policy.warmupWindows) this.phase = 'stable';
      return;
    }

    if (this.cooldownRemaining > 0) {
      this.cooldownRemaining -= 1;
      if (this.cooldownRemaining === 0 && this.phase === 'cooldown') this.phase = 'stable';
    }

    // Durante un probe las señales negativas las resuelve la comparación del probe.
    if (this.phase === 'probing') {
      this.consumeProbeWindow(window, comparable);
      return;
    }

    if (comparable) {
      this.evidence.push(window);
      // Sin probe también se fija baseline; sin él no hay vigilancia de degradación.
      if (!this.baseline && this.evidence.length >= this.policy.evidenceWindows) {
        this.baseline = windowStats(this.evidence);
      }
      if (this.baseline && this.isDegradedRate(window.throughputBps)) this.degradedStreak += 1;
      else this.degradedStreak = 0;
    } else {
      // Ventana no comparable: no acumula evidencia ni degradación.
      this.degradedStreak = 0;
    }

    if (this.cooldownRemaining === 0) {
      // Las señales negativas se resuelven antes de explorar.
      if (this.stallStreak >= this.policy.stallWindows) {
        this.applyChange(stepDownLevel(this.level), 'decrease', 'stall-con-trabajo', null, 0);
        return;
      }
      if (this.degradedStreak >= this.policy.degradationWindows) {
        this.applyChange(
          stepDownLevel(this.level),
          'decrease',
          'degradacion-clara',
          this.baseline?.mean ?? null,
          window.throughputBps,
        );
        return;
      }
      if (
        this.evidence.length >= this.policy.evidenceWindows &&
        this.level < this.probeCeiling &&
        this.level < MAX_LEVEL
      ) {
        this.startProbe();
      }
    }
  }

  private consumeProbeWindow(window: AttemptThroughputWindow, comparable: boolean): void {
    // Las primeras ventanas tras el cambio son asentamiento: no son evidencia.
    if (this.probeSettle > 0) {
      this.probeSettle -= 1;
      return;
    }
    // Una ventana comparable del nivel nuevo demuestra que el cambio se aplicó.
    if (comparable) {
      this.probeApplied = true;
      this.probeEvidence.push(window);
    }
    if (this.probeEvidence.length >= this.policy.evidenceWindows) {
      this.resolveProbe();
      return;
    }
    if (this.effectiveApplicationMode() !== 'hot' && !this.probeApplied) {
      // Espera mientras exista una frontera futura; al final del archivo ya no la hay.
      if (window.progressAtEnd >= this.policy.tailProgress || window.index >= this.probeDeadline) {
        this.resolveProbeNotApplicable();
      }
      return;
    }
    if (window.index >= this.probeDeadline) this.resolveProbeTimeout();
  }

  private startProbe(): void {
    const baseline = windowStats(this.evidence);
    this.baseline = baseline;
    const next = stepUpLevel(this.level);
    if (this.effectiveApplicationMode() === 'not-applicable') {
      // Sin frontera futura el cambio no puede aplicarse: se registra la
      // exploración sin tocar el target (lo haría no comparables).
      this.pushDecision('probe-not-applicable', 'sin-oportunidad', baseline.mean, null, this.level, next);
      this.probeCeiling = this.level;
      return;
    }
    this.probeFrom = this.level;
    this.probeApplied = false;
    if (!this.applyChange(next, 'probe-up', 'exploracion', baseline.mean, null, 'probing')) return;
    this.probeSettle = this.policy.cooldownWindows;
    this.probeDeadline = this.consumed + this.policy.probeTimeoutWindows;
    this.probeEvidence = [];
  }

  private resolveProbe(): void {
    const observed = windowStats(this.probeEvidence);
    const baseline = this.baseline ?? observed;
    // Mejora = absoluta + porcentual + por encima de la variación del baseline.
    const margin = Math.max(
      this.policy.minImprovementAbsBps,
      this.policy.minImprovementPct * baseline.mean,
      baseline.cv * baseline.mean,
    );
    if (observed.mean >= baseline.mean + margin) {
      this.pushDecision('probe-improved', 'mejora-clara', baseline.mean, observed.mean, this.probeFrom, this.level);
      this.baseline = observed;
      this.evidence = [];
      this.phase = 'stable';
      return;
    }
    const degraded =
      observed.mean <= baseline.mean * (1 - this.policy.minDegradationPct) &&
      observed.mean <= baseline.mean - this.policy.minDegradationAbsBps;
    if (degraded) {
      // El nivel nuevo empeora: vuelve al base y no lo vuelve a probar.
      this.applyChange(stepDownLevel(this.level), 'probe-degraded', 'degradacion-clara', baseline.mean, observed.mean);
      this.probeCeiling = this.level;
      // Se conserva el baseline del nivel base al que se vuelve.
      this.baseline = baseline;
      return;
    }
    // Sin mejora no es malo: se mantiene el nivel y no se explora más arriba.
    this.pushDecision('probe-kept', 'sin-mejora', baseline.mean, observed.mean, this.probeFrom, this.level);
    this.probeCeiling = this.level;
    this.baseline = observed;
    this.evidence = [];
    this.phase = 'stable';
  }

  private resolveProbeNotApplicable(): void {
    // El cambio no llegó a aplicarse en este intento. No es degradación ni
    // fallo: no penaliza ni enseña.
    this.pushDecision(
      'probe-not-applicable',
      'sin-oportunidad',
      this.baseline?.mean ?? null,
      null,
      this.probeFrom,
      this.level,
    );
    // Sin evidencia del nivel nuevo no se sigue explorando en este intento.
    this.probeCeiling = this.level;
    this.probeEvidence = [];
    this.evidence = [];
    this.phase = 'stable';
  }

  private resolveProbeTimeout(): void {
    // Sin evidencia a tiempo: se mantiene sin explorar más ni castigar.
    this.pushDecision(
      'probe-timeout',
      'evidencia-agotada',
      this.baseline?.mean ?? null,
      null,
      this.probeFrom,
      this.level,
    );
    this.probeCeiling = this.level;
    this.probeEvidence = [];
    this.evidence = [];
    this.phase = 'stable';
  }

  private consumeNewEvents(): void {
    const events = this.telemetry.events();
    while (this.eventCursor < events.length) {
      const event = events[this.eventCursor];
      this.eventCursor += 1;
      if (PENALIZABLE_CATEGORIES.has(event.category)) this.penalizableSinceChange += 1;
    }
  }

  private checkLiveSignals(): void {
    if (this.disposed || this.phase === 'warmup' || this.cooldownRemaining > 0) return;
    const snapshot = this.telemetry.snapshot();
    const workPending = snapshot.progress01 < this.policy.tailProgress;
    // Señales solo con trabajo pendiente y concurrencia real ≈ objetivo: el
    // final de archivo y el efecto diferido no son culpa del servidor.
    if (!workPending || !this.fits(snapshot.actualConcurrency)) return;

    if (this.penalizableSinceChange >= this.policy.strongErrorCount) {
      this.applyChange(
        this.strongBackoffLevel(),
        'strong-backoff',
        'errores-repetidos',
        this.baseline?.mean ?? null,
        null,
      );
      return;
    }
    if (this.phase !== 'stable') return;
    if (this.penalizableSinceChange >= this.policy.weakErrorCount) {
      this.applyChange(stepDownLevel(this.level), 'decrease', 'errores-repetidos', this.baseline?.mean ?? null, null);
      return;
    }
    if (this.telemetry.stability().isStalled) {
      this.applyChange(this.strongBackoffLevel(), 'strong-backoff', 'senal-fuerte', this.baseline?.mean ?? null, null);
    }
  }

  private strongBackoffLevel(): number {
    let target = this.level;
    for (let i = 0; i < this.policy.strongBackoffLevels; i += 1) target = stepDownLevel(target);
    return target;
  }

  // Capacidad en vivo del downloader; si no reporta, vale la del engine.
  private effectiveApplicationMode(): ConcurrencyApplicationMode {
    return readApplicationMode(this.handle, this.applicationMode);
  }

  // Si la aplicación se vuelve imposible, el probe pendiente concluye al momento.
  private checkProbeApplication(): void {
    if (this.disposed || this.phase !== 'probing' || this.probeApplied) return;
    if (this.effectiveApplicationMode() === 'not-applicable') this.resolveProbeNotApplicable();
  }

  private isDegradedRate(rateBps: number): boolean {
    const baseline = this.baseline;
    if (!baseline) return false;
    return (
      rateBps <= baseline.mean * (1 - this.policy.minDegradationPct) &&
      rateBps <= baseline.mean - this.policy.minDegradationAbsBps
    );
  }

  // avgActual/avgTarget ≈ nivel: solo así la ventana es un experimento del nivel.
  private fits(value: number): boolean {
    const tolerance = this.level * this.policy.actualTolerance;
    return Number.isFinite(value) && Math.abs(value - this.level) <= tolerance;
  }

  // Única acción sobre la descarga: handle.setTarget().
  private applyChange(
    to: number,
    kind: AdaptiveDecisionKind,
    cause: AdaptiveDecisionCause,
    baselineBps: number | null,
    observedBps: number | null,
    nextPhase: 'cooldown' | 'probing' = 'cooldown',
  ): boolean {
    if (this.disposed || to === this.level) return false;
    if (this.handle.isDisposed()) return false;
    if (!this.handle.setTarget(to)) return false;
    this.pushDecision(kind, cause, baselineBps, observedBps, this.level, to);
    this.level = to;
    // Cooldown en ambas direcciones: nunca dos cambios pegados.
    this.cooldownRemaining = this.policy.cooldownWindows;
    this.evidence = [];
    this.probeEvidence = [];
    this.stallStreak = 0;
    this.degradedStreak = 0;
    this.penalizableSinceChange = 0;
    this.eventCursor = this.telemetry.events().length;
    this.phase = nextPhase;
    return true;
  }

  private pushDecision(
    kind: AdaptiveDecisionKind,
    cause: AdaptiveDecisionCause,
    baselineBps: number | null,
    observedBps: number | null,
    from: number = this.level,
    to: number = this.level,
  ): void {
    this.decisions.push({
      atWindow: this.consumed,
      at: this.now(),
      kind,
      from,
      to,
      cause,
      baselineBps,
      observedBps,
    });
  }
}

export function createAdaptiveConcurrencyController(
  options: AdaptiveConcurrencyControllerOptions,
): AdaptiveConcurrencyController {
  return new AdaptiveConcurrencyController(options);
}

function normalizeProbeCeiling(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(DIRECT_CONCURRENCY_LEVELS[0], Math.min(MAX_LEVEL, Math.floor(value)));
}

// Traducción de decisiones a observaciones de aprendizaje (el throughput ya
// viene medido en la decisión):
//   probe-improved           → positivo para el nivel probado
//   probe-kept               → neutral para el probado
//   probe-degraded           → negativo para el probado, positivo para el refugio
//   decrease/strong-backoff  → negativo para el nivel afectado (ventanas)
// probe-up, probe-timeout y los errores ambiguos no enseñan.
export function concurrencyObservationsFromDecisions(
  decisions: readonly AdaptiveDecision[],
): Array<{ level: number; kind: ConcurrencyObservationKind; bps: number }> {
  const observations: Array<{ level: number; kind: ConcurrencyObservationKind; bps: number }> = [];
  for (const decision of decisions) {
    switch (decision.kind) {
      case 'probe-improved':
        observations.push({ level: decision.to, kind: 'positive', bps: decision.observedBps ?? 0 });
        break;
      case 'probe-kept':
        observations.push({ level: decision.to, kind: 'neutral', bps: decision.observedBps ?? 0 });
        break;
      case 'probe-degraded':
        observations.push({ level: decision.from, kind: 'negative', bps: decision.observedBps ?? 0 });
        observations.push({ level: decision.to, kind: 'positive', bps: decision.baselineBps ?? 0 });
        break;
      case 'decrease':
      case 'strong-backoff':
        if (
          decision.cause === 'degradacion-clara' ||
          decision.cause === 'stall-con-trabajo' ||
          decision.cause === 'senal-fuerte'
        ) {
          observations.push({ level: decision.from, kind: 'negative', bps: decision.observedBps ?? 0 });
        }
        break;
      default:
        break;
    }
  }
  return observations;
}
