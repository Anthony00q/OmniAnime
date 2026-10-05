import type Database from 'better-sqlite3';
import type { QueueDatabaseRow, QueueDatabaseWriteRow } from '../../types/queue';
import { ensureQueueEpisodeColumns } from './schema';
import { measure } from './dbMetrics';

export class QueueRows {
  constructor(private readonly db: Database.Database) {}

  getAllQueueItems(): QueueDatabaseRow[] {
    return measure('SELECT queue', () => {
      const rows = this.db.prepare('SELECT * FROM download_queue').all() as QueueDatabaseRow[];
      return rows;
    });
  }

  saveQueueItems(items: QueueDatabaseWriteRow[]): void {
    measure('transaction saveQueueItems', () => {
      ensureQueueEpisodeColumns(this.db);
      const tx = this.db.transaction(() => {
        this.db.prepare('DELETE FROM download_queue').run();
        if (items.length > 0) {
          const stmt = this.db.prepare(
            `INSERT INTO download_queue
                          (id, slug, download_slug, anime_title, poster, preferred_server,
                           episodes, lang, status, current_ep, provider_id, progress,
                           completed_eps, failed_eps, paused_eps, cancelled_eps,
                           target_path, output_dir_index, current_server)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          );
          for (const item of items) {
            stmt.run(
              item.id,
              item.slug,
              item.download_slug,
              item.anime_title,
              item.poster,
              item.preferred_server,
              item.episodes,
              item.lang,
              item.status,
              item.current_ep,
              item.provider_id,
              item.progress,
              item.completed_eps,
              item.failed_eps,
              item.paused_eps ?? '[]',
              item.cancelled_eps ?? '[]',
              item.target_path,
              item.output_dir_index,
              item.current_server,
            );
          }
        }
      });
      tx();
    });
  }
}
