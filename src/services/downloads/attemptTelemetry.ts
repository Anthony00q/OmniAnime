import type { ServerFailureCategory } from '../persistence/ServerStatsStore';
import type { AttemptConcurrencyHandle } from './attemptConcurrency';
import { updateSpeedWindow, type SpeedWindow } from '../../utils/downloads/speedMeter';

// Observación temporal de un intento (un episodio contra un servidor): describe
// el estado en vivo sin decidir nada (sin setTarget, sin persistir, sin timers).
// Cada intento tiene su instancia, así el throughput de un EP no se mezcla con el
// de otro ni con el de otros servidores. Fuentes: bytes del engine, el speedMeter
// de la UI, los streams vivos del handle y la taxonomía de errores del store.
//   - stall: señal descriptiva con el mismo umbral de 30 s que ya usa el
//     downloader; no cambia la semántica de sus timeouts/stalls.

export const TELEMETRY_WINDOW_MS = 10_000;
export const TELEMETRY_SAMPLE_INTERVAL_MS = 1_000;
// Mismo umbral que los stalls del downloader (partes de 30 s y stream simple).
export const TELEMETRY_STALL_MS = 30_000;
export const TELEMETRY_MAX_SAMPLES = 1024;
export const TELEMETRY_MAX_EVENTS = 32;

export type AttemptTelemetryOutcome = 'running' | 'ok' | 'failed' | 'interrupted';

// Muestra compacta de observación (timestamp + estado del intento).
export interface AttemptObservationSample {
  at: number;
  targetConcurrency: number;
  actualConcurrency: number;
  loadedBytes: number;
  throughputBps: number;
  progress01: number;
}

// Ventana temporal agregada: la unidad comparable para la política futura.
export interface AttemptThroughputWindow {
  index: number;
  startAt: number;
  endAt: number;
  bytes: number;
  throughputBps: number;
  avgActualConcurrency: number;
  avgTargetConcurrency: number;
  progressAtEnd: number;
  samples: number;
  // `complete`: cubrió su duración entera dentro del intento.
  // `valid`: no fue cortada por una interrupción del usuario (pausa/cancel).
  complete: boolean;
  valid: boolean;
}

// Hecho registrado con la taxonomía actual.
export interface AttemptTelemetryEvent {
  at: number;
  category: ServerFailureCategory;
}

// Señales descriptivas del estado. Describir, no decidir.
export interface AttemptStability {
  isMakingProgress: boolean;
  isStalled: boolean;
  hasRecentError: boolean;
  // Coeficiente de variación del throughput de ventanas válidas (null si < 2).
  throughputVariation: number | null;
}

export interface AttemptTelemetrySnapshot {
  itemId: string;
  episode: number;
  server: string;
  startedAt: number;
  elapsedMs: number;
  loadedBytes: number;
  progress01: number;
  targetConcurrency: number;
  actualConcurrency: number;
  // Medida instantánea reutilizada (ventana >= 1 s del speedMeter).
  throughputBps: number;
  // Throughput de la ventana actual (o de la última cerrada).
  windowThroughputBps: number;
  // Suavizado EWMA sobre ventanas válidas (primitiva matemática, sin política).
  smoothedBps: number | null;
  sampleCount: number;
  windowCount: number;
  outcome: AttemptTelemetryOutcome;
  interrupted: boolean;
  closed: boolean;
  stability: AttemptStability;
}

export interface AttemptTelemetryOptions {
  itemId: string;
  episode: number;
  server: string;
  handle: AttemptConcurrencyHandle;
  // Reloj inyectable para tests deterministas.
  now?: () => number;
  windowMs?: number;
  sampleIntervalMs?: number;
  stallMs?: number;
  maxSamples?: number;
}

// EWMA de la secuencia: primitiva de suavizado. No decide nada.
export function ewma(values: number[], alpha = 0.3): number | null {
  if (!Array.isArray(values) || values.length === 0) return null;
  const a = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 0.3;
  let acc = values[0];
  for (let i = 1; i < values.length; i += 1) {
    acc = a * values[i] + (1 - a) * acc;
  }
  return acc;
}

