import type { HistoryDatabaseRow, HistoryScope, HistoryViewRecord, HistoryWriteRecord } from '../types/history';

export interface HistoryStore {
  addHistoryRecord(record: HistoryWriteRecord): boolean;
  getAllHistory(): HistoryDatabaseRow[];
  clearHistory(): void;
  removeHistoryEntryByRowId(rowId: number): boolean;
  removeHistoryEntriesByRowIds(rowIds: number[]): boolean;
}

export interface HistoryDirectoryInfo {
  label: string;
  fullPath: string;
}

export interface HistoryServiceOptions {
  store: HistoryStore;
  getDirInfo: (targetPath: string) => HistoryDirectoryInfo;
  notifyUpdated: () => void;
  logError: (error: unknown) => void;
  notifyError: (message: string) => void;
}

export class HistoryService {
  constructor(private readonly options: HistoryServiceOptions) {}

  writeHistory(record: HistoryWriteRecord): boolean {
    try {
      const written = this.options.store.addHistoryRecord(record);
      if (written) this.notifyUpdatedSafely();
      return written;
    } catch (error) {
      this.options.logError(error);
      this.options.notifyError('No se pudo guardar el resultado en el historial.');
      return false;
    }
  }

  getHistory(): HistoryViewRecord[] {
    return this.options.store.getAllHistory().map((row) => {
      const record = {
        date: row.date,
        anime: row.anime,
        slug: row.slug,
        episode: row.episode,
        status: row.status,
        path: row.path,
        providerId: row.provider_id || undefined,
        _dbId: row.id,
      };
      const info = this.options.getDirInfo(record.path || '');
      let episodeList: number[] = [];
      try {
        episodeList = JSON.parse(row.episode_list || '[]');
        if (!Array.isArray(episodeList)) episodeList = [];
      } catch {
        episodeList = [];
      }
      return {
        ...record,
        scope: row.scope === 'queue' ? ('queue' as HistoryScope) : ('episode' as HistoryScope),
        queueId: row.queue_id || undefined,
        reason: row.reason || undefined,
        episodeList,
        dirLabel: info.label,
        dirFullPath: info.fullPath,
      };
    });
  }

  clearHistory(): boolean {
    try {
      this.options.store.clearHistory();
      this.notifyUpdatedSafely();
      return true;
    } catch {
      return false;
    }
  }

  removeHistoryEntry(index: number): boolean {
    try {
      const rows = this.options.store.getAllHistory();
      if (index < 0 || index >= rows.length) return false;
      const removed = this.options.store.removeHistoryEntryByRowId(rows[index].id);
      if (removed) this.notifyUpdatedSafely();
      return removed;
    } catch {
      return false;
    }
  }

  removeHistoryEntries(indices: number[], expectedIds?: number[]): boolean {
    try {
      const rows = this.options.store.getAllHistory();
      const uniqueIndices = Array.from(new Set(indices));
      if (expectedIds) {
        if (expectedIds.length !== uniqueIndices.length) return false;
        for (let i = 0; i < uniqueIndices.length; i += 1) {
          const index = uniqueIndices[i];
          if (index < 0 || index >= rows.length || rows[index].id !== expectedIds[i]) {
            return false;
          }
        }
      }
      const rowIds = uniqueIndices.filter((index) => index >= 0 && index < rows.length).map((index) => rows[index].id);
      const removed = this.options.store.removeHistoryEntriesByRowIds(rowIds);
      if (removed) this.notifyUpdatedSafely();
      return removed;
    } catch {
      return false;
    }
  }

  private notifyUpdatedSafely(): void {
    try {
      this.options.notifyUpdated();
    } catch (error) {
      this.options.logError(error);
    }
  }
}
