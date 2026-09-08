import type { AppSettings, ThemeId } from '../../../../types/settings';
import { normalizeDownloadSettings } from '../../../../utils/downloadSettings';
import { resolveDefaultOutputDir, sanitizeOutputDirs } from '../../../../utils/outputDirs';
import { isThemeValue } from '../../../utils/color';

export function normalizeSettings(settings: AppSettings | null | undefined): AppSettings {
  const s = (settings || {}) as Partial<AppSettings> & Record<string, unknown>;
  const outputDirs = sanitizeOutputDirs(s.outputDirs, s.defaultOutputDir);
  const defaultOutputDir = resolveDefaultOutputDir(s.defaultOutputDir, outputDirs);
  return {
    ...(s as AppSettings),
    outputDirs,
    defaultOutputDir,
    download: normalizeDownloadSettings((s as Record<string, unknown>).download),
  } as AppSettings;
}

export function isActiveTheme(theme: unknown, candidate: ThemeId): boolean {
  if (theme === candidate) return true;
  if (!theme && candidate === 'dark') return true;
  // fallback for legacy values
  if (isThemeValue(candidate) && candidate === theme) return true;
  return false;
}

export function buildNamingPreview(style: string, title = 'Sousou no Frieren') {
  if (style === 'minimal') return 'EP_01.mp4 · EP_12.mp4';
  return `${title} EP_01.mp4`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : v >= 100 ? 1 : 2)} ${units[i]}`;
}

export function formatDiskPercent(free: number | null, total: number | null): number | null {
  if (free == null || total == null || total <= 0) return null;
  const used = total - free;
  return Math.max(0, Math.min(100, Math.round((used / total) * 100)));
}

// Display-only: acerca un valor heredado/importado a la opcion valida mas
// cercana para que el select nunca quede en blanco. No muta el ajuste real.
export function snapToClosestOption(value: unknown, optionValues: readonly string[]): string {
  const fallback = optionValues[0] ?? '';
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : (value as number);
  if (!Number.isFinite(n)) return fallback;
  let best = fallback;
  let bestDist = Infinity;
  for (const opt of optionValues) {
    const m = Number(opt);
    if (!Number.isFinite(m)) continue;
    const dist = Math.abs(m - (n as number));
    if (dist < bestDist || (dist === bestDist && m < Number(best))) {
      best = opt;
      bestDist = dist;
    }
  }
  return best;
}

export function reorderOutputDirs(dirs: string[], from: number, to: number): string[] {
  if (from === to) return dirs;
  if (from < 0 || to < 0 || from >= dirs.length || to >= dirs.length) return dirs;
  const next = dirs.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
