// Adapter puro: preload de librería (main) -> filas LibraryFolder (renderer).
// Sin deps de Electron/React para poder testearse en Node con ts-node.
export interface LibraryPreloadRow {
  folderName?: unknown;
  folderPath?: unknown;
  sourceDir?: unknown;
  sourceDirIndex?: unknown;
  birthtime?: unknown;
  episodeCount?: unknown;
  slug?: unknown;
  title?: unknown;
  poster?: unknown;
  banner?: unknown;
  providerId?: unknown;
}

export interface LibrarySeedFolder {
  name: string;
  path: string;
  birthtime: number;
  episodeCount: number;
  posterLocal: string | null;
  bannerLocal: string | null;
  metaSlug: string | null;
  metaTitle: string | null;
  providerId: string | null;
  sourceDir: string;
  sourceDirIndex: number;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown, fallback = 0): number {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? (num as number) : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

export function adaptLibraryPreloadToFolders(rows: unknown): LibrarySeedFolder[] {
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  const out: LibrarySeedFolder[] = [];
  for (const row of rows as LibraryPreloadRow[]) {
    if (!row || typeof row !== 'object') continue;
    const folderPath = asString(row.folderPath);
    const name = asString(row.folderName);
    const sourceDir = asString(row.sourceDir);
    if (!folderPath || !name || !sourceDir) continue;
    const key = folderPath.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      path: folderPath,
      birthtime: asNumber(row.birthtime, 0),
      episodeCount: Math.max(0, Math.floor(asNumber(row.episodeCount, 0))),
      posterLocal: asNullableString(row.poster),
      bannerLocal: asNullableString(row.banner),
      metaSlug: asNullableString(row.slug),
      metaTitle: asString(row.title) || name,
      providerId: asNullableString(row.providerId),
      sourceDir,
      sourceDirIndex: Math.max(0, Math.floor(asNumber(row.sourceDirIndex, 0))),
    });
  }
  return out;
}

// Dirs para la key ['library', dirs]: distintos sourceDir por primer orden
// de sourceDirIndex. Si el preload viene vacío, se usa el fallback (settings).
export function getLibrarySeedDirs(rows: unknown, fallbackDirs: string[] = []): string[] {
  const folders = adaptLibraryPreloadToFolders(rows);
  const byIndex = new Map<string, number>();
  for (const f of folders) {
    if (!byIndex.has(f.sourceDir)) byIndex.set(f.sourceDir, f.sourceDirIndex);
  }
  const dirs = [...byIndex.entries()].sort((a, b) => a[1] - b[1]).map(([dir]) => dir);
  if (dirs.length > 0) return dirs;
  return (Array.isArray(fallbackDirs) ? fallbackDirs : []).filter((d): d is string => typeof d === 'string' && !!d);
}
