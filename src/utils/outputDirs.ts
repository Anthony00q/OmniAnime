const ROOT_DRIVE_RE = /^[A-Za-z]:\\$/;
const ABS_WIN_RE = /^[A-Za-z]:\\/;
const ABS_UNC_RE = /^\\\\[^\\]+\\/;

function normalizeKey(dir: string): string {
  return dir.trim().replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
}

export function isValidOutputDirString(dir: unknown): boolean {
  if (typeof dir !== 'string') return false;
  const t = dir.trim();
  if (!t) return false;
  if (t.includes('\0')) return false;
  const normalized = t.replace(/\//g, '\\');
  const absolute = ABS_WIN_RE.test(normalized) || ABS_UNC_RE.test(normalized);
  if (!absolute) return false;
  if (ROOT_DRIVE_RE.test(normalized)) return false;
  const parts = normalized.split('\\');
  if (parts.includes('..')) return false;
  return true;
}

export function sanitizeOutputDirs(dirs: unknown, fallbackDir?: unknown): string[] {
  const list = Array.isArray(dirs) ? dirs : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of list) {
    if (!isValidOutputDirString(entry)) continue;
    const raw = String(entry).trim();
    const key = normalizeKey(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
    if (out.length >= 3) break;
  }
  if (out.length === 0 && isValidOutputDirString(fallbackDir)) out.push(String(fallbackDir).trim());
  return out;
}

export function resolveDefaultOutputDir(defaultDir: unknown, dirs: string[], appFallback?: string): string {
  const candidate = isValidOutputDirString(defaultDir) ? String(defaultDir).trim() : '';
  if (candidate && dirs.some((d) => normalizeKey(d) === normalizeKey(candidate))) return candidate;
  if (dirs.length > 0) return dirs[0];
  if (isValidOutputDirString(appFallback)) return String(appFallback).trim();
  return candidate;
}
