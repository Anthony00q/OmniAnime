import type Database from 'better-sqlite3';
import type { HistoryDatabaseRow, HistoryWriteRecord } from '../../types/history';
import { measure } from './dbMetrics';

const HISTORY_LIMIT = 200;

export function sanitizeReason(reason?: string | null): string | null {
  if (!reason) return null;
  let r = reason.trim().replace(/\s+/g, ' ');
  if (r.length > 300) r = r.slice(0, 297) + '...';
  return r;
}

export class HistoryRows {
  constructor(private readonly db: Database.Database) {}

  getAllHistory(): HistoryDatabaseRow[] {
    return measure('SELECT history', () => {
      const rows = this.db
        .prepare('SELECT * FROM download_history ORDER BY id DESC LIMIT 500')
        .all() as HistoryDatabaseRow[];
      return rows;
    });
  }

  addHistoryRecord(record: HistoryWriteRecord): boolean {
    const scope = record.scope || 'episode';
    if (scope === 'queue' && record.queueId) {
      const existing = measure('SELECT history queue_id', () => {
        return this.db
          .prepare(`SELECT id FROM download_history WHERE scope = 'queue' AND queue_id = ? LIMIT 1`)
          .get(record.queueId) as { id?: number } | undefined;
      });
      if (existing) return false;
    }

    const sanitizedReason = sanitizeReason(record.reason);
    measure('transaction addHistory', () => {
      const tx = this.db.transaction(() => {
        this.db
          .prepare(
            `INSERT INTO download_history
                (date, anime, slug, episode, status, path, provider_id, scope, queue_id, reason, episode_list)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            record.date,
            record.anime,
            record.slug,
            record.episode ?? null,
            record.status,
            record.path || '',
            record.providerId || null,
            scope,
            record.queueId || null,
            sanitizedReason,
            JSON.stringify(record.episodeList || []),
          );
        this.db
          .prepare(
            `DELETE FROM download_history WHERE id < (
                SELECT id FROM download_history ORDER BY id DESC LIMIT 1 OFFSET ${HISTORY_LIMIT - 1}
            )`,
          )
          .run();
      });
      tx();
    });

    return true;
  }

  clearHistory(): void {
    measure('DELETE history', () => {
      this.db.prepare('DELETE FROM download_history').run();
    });
  }

  removeHistoryEntryByRowId(rowId: number): boolean {
    return measure('DELETE history by id', () => {
      const info = this.db.prepare('DELETE FROM download_history WHERE id = ?').run(rowId);
      return info.changes > 0;
    });
  }

  removeHistoryEntriesByRowIds(rowIds: number[]): boolean {
    if (rowIds.length === 0) return true;

    const sorted = [...new Set(rowIds)].sort((a, b) => b - a);
    measure('transaction removeHistory', () => {
      const tx = this.db.transaction(() => {
        const stmt = this.db.prepare('DELETE FROM download_history WHERE id = ?');
        for (const id of sorted) {
          stmt.run(id);
        }
      });
      tx();
    });
    return true;
  }

  getHistoryCount(): number {
    return measure('SELECT history count', () => {
      const row = this.db.prepare('SELECT COUNT(*) as c FROM download_history').get() as { c: number } | undefined;
      return row?.c ?? 0;
    });
  }

  pruneHistory(): void {
    measure('pruneHistory DELETE', () => {
      this.db
        .prepare(
          `
            DELETE FROM download_history WHERE id < (
                SELECT id FROM download_history ORDER BY id DESC LIMIT 1 OFFSET ${HISTORY_LIMIT - 1}
            )
        `,
        )
        .run();
    });
  }
}