// Coeficiente de variación (desviación/media). Null con menos de 2 muestras.
export function coefficientOfVariation(values: number[]): number | null {
  if (!Array.isArray(values) || values.length < 2) return null;
  const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
  if (!(mean > 0)) return null;
  const variance = values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / values.length;
  return Math.sqrt(variance) / mean;
}

export class AttemptTelemetry {
  readonly itemId: string;
  readonly episode: number;
  readonly server: string;

  private readonly handle: AttemptConcurrencyHandle;
  private readonly now: () => number;
  private readonly windowMs: number;
  private readonly sampleIntervalMs: number;
  private readonly stallMs: number;
  private readonly maxSamples: number;

  private readonly startedAt: number;
  private endedAt: number | null = null;
  private lastAt: number;
  private lastSampleAt: number;
  private lastBytesAt: number;
  private lastLoadedBytes = 0;
  private lastProgress01 = 0;
  private lastSpeedBps = 0;
  private speedWindow: SpeedWindow | undefined;
  private liveTarget: number;
  private liveActual: number;

  private windowStart: number;
  private windowBytes = 0;
  private windowActualMs = 0;
  private windowTargetMs = 0;
  private windowSamples = 0;

  private readonly sampleList: AttemptObservationSample[] = [];
  private readonly windowList: AttemptThroughputWindow[] = [];
  private readonly eventList: AttemptTelemetryEvent[] = [];

  private outcome: AttemptTelemetryOutcome = 'running';
  private interrupted = false;
  private closed = false;
  private disposed = false;
  private unsubscribeHandle: (() => void) | null;

  constructor(options: AttemptTelemetryOptions) {
    this.itemId = options.itemId;
    this.episode = options.episode;
    this.server = options.server;
    this.handle = options.handle;
    this.now = typeof options.now === 'function' ? options.now : () => Date.now();
    this.windowMs = Math.max(100, Math.floor(options.windowMs ?? TELEMETRY_WINDOW_MS));
    this.sampleIntervalMs = Math.max(1, Math.floor(options.sampleIntervalMs ?? TELEMETRY_SAMPLE_INTERVAL_MS));
    this.stallMs = Math.max(1, Math.floor(options.stallMs ?? TELEMETRY_STALL_MS));
    this.maxSamples = Math.max(8, Math.floor(options.maxSamples ?? TELEMETRY_MAX_SAMPLES));

    const t = this.now();
    this.startedAt = t;
    this.lastAt = t;
    this.lastSampleAt = t;
    this.lastBytesAt = t;
    this.windowStart = t;
    this.liveTarget = options.handle.current();
    this.liveActual = options.handle.actual();

    // Muestra inicial para que la serie siempre arranque observada.
    this.pushSample(t);
    // Los cambios de objetivo del handle fuerzan muestra (frontera de fase).
    this.unsubscribeHandle = options.handle.subscribe((target) => {
      if (this.closed || this.disposed) return;
      const at = this.now();
      this.advanceTo(at, 0);
      this.refreshConcurrency(target);
      this.maybeSample(at, true);
    });
  }

  // Alimentación desde el progreso crudo del engine (antes de cualquier gate o
  // throttle). `loadedBytes` son bytes contabilizados como descargados.
  recordBytes(loadedBytes: number | undefined, progress01?: number): void {
    if (this.closed || this.disposed) return;
    const t = this.now();
    const clean =
      typeof loadedBytes === 'number' && Number.isFinite(loadedBytes) && loadedBytes >= 0 ? loadedBytes : null;
    const delta = clean !== null ? clean - this.lastLoadedBytes : 0;
    this.advanceTo(t, Math.max(0, delta));
    if (clean !== null) {
      if (delta > 0) {
        this.lastLoadedBytes = clean;
        this.lastBytesAt = t;
      } else if (delta < 0) {
        // Retroceso de bytes (no debería pasar dentro de un intento): nueva base.
        this.lastLoadedBytes = clean;
        this.lastBytesAt = t;
        this.speedWindow = undefined;
      }
      // Misma métrica instantánea que ve la UI: sin contar dos veces.
      const res = updateSpeedWindow(this.speedWindow, clean, t);
      this.speedWindow = res.window;
      if (res.speedBps !== undefined) this.lastSpeedBps = res.speedBps;
    }
    if (typeof progress01 === 'number' && Number.isFinite(progress01)) {
      this.lastProgress01 = Math.max(0, Math.min(1, progress01));
    }
    this.refreshConcurrency();
    this.maybeSample(t);
  }

