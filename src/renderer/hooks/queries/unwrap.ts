import { toast } from 'sonner';
import { isIpcFail, type IpcErrorShape, type IpcSuccess } from '@/types/api';
import { reportRendererError } from '@/renderer/utils/rendererErrorReporting';

// Respaldo por código cuando el fallo llega sin mensaje aprovechable (los de infraestructura).
const IPC_FAIL_MESSAGES: Record<string, string> = {
  IPC_TIMEOUT: 'La operación tardó demasiado',
  IPC_HANDLER_ERROR: 'No se pudo completar la operación',
};

// Error con el que unwrap lanza un fallo ya avisado; las vistas no repiten el toast.
export class IpcFailError extends Error {
  readonly code: string;
  readonly ipcReported = true;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'IpcFailError';
    this.code = code;
  }
}

export function isIpcFailError(error: unknown): error is IpcFailError {
  return error instanceof IpcFailError;
}

// El mensaje del handler lleva la copia de usuario; el código solo responde si no hay texto.
export function ipcFailMessage(failure: IpcErrorShape): string {
  const message = typeof failure.message === 'string' ? failure.message.trim() : '';
  return message || IPC_FAIL_MESSAGES[failure.code] || 'La operación no se pudo completar';
}

export interface UnwrapOptions {
  // Para sitios que gestionan su propio aviso (ciclo de toasts con id o error inline):
  // unwrap registra y lanza, pero no tostea.
  toast?: boolean;
}

// Desenvuelve la respuesta estándar (src/types/api.ts): avisa, deja registro y lanza en fail.
// La tipación fina por canal llega después; hoy invoke devuelve any y aquí no se pierde fluidez.
export function unwrap<T = any>(response: any, options: UnwrapOptions = {}): T {
  if (isIpcFail(response)) {
    const message = ipcFailMessage(response);
    reportRendererError(`ipc:${response.code}`, message);
    if (options.toast !== false) toast.error(message);
    throw new IpcFailError(response.code, message);
  }
  return (response as IpcSuccess<T>).data;
}
