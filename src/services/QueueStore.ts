import * as path from 'path';
import type { QueueDatabaseRow, QueueDatabaseWriteRow, QueueItem } from '../types/queue';
import { normalizeDisplayAnimeTitle } from '../utils/titleUtils';

export interface QueueStoreDatabase {
  isReady(): boolean;
  getAllQueueItems(): QueueDatabaseRow[];
  saveQueueItems(items: QueueDatabaseWriteRow[]): void;
}

export interface QueueStoreSettings {
  defaultOutputDir: string;
  outputDirs?: string[];
}

export interface ActiveEpisodeProgress {
  episode: number;
  progress: number;
  server?: string;
}

export interface QueueProgressDelta {
  id: string;
  progress: number;
  currentEp: number | null;
  currentServer?: string;
  status: import('../types/queue').QueueStatus;
  // Foto de episodios en vuelo (transitorio, nunca se persiste):
  // paralelo hasta 3, secuencial 1. Sin ella el Detalle no puede
  // distinguir el EP activo del resto en cola.
  activeEps?: ActiveEpisodeProgress[];
}

export interface QueueStoreOptions {
  database: QueueStoreDatabase;
  getSettings: () => QueueStoreSettings;
  canBroadcast: () => boolean;
  sendQueueUpdate: (items: Array<QueueItem & { dirLabel: string; dirFullPath: string }>) => unknown;
  sendQueueProgress?: (delta: QueueProgressDelta) => unknown;
  logError: (error: unknown) => void;
}

export class QueueStore {
  readonly items: QueueItem[] = [];

  private readonly progressBroadcastMs = 250;
  private readonly progressSaveMs = 1000;
  private queueSaveTimer: NodeJS.Timeout | null = null;
  private queueBroadcastTimer: NodeJS.Timeout | null = null;
  private lastQueueBroadcastAt = 0;
  private readonly progressDeltaMs = 250;
  private queueProgressTimer: NodeJS.Timeout | null = null;
  private lastProgressBroadcastAt = 0;
  private pendingProgressDelta: QueueProgressDelta | null = null;
  private queueLoadFailed = false;
  private cachedDirLabelMap: Map<string, string> | null = null;
  private cachedDirLabelMapKey: string | null = null;

  constructor(private readonly options: QueueStoreOptions) {}

  getDirInfo(targetPath: string): { label: string; fullPath: string } {
    const settings = this.options.getSettings();
    const dirs = settings.outputDirs || [settings.defaultOutputDir];
    const normalizedTarget = path.resolve(targetPath || '').toLowerCase();
    const labelMap = this.buildDirLabelMap(dirs);
    for (const dir of dirs) {
      const normalizedDir = path.resolve(dir || '').toLowerCase();
      if (normalizedTarget.startsWith(normalizedDir + path.sep)) {
        return { label: labelMap.get(dir.toLowerCase()) || path.basename(dir), fullPath: dir };
      }
    }
    const parent = path.dirname(targetPath);
    return { label: path.basename(parent) || 'Desconocida', fullPath: parent };
  }

  saveNow(): void {
    try {
      const toSave = this.items.filter(
        (item) => item.status === 'pending' || item.status === 'downloading' || item.status === 'paused',
      );
      if (!this.options.database.isReady()) return;
      if (this.queueLoadFailed) {
        this.options.logError('La cola no se persiste porque la carga desde SQLite falló.');
        return;
      }

      const rows: QueueDatabaseWriteRow[] = toSave.map((item) => ({
        id: item.id,
        slug: item.slug,
        download_slug: item.downloadSlug || null,
        anime_title: item.animeTitle,
        poster: item.poster || null,
        preferred_server: item.preferredServer || null,
        episodes: JSON.stringify(item.episodes || []),
        lang: item.lang || 'SUB',
        status: item.status,
        current_ep: item.currentEp,
        provider_id: item.providerId || null,
        progress: item.progress,
        completed_eps: JSON.stringify(item.completedEps || []),
        failed_eps: JSON.stringify(item.failedEps || []),
        paused_eps: JSON.stringify(item.pausedEps || []),
        cancelled_eps: JSON.stringify(item.cancelledEps || []),
        target_path: item.targetPath,
        output_dir_index: item.outputDirIndex ?? 0,
        current_server: item.currentServer || null,
      }));

      this.options.database.saveQueueItems(rows);
    } catch (error) {
      this.options.logError(error);
    }
  }

  sendToRenderer(): boolean {
    if (!this.options.canBroadcast()) return false;
    const enriched = this.items.map((item) => {
      const info = this.getDirInfo(item.targetPath);
      return { ...item, dirLabel: info.label, dirFullPath: info.fullPath };
    });
    const result = this.options.sendQueueUpdate(enriched);
    // sendQueueUpdate may return false if window hidden (double gate)
    if (result === false) return false;
    return true;
  }

