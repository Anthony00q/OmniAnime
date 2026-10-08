import type Database from 'better-sqlite3';
import { measure } from './dbMetrics';

export type AniLinkSource = 'auto' | 'manual';

export interface AniLinkRecord {
  providerId: string;
  slug: string;
  anilistId: number;
  source: AniLinkSource;
}

function isValidLink(providerId: string, slug: string, anilistId: number): boolean {
  return !!providerId.trim() && !!slug.trim() && Number.isInteger(anilistId) && anilistId > 0;
}

export class AniLinkRows {
  constructor(private readonly db: Database.Database) {}

  getLink(providerId: string, slug: string): AniLinkRecord | null {
    if (!providerId.trim() || !slug.trim()) return null;
    return measure('SELECT anilist_link', () => {
      const row = this.db
        .prepare('SELECT anilist_id, source FROM anilist_link WHERE provider_id = ? AND slug = ?')
        .get(providerId, slug) as { anilist_id?: number; source?: string } | undefined;
      if (!row || typeof row.anilist_id !== 'number') return null;
      return {
        providerId,
        slug,
        anilistId: row.anilist_id,
        source: row.source === 'manual' ? 'manual' : 'auto',
      };
    });
  }

  setLink(providerId: string, slug: string, anilistId: number, source: AniLinkSource): void {
    if (!isValidLink(providerId, slug, anilistId)) return;
    measure('INSERT anilist_link', () => {
      const existing = this.getLink(providerId, slug);
      if (existing?.source === 'manual' && source !== 'manual') return;
      this.db
        .prepare(
          `INSERT OR REPLACE INTO anilist_link (provider_id, slug, anilist_id, source, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(providerId, slug, anilistId, source, Date.now());
    });
  }

  removeLink(providerId: string, slug: string): void {
    if (!providerId.trim() || !slug.trim()) return;
    measure('DELETE anilist_link', () => {
      this.db.prepare('DELETE FROM anilist_link WHERE provider_id = ? AND slug = ?').run(providerId, slug);
    });
  }
}
