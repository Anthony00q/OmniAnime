import type { DownloadSettings } from '../../types/settings';

// Concurrencia por intento: cuántos streams concurrentes usa un EP contra un
// servidor (sin mezclar con los EPs en paralelo, que son otra cosa). En modo
// manual el valor es fijo; la escalera 1→2→4→6→8 solo la usa el controlador
// adaptativo. HLS va por su cuenta (`settings.hlsConnections`).

export const DIRECT_CONCURRENCY_LEVELS = [1, 2, 4, 6, 8] as const;
// Frontera futura declarada (segmentos en paralelo). Sin uso por ahora.
export const HLS_CONCURRENCY_LEVELS = [4, 6, 8, 10, 12, 16] as const;

export type DirectConcurrencyLevel = (typeof DIRECT_CONCURRENCY_LEVELS)[number];

// Cuándo puede aplicarse un cambio de target en este intento: 'hot' al momento
// (pool ranged), 'deferred' en la siguiente frontera (slice de Mega),
// 'not-applicable' si no hay frontera posible (camino simple de 1 stream).
export type ConcurrencyApplicationMode = 'hot' | 'deferred' | 'not-applicable';

export function isConcurrencyApplicationMode(value: unknown): value is ConcurrencyApplicationMode {
  return value === 'hot' || value === 'deferred' || value === 'not-applicable';
}

export function isConcurrencyLevel(value: unknown): value is DirectConcurrencyLevel {
  return typeof value === 'number' && (DIRECT_CONCURRENCY_LEVELS as readonly number[]).includes(value);
}

function normalizeLevelForStep(level: unknown): number {
  return typeof level === 'number' && Number.isFinite(level) ? level : 1;
}

// Navegación pura por la escalera: salta hacia el nivel válido vecino aunque
// llegue un valor legacy (3, 5 o 7).
export function stepUpLevel(level: number): number {
  const n = normalizeLevelForStep(level);
  for (const candidate of DIRECT_CONCURRENCY_LEVELS) {
    if (candidate > n) return candidate;
  }
  return DIRECT_CONCURRENCY_LEVELS[DIRECT_CONCURRENCY_LEVELS.length - 1];
}

export function stepDownLevel(level: number): number {
  const n = normalizeLevelForStep(level);
  let last: number = DIRECT_CONCURRENCY_LEVELS[0];
  for (const candidate of DIRECT_CONCURRENCY_LEVELS) {
    if (candidate >= n) break;
    last = candidate;
  }
  return last;
}

// Objetivo de concurrencia observable desde un pool de workers. Los métodos
// opcionales son los que aporta el handle por intento; un número simple o un
// objeto mínimo también sirve como fuente.
export interface ConcurrencyTarget {
  current(): number;
  subscribe?(listener: (target: number) => void): () => void;
  reportActual?(count: number): void;
  // Opcional como `reportActual`: si la fuente no la lleva, vale la del engine.
  applicationMode?(): ConcurrencyApplicationMode;
  reportApplicationMode?(mode: ConcurrencyApplicationMode): void;
  // Con Adaptive el pool se intenta también con 1 worker: así 1 es un peldaño
  // real de la escalera y no un callejón sin medición.
  allowOneWorker?: boolean;
}

// Handle de un intento. Tras dispose queda inerte.
export interface AttemptConcurrencyHandle extends ConcurrencyTarget {
  setTarget(level: number): boolean;
  subscribe(listener: (target: number) => void): () => void;
  reportActual(count: number): void;
  actual(): number;
  isDisposed(): boolean;
  dispose(): void;
}

export type ConcurrencySource = number | ConcurrencyTarget;

export function readConcurrency(source: ConcurrencySource | undefined, fallback = 1): number {
  if (typeof source === 'number') return source;
  const value = source?.current();
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function readAllowOneWorker(source: ConcurrencySource | undefined): boolean {
  return !!source && typeof source === 'object' && source.allowOneWorker === true;
}

export function subscribeConcurrency(
  source: ConcurrencySource | undefined,
  listener: (target: number) => void,
): () => void {
  if (source && typeof source === 'object' && typeof source.subscribe === 'function') {
    return source.subscribe(listener);
  }
  return () => undefined;
}

export function reportActualConcurrency(source: ConcurrencySource | undefined, count: number): void {
  if (source && typeof source === 'object' && typeof source.reportActual === 'function') {
    source.reportActual(count);
  }
}

// El downloader la refina según el camino real; la política la lee tal cual.
export function reportApplicationMode(source: ConcurrencySource | undefined, mode: ConcurrencyApplicationMode): void {
  if (source && typeof source === 'object' && typeof source.reportApplicationMode === 'function') {
    source.reportApplicationMode(mode);
  }
}

export function readApplicationMode(
  source: ConcurrencySource | undefined,
  fallback: ConcurrencyApplicationMode = 'hot',
): ConcurrencyApplicationMode {
  if (source && typeof source === 'object' && typeof source.applicationMode === 'function') {
    const mode = source.applicationMode();
    if (isConcurrencyApplicationMode(mode)) return mode;
  }
  return fallback;
}

export function createAttemptConcurrencyHandle(initialLevel: number, allowOneWorker = false): AttemptConcurrencyHandle {
  let target = typeof initialLevel === 'number' && Number.isFinite(initialLevel) ? initialLevel : 1;
  let actual = 0;
  let disposed = false;
  // Capacidad en vivo: arranca en 'hot' (la neutral) y quien descarga la refina.
  let applicationMode: ConcurrencyApplicationMode = 'hot';
  const listeners = new Set<(target: number) => void>();
  return {
    allowOneWorker,
    current: () => target,
    setTarget(level: number): boolean {
      // Solo niveles de la escalera; un disposed no acepta nada.
      if (disposed || !isConcurrencyLevel(level)) return false;
      if (level === target) return true;
      target = level;
      for (const listener of Array.from(listeners)) {
        try {
          listener(target);
        } catch {
          // Un listener defectuoso no debe romper la descarga.
        }
      }
      return true;
    },
    subscribe(listener: (target: number) => void): () => void {
      if (disposed || typeof listener !== 'function') return () => undefined;
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reportActual(count: number): void {
      if (disposed) return;
      if (typeof count === 'number' && Number.isFinite(count) && count >= 0) actual = Math.floor(count);
    },
    actual: () => actual,
    applicationMode: () => applicationMode,
    reportApplicationMode(mode: ConcurrencyApplicationMode): void {
      // Solo una capacidad válida y solo en vida del intento.
      if (disposed || !isConcurrencyApplicationMode(mode)) return;
      applicationMode = mode;
    },
    isDisposed: () => disposed,
    dispose(): void {
      disposed = true;
      listeners.clear();
    },
  };
}

const SERVER_CONNECTION_KEYS: Record<
  string,
  'megaConnections' | 'mediafireConnections' | 'mp4uploadConnections' | 'voeConnections'
> = {
  mega: 'megaConnections',
  mediafire: 'mediafireConnections',
  mp4upload: 'mp4uploadConnections',
  voe: 'voeConnections',
};

// Nivel manual por servidor. HLS queda fuera: su engine lee sus ajustes.
export function connectionLevelForServer(server: string | undefined, settings: DownloadSettings): number | null {
  const key =
    SERVER_CONNECTION_KEYS[
      String(server ?? '')
        .trim()
        .toLowerCase()
    ];
  if (!key) return null;
  const value = settings?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 1;
}
