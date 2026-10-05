// Forma estándar del error de IPC.
export interface IpcErrorShape {
  ok: false;
  code: string;
  message: string;
}

// En el éxito, los datos viajan siempre en `data`.
export interface IpcSuccess<R> {
  ok: true;
  data: R;
}

// Respuesta estándar de todo canal invoke: datos o error, nunca ambos.
export type IpcResponse<R> = IpcSuccess<R> | IpcErrorShape;

export function ok<R>(data: R): IpcSuccess<R> {
  return { ok: true, data };
}

export function fail(code: string, message: string): IpcErrorShape {
  return { ok: false, code, message };
}

export function isIpcFail(response: unknown): response is IpcErrorShape {
  return (
    typeof response === 'object' &&
    response !== null &&
    (response as IpcErrorShape).ok === false &&
    typeof (response as IpcErrorShape).code === 'string'
  );
}
