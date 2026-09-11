import * as fs from 'fs';
import * as path from 'path';
import {
  APP_LOG_FILENAME,
  LOG_VIEW_MAX_BYTES_PER_FILE,
  LOG_VIEW_MAX_FILES,
  LOG_VIEW_MAX_TOTAL_BYTES,
  SESSION_BACKUP_SUFFIX,
  listSessionFiles,
  type CollectLogSourcesOptions,
  type LogSource,
} from './logPage';

export type { CollectLogSourcesOptions, LogSource };

function readTailSync(file: string, maxBytes: number): string {
  try {
    const st = fs.statSync(file, { throwIfNoEntry: false });
    if (!st || !st.isFile()) return '';
    if (st.size <= maxBytes) return fs.readFileSync(file, 'utf8');
    const fd = fs.openSync(file, 'r');
    try {
      const start = Math.max(0, st.size - maxBytes);
      const buf = Buffer.alloc(st.size - start);
      fs.readSync(fd, buf, 0, buf.length, start);
      const text = buf.toString('utf8');
      const nl = text.indexOf('\n');
      return nl >= 0 ? text.slice(nl + 1) : text;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return '';
  }
}

async function readTailAsync(file: string, maxBytes: number): Promise<string> {
  try {
    const st = await fs.promises.stat(file);
    if (!st.isFile()) return '';
    if (st.size <= maxBytes) return await fs.promises.readFile(file, 'utf8');
    const fh = await fs.promises.open(file, 'r');
    try {
      const start = Math.max(0, st.size - maxBytes);
      const buf = Buffer.alloc(st.size - start);
      await fh.read(buf, 0, buf.length, start);
      const text = buf.toString('utf8');
      const nl = text.indexOf('\n');
      return nl >= 0 ? text.slice(nl + 1) : text;
    } finally {
      await fh.close();
    }
  } catch {
    return '';
  }
}

function orderLogNames(names: string[], maxFiles: number, includeBackups: boolean): string[] {
  const ordered: string[] = [];
  if (names.includes(APP_LOG_FILENAME)) ordered.push(APP_LOG_FILENAME);
  const sessions = listSessionFiles(names);
  const available = new Set(names);
  for (const base of sessions) {
    if (includeBackups) {
      const backup = `${base}${SESSION_BACKUP_SUFFIX}`;
      if (available.has(backup)) ordered.push(backup);
    }
    ordered.push(base);
  }
  return ordered.length <= maxFiles ? ordered : ordered.slice(ordered.length - maxFiles);
}

export function collectLogSources(logDir: string, options?: CollectLogSourcesOptions): LogSource[] {
  const maxFiles = options?.maxFiles ?? LOG_VIEW_MAX_FILES;
  const maxBytesPerFile = options?.maxBytesPerFile ?? LOG_VIEW_MAX_BYTES_PER_FILE;
  const maxTotalBytes = options?.maxTotalBytes ?? LOG_VIEW_MAX_TOTAL_BYTES;
  const includeBackups = options?.includeBackups ?? true;
  let names: string[] = [];
  try {
    names = fs.readdirSync(logDir);
  } catch {
    return [];
  }
  const sources: LogSource[] = [];
  let total = 0;
  // De mas recientes a mas antiguas para que el cap total recorte lo viejo.
  for (const name of orderLogNames(names, maxFiles, includeBackups).reverse()) {
    if (total >= maxTotalBytes) break;
    const raw = readTailSync(path.join(logDir, name), maxBytesPerFile);
    if (!raw) continue;
    total += raw.length;
    sources.unshift({ name, raw });
  }
  return sources;
}

export async function collectLogSourcesAsync(logDir: string, options?: CollectLogSourcesOptions): Promise<LogSource[]> {
  const maxFiles = options?.maxFiles ?? LOG_VIEW_MAX_FILES;
  const maxBytesPerFile = options?.maxBytesPerFile ?? LOG_VIEW_MAX_BYTES_PER_FILE;
  const maxTotalBytes = options?.maxTotalBytes ?? LOG_VIEW_MAX_TOTAL_BYTES;
  const includeBackups = options?.includeBackups ?? true;
  let names: string[] = [];
  try {
    names = await fs.promises.readdir(logDir);
  } catch {
    return [];
  }
  const sources: LogSource[] = [];
  let total = 0;
  for (const name of orderLogNames(names, maxFiles, includeBackups).reverse()) {
    if (total >= maxTotalBytes) break;
    const raw = await readTailAsync(path.join(logDir, name), maxBytesPerFile);
    if (!raw) continue;
    total += raw.length;
    sources.unshift({ name, raw });
  }
  return sources;
}