  // Hecho registrado con la taxonomía actual (sin categorías nuevas).
  recordFailure(category: ServerFailureCategory): void {
    if (this.closed || this.disposed) return;
    this.pushEvent(this.now(), category);
  }

  // Cierre con el veredicto del intento. El intervalo cortado por una
  // interrupción del usuario se marca no válido: nunca parece degradación.
  finish(outcome: 'ok' | 'failed' | 'interrupted', category?: ServerFailureCategory | null): void {
    if (this.closed || this.disposed) return;
    const t = this.now();
    this.advanceTo(t, 0);
    this.refreshConcurrency();
    if (category) this.pushEvent(t, category);
    this.outcome = outcome;
    this.interrupted = outcome === 'interrupted';
    this.maybeSample(t, true);
    if (t > this.windowStart) this.closeWindow(t, false, outcome !== 'interrupted');
    this.closed = true;
    this.endedAt = t;
  }

  // La observación muere con el intento: sin timers, listeners ni callbacks.
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (!this.closed) {
      // Salida sin veredicto (error inesperado): cierre como interrupción.
      const t = this.now();
      this.advanceTo(t, 0);
      this.outcome = 'interrupted';
      this.interrupted = true;
      if (t > this.windowStart) this.closeWindow(t, false, false);
      this.closed = true;
      this.endedAt = t;
    }
    this.unsubscribeHandle?.();
    this.unsubscribeHandle = null;
  }

  isClosed(): boolean {
    return this.closed;
  }

  currentTarget(): number {
    return this.liveTarget;
  }

  actualConcurrency(): number {
    return this.liveActual;
  }

  loadedBytes(): number {
    return this.lastLoadedBytes;
  }

  // Throughput instantáneo (misma métrica de >= 1 s que usa la UI).
  throughput(): number {
    return this.lastSpeedBps;
  }

  // Throughput de la ventana en curso (o del último cierre).
  windowThroughput(): number {
    if (this.closed) {
      const last = this.windowList[this.windowList.length - 1];
      return last ? last.throughputBps : 0;
    }
    const elapsedMs = this.now() - this.windowStart;
    return elapsedMs > 0 ? this.windowBytes / (elapsedMs / 1000) : 0;
  }

  // Suavizado EWMA sobre ventanas válidas (primitiva; sin umbrales ni decisiones).
  smoothedThroughput(): number | null {
    return ewma(this.validWindowRates(), 0.3);
  }

  elapsedMs(): number {
    return (this.endedAt ?? this.now()) - this.startedAt;
  }

  stability(): AttemptStability {
    const now = this.endedAt ?? this.now();
    return {
      isMakingProgress: !this.closed && now - this.lastBytesAt <= this.windowMs,
      isStalled: !this.closed && now - this.lastBytesAt > this.stallMs,
      hasRecentError: this.eventList.some(
        (event) => event.at >= now - this.windowMs && event.category !== 'cancelled' && event.category !== 'skipped',
      ),
      throughputVariation: coefficientOfVariation(this.validWindowRates()),
    };
  }

  snapshot(): AttemptTelemetrySnapshot {
    return {
      itemId: this.itemId,
      episode: this.episode,
      server: this.server,
      startedAt: this.startedAt,
      elapsedMs: this.elapsedMs(),
      loadedBytes: this.lastLoadedBytes,
      progress01: this.lastProgress01,
      targetConcurrency: this.liveTarget,
      actualConcurrency: this.liveActual,
      throughputBps: this.lastSpeedBps,
      windowThroughputBps: this.windowThroughput(),
      smoothedBps: this.smoothedThroughput(),
      sampleCount: this.sampleList.length,
      windowCount: this.windowList.length,
      outcome: this.outcome,
      interrupted: this.interrupted,
      closed: this.closed,
      stability: this.stability(),
    };
  }

  samples(): readonly AttemptObservationSample[] {
    return this.sampleList;
  }

  // Ventanas cerradas (completas o la parcial final), para comparar niveles.
  windows(): readonly AttemptThroughputWindow[] {
    if (!this.closed) this.advanceTo(this.now(), 0);
    return this.windowList;
  }

  events(): readonly AttemptTelemetryEvent[] {
    return this.eventList;
  }

  private validWindowRates(): number[] {
    return this.windowList.filter((w) => w.valid && w.bytes > 0).map((w) => w.throughputBps);
  }

  private refreshConcurrency(target?: number): void {
    this.liveTarget = typeof target === 'number' ? target : this.handle.current();
    this.liveActual = this.handle.actual();
  }

  private pushSample(at: number): void {
    this.sampleList.push({
      at,
      targetConcurrency: this.liveTarget,
      actualConcurrency: this.liveActual,
      loadedBytes: this.lastLoadedBytes,
      throughputBps: this.lastSpeedBps,
      progress01: this.lastProgress01,
    });
    if (this.sampleList.length > this.maxSamples) {
      this.sampleList.splice(0, this.sampleList.length - this.maxSamples);
    }
    this.windowSamples += 1;
  }

  private maybeSample(at: number, force = false): void {
    const last = this.sampleList[this.sampleList.length - 1];
    const changed = !last || last.targetConcurrency !== this.liveTarget || last.actualConcurrency !== this.liveActual;
    if (!force && !changed && at - this.lastSampleAt < this.sampleIntervalMs) return;
    this.lastSampleAt = at;
    this.pushSample(at);
  }

  private pushEvent(at: number, category: ServerFailureCategory): void {
    this.eventList.push({ at, category });
    if (this.eventList.length > TELEMETRY_MAX_EVENTS) {
      this.eventList.splice(0, this.eventList.length - TELEMETRY_MAX_EVENTS);
    }
  }

  // Reparte el tiempo (y los bytes del intervalo) entre las ventanas que cruza.
  // Un intervalo que cae entero en la ventana actual suma exacto; solo se
  // prorratea cuando cruza un borde (así los totales no arrastran coma).
  private advanceTo(t: number, byteDelta: number): void {
    const span = t - this.lastAt;
    if (span > 0) {
      const windowEnd = this.windowStart + this.windowMs;
      if (t <= windowEnd) {
        this.attributeTime(span);
        this.windowBytes += byteDelta;
      } else {
        const rate = byteDelta / span;
        let cursor = this.lastAt;
        while (cursor < t) {
          const end = this.windowStart + this.windowMs;
          const at = Math.min(t, end);
          const dt = at - cursor;
          this.attributeTime(dt);
          this.windowBytes += rate * dt;
          cursor = at;
          if (cursor >= end) {
            this.closeWindow(end, true, true);
            this.windowStart = end;
          }
        }
      }
      this.lastAt = t;
    } else if (byteDelta > 0) {
      this.windowBytes += byteDelta;
    }
    // Ventanas vencidas sin muestras (huecos) se cierran con 0 bytes: el
    // "sin progreso" queda en la serie en vez de desaparecer.
    while (t >= this.windowStart + this.windowMs) {
      this.closeWindow(this.windowStart + this.windowMs, true, true);
      this.windowStart += this.windowMs;
    }
  }

  private attributeTime(dtMs: number): void {
    if (!(dtMs > 0)) return;
    this.windowActualMs += dtMs * this.liveActual;
    this.windowTargetMs += dtMs * this.liveTarget;
  }

  private closeWindow(endAt: number, complete: boolean, valid: boolean): void {
    const elapsedMs = endAt - this.windowStart;
    if (!(elapsedMs > 0)) return;
    this.windowList.push({
      index: this.windowList.length,
      startAt: this.windowStart,
      endAt,
      bytes: this.windowBytes,
      throughputBps: this.windowBytes / (elapsedMs / 1000),
      avgActualConcurrency: this.windowActualMs / elapsedMs,
      avgTargetConcurrency: this.windowTargetMs / elapsedMs,
      progressAtEnd: this.lastProgress01,
      samples: this.windowSamples,
      complete,
      valid,
    });
    this.windowBytes = 0;
    this.windowActualMs = 0;
    this.windowTargetMs = 0;
    this.windowSamples = 0;
  }
}

export function createAttemptTelemetry(options: AttemptTelemetryOptions): AttemptTelemetry {
  return new AttemptTelemetry(options);
}
