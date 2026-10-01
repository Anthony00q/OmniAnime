export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function redactLogText(text: string, homeDir = ''): string {
  if (!text) return text;
  let out = text;
  if (homeDir) {
    const home = homeDir.replace(/[\\/]+$/, '');
    if (home) out = out.replace(new RegExp(escapeRegExp(home), 'gi'), '~');
  }
  out = out.replace(/[A-Za-z]:\\Users\\[^\\/:*?"<>|\s]+/gi, '~');
  out = out.replace(/\/Users\/[^/\s:]+/g, '~');
  out = out.replace(
    /(api[_-]?key|token|bearer|authorization|client[_-]?secret|password|passwd)\s*[:=]\s*\S+/gi,
    '$1=[REDACTED]',
  );
  out = out.replace(/([?&](token|key|auth|signature|sig)=)[^&\s'"]+/gi, '$1[REDACTED]');
  return out;
}

// Detalle de error seguro para logs: código o nombre, jamás el mensaje
// (los mensajes de fs y axios arrastran rutas y URLs).
export function errorDetailForLog(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | null | undefined)?.code;
  if (code) return String(code);
  const name = (error as Error | null | undefined)?.name;
  return name && name !== 'Error' ? name : 'error';
}

// Motivo de error conservando el detalle, con URLs tapadas: para ramas donde
// el mensaje diagnostica de verdad y no arrastra rutas de disco.
export function safeErrorMessage(error: unknown): string {
  const message = String((error as Error | null | undefined)?.message || error || '');
  return redactLogText(message.replace(/https?:\/\/\S+/gi, '[url]'));
}
