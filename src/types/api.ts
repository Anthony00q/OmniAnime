// Forma estándar del error de IPC.
export interface IpcErrorShape {
  ok: false;
  code: string;
  message: string;
}

export function fail(code: string, message: string): IpcErrorShape {
  return { ok: false, code, message };
}
