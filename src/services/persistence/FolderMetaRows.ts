import * as cryptolib from 'crypto';
import type Database from 'better-sqlite3';
import { measure } from './dbMetrics';

export function parseAlternativeTitlesColumn(value: unknown): string[] {
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return (parsed as unknown[]).filter((v): v is string => typeof v === 'string' && !!v.trim());
  } catch {
    return [];
  }
}

export function serializeAlternativeTitlesColumn(value: unknown): string {
  return JSON.stringify(parseAlternativeTitlesColumn(typeof value === 'string' ? value : JSON.stringify(value ?? [])));
}

export function folderHash(folderPath: string): string {
  return cryptolib.createHash('sha1').update(folderPath.toLowerCase()).digest('hex');
}

export class FolderMetaRows {
  constructor(private readonly db: Database.Database) {}

  getFolderMeta(folderPath: string): Record<string, unknown> | null {
    return measure('SELECT folder_meta', () => {
      const row = this.db
        .prepare('SELECT * FROM folder_meta WHERE folder_path_hash = ?')
        .get(folderHash(folderPath)) as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        slug: row.slug || null,
        title: row.title || undefined,
        secondaryTitle: row.secondary_title || undefined,
        alternativeTitles: parseAlternativeTitlesColumn(row.alternative_titles),
        category: row.category || undefined,
        year: row.year || undefined,
        status: row.status || undefined,
        season: row.season || undefined,
        updatedAt: row.updated_at || undefined,
        posterUrl: row.poster_url || undefined,
        bannerUrl: row.banner_url || undefined,
        providerId: row.provider_id || null,
        anilistId: typeof row.anilist_id === 'number' ? row.anilist_id : null,
        folderPath: row.folder_path || folderPath,
      };
    });
  }

  setFolderMeta(folderPath: string, data: Record<string, unknown>): void {
    measure('INSERT folder_meta', () => {
      this.db
        .prepare(
          `INSERT OR REPLACE INTO folder_meta
               (folder_path_hash, folder_path, slug, title, secondary_title, alternative_titles, category, year,
                status, season, poster_url, banner_url, provider_id, anilist_id, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          folderHash(folderPath),
          folderPath,
          (data.slug as string) || null,
          (data.title as string) || null,
          (data.secondaryTitle as string) || null,
          serializeAlternativeTitlesColumn(data.alternativeTitles),
          (data.category as string) || null,
          (data.year as string) || null,
          (data.status as string) || null,
          (data.season as string) || null,
          (data.posterUrl as string) || null,
          (data.bannerUrl as string) || null,
          (data.providerId as string) || null,
          Number.isInteger(data.anilistId) ? (data.anilistId as number) : null,
          Date.now(),
        );
    });
  }

  deleteFolderMeta(folderPath: string): void {
    measure('DELETE folder_meta', () => {
      this.db.prepare('DELETE FROM folder_meta WHERE folder_path_hash = ?').run(folderHash(folderPath));
    });
  }
}