  flush(): void {
    // flush is full sync; pending delta becomes redundant if full sync succeeds
    // but we must not discard pending if broadcast fails
    const hadPending = this.pendingProgressDelta;
    this.clearTimersPreservePending();
    this.saveNow();
    const sent = this.sendToRenderer();
    if (sent) {
      this.lastQueueBroadcastAt = Date.now();
      // full sync already contains latest progress, pending no longer needed
      this.pendingProgressDelta = null;
    } else {
      // restore pending if had one, since full sync not delivered
      if (hadPending) this.pendingProgressDelta = hadPending;
    }
  }

  flushProgress(): void {
    if (!this.pendingProgressDelta) return;
    if (!this.options.canBroadcast()) {
      // conservar para cuando vuelva a estar visible; full sync en restore lo cubrirá
      return;
    }
    const delta = this.pendingProgressDelta;
    // no null yet, only after confirmed send
    const sent = this.sendProgress(delta);
    if (sent) {
      this.pendingProgressDelta = null;
      if (this.queueProgressTimer) {
        clearTimeout(this.queueProgressTimer);
        this.queueProgressTimer = null;
      }
      this.lastProgressBroadcastAt = Date.now();
    }
    // si no se pudo enviar (segundo gate en main), conservar pending
  }

  saveDebounced(): void {
    if (this.queueSaveTimer) return;
    this.queueSaveTimer = setTimeout(() => {
      this.queueSaveTimer = null;
      this.saveNow();
    }, this.progressSaveMs);
  }

  scheduleUpdate(): void {
    this.saveDebounced();

    const now = Date.now();
    const elapsed = now - this.lastQueueBroadcastAt;
    if (elapsed >= this.progressBroadcastMs) {
      if (!this.options.canBroadcast()) return;
      const sent = this.sendToRenderer();
      if (sent) this.lastQueueBroadcastAt = now;
      return;
    }

    if (this.queueBroadcastTimer) return;
    this.queueBroadcastTimer = setTimeout(() => {
      this.queueBroadcastTimer = null;
      if (!this.options.canBroadcast()) return;
      const sent = this.sendToRenderer();
      if (sent) this.lastQueueBroadcastAt = Date.now();
    }, this.progressBroadcastMs - elapsed);
  }

  scheduleProgress(item: QueueItem, activeEps?: ActiveEpisodeProgress[]): void {
    const delta: QueueProgressDelta = {
      id: item.id,
      progress: item.progress,
      currentEp: item.currentEp,
      currentServer: item.currentServer,
      status: item.status,
      ...(activeEps && activeEps.length > 0 ? { activeEps: activeEps.map((e) => ({ ...e })) } : {}),
    };
    this.pendingProgressDelta = delta;

    const now = Date.now();
    const elapsed = now - this.lastProgressBroadcastAt;
    if (elapsed >= this.progressDeltaMs) {
      if (!this.options.canBroadcast()) {
        // ventana oculta/minimizada: conservar pending, no avanzar timestamp, no enviar 4/s
        return;
      }
      // intentar envío inmediato; solo limpiar pending si se confirma
      const sent = this.sendProgress(delta);
      if (sent) {
        this.lastProgressBroadcastAt = now;
        this.pendingProgressDelta = null;
        if (this.queueProgressTimer) {
          clearTimeout(this.queueProgressTimer);
          this.queueProgressTimer = null;
        }
      } else {
        // segundo gate en main devolvió false: conservar pending
      }
      return;
    }

    if (this.queueProgressTimer) return;
    this.queueProgressTimer = setTimeout(() => {
      this.queueProgressTimer = null;
      if (!this.options.canBroadcast()) {
        // conservar pending para futuro flush/restore; no avanzar timestamp
        return;
      }
      const toSend = this.pendingProgressDelta;
      if (!toSend) return;
      const sent = this.sendProgress(toSend);
      if (sent) {
        this.lastProgressBroadcastAt = Date.now();
        this.pendingProgressDelta = null;
      }
      // si no se pudo enviar, pending ya conservado
    }, this.progressDeltaMs - elapsed);
  }

  private sendProgress(delta: QueueProgressDelta): boolean {
    if (!this.options.canBroadcast()) return false;
    if (!this.options.sendQueueProgress) {
      return this.sendToRenderer();
    }
    const result = this.options.sendQueueProgress(delta);
    if (result === false) return false;
    return true;
  }

