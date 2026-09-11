// Helpers puros del arranque con splash (sin deps de Electron/React).
// Testeables en Node con ts-node; WindowLifecycleService los re-exporta.
export const SPLASH_BOOT_TIMEOUT_MS = 15_000;
export const SPLASH_STATUS_BUFFER_LIMIT = 50;
export const RENDERER_READY_TIMEOUT_MS = 3_000;

export function clampSplashProgress(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(100, Math.max(0, Math.round(num)));
}

export async function withStartupTimeout<T>(
  task: Promise<T>,
  timeoutMs: number,
): Promise<{ value: T | null; timedOut: boolean }> {
  let timer: NodeJS.Timeout | null = null;
  try {
    const timeout = new Promise<{ value: null; timedOut: true }>((resolve) => {
      timer = setTimeout(() => resolve({ value: null, timedOut: true }), timeoutMs);
    });
    const raced = await Promise.race([
      task.then(
        (value) => ({ value, timedOut: false }) as const,
        () => ({ value: null, timedOut: true }) as const,
      ),
      timeout,
    ]);
    return raced;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function waitForRendererReady(isReady: () => boolean, timeoutMs: number, pollMs = 50): Promise<boolean> {
  return new Promise((resolve) => {
    let interval: NodeJS.Timeout | null = null;
    const done = (value: boolean): void => {
      if (interval) clearInterval(interval);
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    try {
      if (isReady()) {
        done(true);
        return;
      }
    } catch {
      done(false);
      return;
    }
    interval = setInterval(() => {
      let ready = false;
      try {
        ready = isReady();
      } catch {
        done(false);
        return;
      }
      if (ready) done(true);
    }, pollMs);
  });
}

export function buildToolsStatusText(tools: { ffmpeg: boolean } | null): string {
  if (!tools) return 'Verificando herramientas de descarga...';
  if (tools.ffmpeg) return 'Herramientas de descarga listas.';
  return 'ffmpeg no encontrado, algunas conversiones fallarán.';
}
