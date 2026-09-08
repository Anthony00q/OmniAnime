import * as fs from 'fs';
import * as path from 'path';
import type { QueueItem } from '../types/queue';

// Único dueño de la persistencia del % congelado al pausar.
// Vive en su propio JSON bajo userData: no toca DatabaseManager, QueueStore
// ni el esquema SQLite, para aislar cualquier fallo de este sistema.
export interface PausedEpisodeSnapshot {
  progress: number;
  server?: string;
}

export interface PausedItemSnapshot {
  totalProgress: number;
  episodes: Record<string, PausedEpisodeSnapshot>;
}

export type PausedProgressFile = Record<string, PausedItemSnapshot>;

const MAX_ITEMS = 200;
const MAX_EPISODES_PER_ITEM = 100;
const MAX_SERVER_LEN = 120;

function clampProgress(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function sanitizeServer(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().slice(0, MAX_SERVER_LEN);
  return trimmed ? trimmed : undefined;
}

function sanitizeItem(raw: unknown): PausedItemSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const totalProgress = clampProgress(record.totalProgress);
  if (totalProgress === null) return null;
  const episodesRaw = record.episodes;
  if (!episodesRaw || typeof episodesRaw !== 'object') return null;
  const episodes: Record<string, PausedEpisodeSnapshot> = {};
  for (const [key, entry] of Object.entries(episodesRaw as Record<string, unknown>)) {
    if (Object.keys(episodes).length >= MAX_EPISODES_PER_ITEM) break;
    if (!/^\d+$/.test(key)) continue;
    if (!entry || typeof entry !== 'object') continue;
    const progress = clampProgress((entry as Record<string, unknown>).progress);
    if (progress === null) continue;
    const server = sanitizeServer((entry as Record<string, unknown>).server);
    episodes[key] = server === undefined ? { progress } : { progress, server };
  }
  return { totalProgress, episodes };
}

export class PausedProgressStore {
  constructor(private readonly filePath: string) {}

  load(): PausedProgressFile {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const out: PausedProgressFile = {};
      for (const [queueId, item] of Object.entries(parsed as Record<string, unknown>)) {
        if (Object.keys(out).length >= MAX_ITEMS) break;
        if (!queueId || queueId.length > 200) continue;
        const clean = sanitizeItem(item);
        if (clean) out[queueId] = clean;
      }
      return out;
    } catch {
      return {};
    }
  }

  save(queueId: string, snapshot: PausedItemSnapshot): void {
    try {
      if (!queueId || queueId.length > 200) return;
      const clean = sanitizeItem(snapshot);
      if (!clean) return;
      const current = this.load();
      current[queueId] = clean;
      const trimmed: PausedProgressFile = {};
      for (const key of Object.keys(current).slice(0, MAX_ITEMS)) trimmed[key] = current[key];
      this.writeAtomic(trimmed);
    } catch {
      // Best-effort: la pausa nunca debe fallar por persistencia
    }
  }

  clear(queueId: string): void {
    try {
      const current = this.load();
      if (!(queueId in current)) return;
      delete current[queueId];
      this.writeAtomic(current);
    } catch {
      // Best-effort
    }
  }

  private writeAtomic(data: PausedProgressFile): void {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, this.filePath);
  }
}

// Aplica un snapshot guardado a un item pausado tras reiniciar.
// Solo conserva EPs que sigan marcados como pausados; el resto se ignora.
export function applyStoredSnapshot(item: QueueItem, saved: PausedItemSnapshot | undefined): void {
  if (!saved || item.status !== 'paused') return;
  item.progress = saved.totalProgress;
  const snapshot: Record<string, PausedEpisodeSnapshot> = {};
  for (const ep of item.pausedEps || []) {
    const entry = saved.episodes[String(ep)];
    if (entry) snapshot[String(ep)] = { ...entry };
  }
  if (Object.keys(snapshot).length > 0) item.pausedEpSnapshot = snapshot;
}
