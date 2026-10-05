import { toast } from 'sonner';
import { isIpcFail, type IpcErrorShape, type IpcSuccess } from '@/types/api';
import { reportRendererError } from '@/renderer/utils/rendererErrorReporting';

// Respaldo por código para los fallos de infraestructura sin mensaje.
const IPC_FAIL_MESSAGES: Record<string, string> = {
  IPC_TIMEOUT: 'La operación tardó demasiado',
  IPC_HANDLER_ERROR: 'No se pudo completar la operación',
};

// Fallo ya avisado por unwrap: las vistas no repiten el toast.
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

// La copia la lleva el handler; el código responde solo si no hay texto.
export function ipcFailMessage(failure: IpcErrorShape): string {
  const message = typeof failure.message === 'string' ? failure.message.trim() : '';
  return message || IPC_FAIL_MESSAGES[failure.code] || 'La operación no se pudo completar';
}

export interface UnwrapOptions {
  // Para avisos que gestiona la propia vista (toast con id o error inline).
  toast?: boolean;
}

// Desenvuelve la respuesta estándar: avisa, deja registro y lanza en fail.
// Se queda en any porque invoke todavía no tipa por canal.
export function unwrap<T = any>(response: any, options: UnwrapOptions = {}): T {
  if (isIpcFail(response)) {
    const message = ipcFailMessage(response);
    reportRendererError(`ipc:${response.code}`, message);
    if (options.toast !== false) toast.error(message);
    throw new IpcFailError(response.code, message);
  }
  // Sin envelope no hay datos: degrada a null, como el bridge del splash.
  if (!response || typeof response !== 'object') return null as T;
  return (response as IpcSuccess<T>).data ?? (null as T);
}
