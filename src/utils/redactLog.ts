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