  load(): void {
    try {
      if (!this.options.database.isReady()) return;
      const rows = this.options.database.getAllQueueItems();
      if (rows.length === 0) {
        this.queueLoadFailed = false;
        return;
      }

      const loaded: QueueItem[] = [];
      for (const row of rows) {
        try {
          const episodes = JSON.parse(row.episodes || '[]');
          const completedEps = JSON.parse(row.completed_eps || '[]');
          const failedEps = JSON.parse(row.failed_eps || '[]');
          const pausedEps = JSON.parse((row as { paused_eps?: string }).paused_eps || '[]');
          const cancelledEps = JSON.parse((row as { cancelled_eps?: string }).cancelled_eps || '[]');
          if (
            !Array.isArray(episodes) ||
            !Array.isArray(completedEps) ||
            !Array.isArray(failedEps) ||
            !Array.isArray(pausedEps) ||
            !Array.isArray(cancelledEps)
          )
            throw new Error('Invalid queue row arrays');
          loaded.push({
            id: row.id,
            slug: row.slug,
            downloadSlug: row.download_slug || undefined,
            animeTitle: normalizeDisplayAnimeTitle(row.anime_title || ''),
            poster: row.poster || undefined,
            preferredServer: row.preferred_server || undefined,
            episodes,
            lang: (row.lang || 'SUB') as QueueItem['lang'],
            status: 'paused' as const,
            currentEp: null,
            providerId: (row.provider_id || undefined) as QueueItem['providerId'],
            progress: 0,
            completedEps,
            failedEps,
            pausedEps: pausedEps.filter((n: unknown) => Number.isInteger(n)),
            cancelledEps: cancelledEps.filter((n: unknown) => Number.isInteger(n)),
            targetPath: row.target_path || '',
            outputDirIndex: row.output_dir_index ?? 0,
            currentServer: undefined,
          });
        } catch (rowError) {
          this.options.logError(rowError);
          // Skip corrupted row, keep others
        }
      }

      this.items.splice(0, this.items.length, ...loaded);
      this.queueLoadFailed = false;
    } catch (error) {
      this.queueLoadFailed = true;
      this.options.logError(error);
    }
  }

  add(item: QueueItem): void {
    this.items.push(item);
  }

  removeTerminalItems(): void {
    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      const status = this.items[i].status;
      if (status === 'done' || status === 'failed' || status === 'cancelled') {
        this.items.splice(i, 1);
      }
    }
  }

  removeFromQueue(id: string): void {
    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      if (this.items[i].id === id && this.items[i].status !== 'downloading') {
        this.items.splice(i, 1);
      }
    }
  }

  invalidateDirLabelCache(): void {
    this.cachedDirLabelMap = null;
    this.cachedDirLabelMapKey = null;
  }

  clearTimers(): void {
    if (this.queueSaveTimer) {
      clearTimeout(this.queueSaveTimer);
      this.queueSaveTimer = null;
    }
    if (this.queueBroadcastTimer) {
      clearTimeout(this.queueBroadcastTimer);
      this.queueBroadcastTimer = null;
    }
    if (this.queueProgressTimer) {
      clearTimeout(this.queueProgressTimer);
      this.queueProgressTimer = null;
    }
    this.pendingProgressDelta = null;
  }

  private clearTimersPreservePending(): void {
    if (this.queueSaveTimer) {
      clearTimeout(this.queueSaveTimer);
      this.queueSaveTimer = null;
    }
    if (this.queueBroadcastTimer) {
      clearTimeout(this.queueBroadcastTimer);
      this.queueBroadcastTimer = null;
    }
    if (this.queueProgressTimer) {
      clearTimeout(this.queueProgressTimer);
      this.queueProgressTimer = null;
    }
    // pendingProgressDelta se conserva intencionalmente
  }

  // Expuesto solo para tests / diagnóstico
  getPendingProgressDelta(): QueueProgressDelta | null {
    return this.pendingProgressDelta;
  }

  private buildDirLabelMap(dirs: string[]): Map<string, string> {
    const settingsKey = JSON.stringify(dirs);
    if (this.cachedDirLabelMap && this.cachedDirLabelMapKey === settingsKey) {
      return this.cachedDirLabelMap;
    }

    const baseNames = dirs.map((dir) => path.basename(dir));
    const nameCounts = new Map<string, number>();
    for (const name of baseNames) {
      const key = name.toLowerCase();
      nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
    }

    const map = new Map<string, string>();
    for (const dir of dirs) {
      const base = path.basename(dir);
      const count = nameCounts.get(base.toLowerCase()) || 1;
      if (count > 1) {
        const parent = path.basename(path.dirname(dir));
        map.set(dir.toLowerCase(), `${parent}/${base}`);
      } else {
        map.set(dir.toLowerCase(), base);
      }
    }

    this.cachedDirLabelMap = map;
    this.cachedDirLabelMapKey = settingsKey;
    return map;
  }
}
