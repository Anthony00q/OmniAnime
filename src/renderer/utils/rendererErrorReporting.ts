const MAX_PAYLOAD = 5000;

export function serializeRendererError(value: unknown): string {
  try {
    if (value instanceof Error) return `${value.message}\n${value.stack || ''}`.slice(0, MAX_PAYLOAD);
    if (typeof value === 'string') return value.slice(0, MAX_PAYLOAD);
    return JSON.stringify(value)?.slice(0, MAX_PAYLOAD) || String(value).slice(0, MAX_PAYLOAD);
  } catch {
    try {
      return String(value).slice(0, MAX_PAYLOAD);
    } catch {
      return 'renderer error no serializable';
    }
  }
}

const lastSent = new Map<string, number>();
const DEDUPE_MS = 5000;

export function reportRendererError(scope: string, value: unknown): void {
  try {
    const message = serializeRendererError(value);
    const key = `${scope}:${message.slice(0, 200)}`;
    const now = Date.now();
    if (now - (lastSent.get(key) || 0) < DEDUPE_MS) return;
    lastSent.set(key, now);
    (window as unknown as { api?: { send?: (c: string, ...a: unknown[]) => void } }).api?.send?.(
      'log-error',
      `[${scope}] ${message}`,
    );
  } catch {}
}

let installed = false;

export function installRendererErrorReporting(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const send = (payload: unknown): void => {
    try {
      (window as unknown as { api?: { send?: (c: string, ...a: unknown[]) => void } }).api?.send?.(
        'log-error',
        serializeRendererError(payload),
      );
    } catch {}
  };
  window.addEventListener('error', (event) => {
    send(event.error || event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    send(event.reason);
  });
}
