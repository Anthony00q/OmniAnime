import { ipcMain } from 'electron';
import { fail, type IpcErrorShape } from '../../types/api';
import { INVOKE_CHANNELS, SEND_CHANNELS, type InvokeChannel, type SendChannel } from '../../types/ipc-channels';
import { errorDetailForLog, safeErrorMessage } from '../../utils/logging/redactLog';

// Todo handler pasa por aquí: si lanza o se cuelga, el proceso sigue vivo y el renderer
// recibe un rechazo con la forma estándar (src/types/api.ts) y el detalle saneado.

export const IPC_TIMEOUT_DEFAULT_MS = 30_000;

// Tope por canal; null = sin tope (esperan a la persona o duran lo que duren).
// El resto sube según su trabajo: red, ffmpeg o fs sobre librerías grandes.
const IPC_TIMEOUTS: Record<string, number | null> = {
  // esperan a la persona o a una descarga larga
  'select-folder': null,
  'export-settings': null,
  'import-settings': null,
  'import-custom-sound': null,
  'app-update-download': null,
  // red
  'get-home-data': 60_000,
  'get-catalog': 60_000,
  'get-filters-data': 60_000,
  'search-anime': 60_000,
  'get-details': 60_000,
  'get-schedule': 60_000,
  'get-episode-thumbs': 60_000,
  'get-anilist-banner': 60_000,
  'get-image-base64': 60_000,
  'search-trailer-id': 60_000,
  'app-update-check': 60_000,
  // fs / ffmpeg sobre lotes grandes
  'scan-downloads': 300_000,
  'scan-episodes': 300_000,
  'clean-cache': 300_000,
  'clean-thumbnails': 300_000,
  'rename-anime-files': 120_000,
  'preview-rename-anime-files': 120_000,
  'preview-reorder-episodes': 120_000,
  'get-folders-for-reorder': 120_000,
  'reorder-episodes': 120_000,
  'relink-folder': 120_000,
  'rename-folder': 120_000,
  'delete-folder': 120_000,
  'delete-video': 120_000,
  'get-video-thumbnail': 120_000,
  'export-diagnostics': 120_000,
  'get-storage-stats': 120_000,
  'get-log-page': 60_000,
  'delete-log-entries': 60_000,
  'delete-log-files': 60_000,
};

export interface IpcRegistrar {
  handle: (channel: string, listener: (event: any, ...args: any[]) => unknown) => void;
  on: (channel: string, listener: (event: any, ...args: any[]) => void) => void;
}

export type IpcInvokeHandler = (event: any, ...args: any[]) => unknown;
export type IpcSendListener = (event: any, ...args: any[]) => void;
export type IpcErrorReporter = (shape: IpcErrorShape, channel: string) => void;

let registrar: IpcRegistrar = ipcMain;
let reportIpcError: IpcErrorReporter = () => {};

// IpcRegistry instala su logger con scope; los tests un registrar falso.
export function installIpcGuard(options: { registrar?: IpcRegistrar; report?: IpcErrorReporter } = {}): void {
  if (options.registrar) registrar = options.registrar;
  if (options.report) reportIpcError = options.report;
}

export function ipcTimeoutFor(channel: string): number | null {
  return channel in IPC_TIMEOUTS ? IPC_TIMEOUTS[channel] : IPC_TIMEOUT_DEFAULT_MS;
}

export function buildIpcErrorShape(error: unknown): IpcErrorShape {
  const code =
    typeof (error as { code?: unknown } | null)?.code === 'string'
      ? String((error as { code: string }).code)
      : 'IPC_HANDLER_ERROR';
  return fail(code, safeErrorMessage(error) || errorDetailForLog(error));
}

// La excepción (de handler o de timeout) sale como rechazo saneado y con log.
export function withRecover(
  channel: string,
  handler: IpcInvokeHandler,
  report: IpcErrorReporter = reportIpcError,
): IpcInvokeHandler {
  return async (event, ...args) => {
    try {
      return await handler(event, ...args);
    } catch (error) {
      const shape = buildIpcErrorShape(error);
      report(shape, channel);
      throw Object.assign(new Error(shape.message), { code: shape.code });
    }
  };
}

// Corta los handlers colgados; la llegada tardía del original no deja rechazos huérfanos.
export function withTimeout(
  channel: string,
  handler: IpcInvokeHandler,
  timeoutMs: number | null = ipcTimeoutFor(channel),
): IpcInvokeHandler {
  if (timeoutMs === null) return handler;
  return (event, ...args) => {
    const running = Promise.resolve().then(() => handler(event, ...args));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const guard = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(Object.assign(new Error(`La operación '${channel}' tardó demasiado`), { code: 'IPC_TIMEOUT' })),
        timeoutMs,
      );
    });
    return Promise.race([running, guard]).finally(() => clearTimeout(timer));
  };
}

export function wrapIpcHandler(
  channel: string,
  handler: IpcInvokeHandler,
  options?: { timeoutMs?: number | null },
): IpcInvokeHandler {
  const timeoutMs = options && options.timeoutMs !== undefined ? options.timeoutMs : ipcTimeoutFor(channel);
  return withRecover(channel, withTimeout(channel, handler, timeoutMs));
}

function assertKnownChannel(allowed: readonly string[], channel: string): void {
  if (!allowed.includes(channel)) {
    throw new Error(`Canal IPC no registrado en la fuente única: ${channel}`);
  }
}

// Única vía de registro en main: canal validado contra la fuente única + recover + timeout.
export function handleIpc(
  channel: InvokeChannel,
  handler: IpcInvokeHandler,
  options?: { timeoutMs?: number | null },
): void {
  assertKnownChannel(INVOKE_CHANNELS, channel);
  registrar.handle(channel, wrapIpcHandler(channel, handler, options));
}

export function onIpc(channel: SendChannel, listener: IpcSendListener): void {
  assertKnownChannel(SEND_CHANNELS, channel);
  registrar.on(channel, (event, ...args) => {
    try {
      listener(event, ...args);
    } catch (error) {
      reportIpcError(buildIpcErrorShape(error), channel);
    }
  });
}
