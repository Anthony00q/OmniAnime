import * as fs from 'fs';
import * as path from 'path';
import type Database from 'better-sqlite3';
import type { ScopedLogger } from '../logging/AppLogger';
import { safeErrorMessage } from '../../utils/logging/redactLog';
import { normalizeSoundPack } from '../../utils/sounds/soundPacks';
import { tableHasColumn } from './schema';
import { measure } from './dbMetrics';
import { folderHash } from './FolderMetaRows';
import { SettingsRows } from './SettingsRows';

export interface LegacyImportOptions {
  userDataDir: string;
  dataDir: string;
  log: ScopedLogger;
}

// Migración única desde los JSON previos a SQLite; los importados quedan en .bak para no reprocesarlos.
export function importLegacyJsonFiles(db: Database.Database, options: LegacyImportOptions): void {
  importSettingsFromJson(db, options);
  importQueueFromJson(db, options);
  importHistoryFromJson(db, options);
  importFolderMetaFromJson(db, options);
}

function importSettingsFromJson(db: Database.Database, options: LegacyImportOptions): void {
  try {
    const fp = path.join(options.userDataDir, 'settings.json');
    if (!fs.existsSync(fp)) return;

    const raw = fs.readFileSync(fp, 'utf-8');
    const settings = JSON.parse(raw);

    if (!settings || typeof settings !== 'object') return;

    measure('importSettings INSERT', () => {
      const hasDownloadCol = tableHasColumn(db, 'settings', 'download_settings');
      if (hasDownloadCol) {
        db.prepare(
          `INSERT OR REPLACE INTO settings
                   (id, default_output_dir, output_dirs, notify_on_complete, minimize_to_tray_on_close,
                    naming_style, theme, accent_color, toast_position,
                    notifications_sound, sound_volume, sound_pack, sound_enabled, sound_profiles,
                    notification_settings, shortcuts, default_provider, hardware_acceleration,
                    download_settings)
                   VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          settings.defaultOutputDir || '',
          JSON.stringify(settings.outputDirs || []),
          settings.notifyOnComplete ? 1 : 0,
          settings.minimizeToTrayOnClose ? 1 : 0,
          settings.namingStyle || 'descriptive',
          settings.theme || 'dark',
          settings.accentColor || 'hsl(35 78% 57%)',
          settings.toastPosition || 'top-center',
          settings.notificationsSound ? 1 : 0,
          settings.soundVolume ?? 0.5,
          normalizeSoundPack(settings.soundPack),
          JSON.stringify(settings.soundEnabled || {}),
          JSON.stringify(settings.soundProfiles || {}),
          JSON.stringify(settings.notificationSettings || {}),
          JSON.stringify(settings.shortcuts || {}),
          settings.defaultProvider || 'animeav1',
          settings.hardwareAcceleration === false ? 0 : 1,
          JSON.stringify(settings.download || {}),
        );
      } else {
        db.prepare(
          `INSERT OR REPLACE INTO settings
                   (id, default_output_dir, output_dirs, notify_on_complete, minimize_to_tray_on_close,
                    naming_style, theme, accent_color, toast_position,
                    notifications_sound, sound_volume, sound_pack, sound_enabled, sound_profiles,
                    notification_settings, shortcuts, default_provider, hardware_acceleration)
                   VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          settings.defaultOutputDir || '',
          JSON.stringify(settings.outputDirs || []),
          settings.notifyOnComplete ? 1 : 0,
          settings.minimizeToTrayOnClose ? 1 : 0,
          settings.namingStyle || 'descriptive',
          settings.theme || 'dark',
          settings.accentColor || 'hsl(35 78% 57%)',
          settings.toastPosition || 'top-center',
          settings.notificationsSound ? 1 : 0,
          settings.soundVolume ?? 0.5,
          normalizeSoundPack(settings.soundPack),
          JSON.stringify(settings.soundEnabled || {}),
          JSON.stringify(settings.soundProfiles || {}),
          JSON.stringify(settings.notificationSettings || {}),
          JSON.stringify(settings.shortcuts || {}),
          settings.defaultProvider || 'animeav1',
          settings.hardwareAcceleration === false ? 0 : 1,
        );
      }
    });

    const bak = fp + '.bak';
    try {
      fs.renameSync(fp, bak);
    } catch {}
  } catch (e) {
    options.log.error('Error importing settings from JSON: ' + safeErrorMessage(e));
  }
}

function importQueueFromJson(db: Database.Database, options: LegacyImportOptions): void {
  try {
    const fp = path.join(options.dataDir, 'download_queue.json');
    if (!fs.existsSync(fp)) return;

    const raw = fs.readFileSync(fp, 'utf-8');
    const items = JSON.parse(raw);

    if (!Array.isArray(items) || items.length === 0) {
      const bak = fp + '.bak';
      try {
        fs.renameSync(fp, bak);
      } catch {}
      return;
    }

    const tx = db.transaction(() => {
      for (const item of items) {
        db.prepare(
          `INSERT OR REPLACE INTO download_queue
                      (id, slug, download_slug, anime_title, poster, preferred_server,
                       episodes, lang, status, current_ep, provider_id, progress,
                       completed_eps, failed_eps, paused_eps, cancelled_eps,
                       target_path, output_dir_index, current_server)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          item.id || '',
          item.slug || '',
          item.downloadSlug || null,
          item.animeTitle || '',
          item.poster || null,
          item.preferredServer || null,
          JSON.stringify(item.episodes || []),
          item.lang || 'SUB',
          'paused',
          null,
          item.providerId || null,
          0,
          JSON.stringify(item.completedEps || []),
          JSON.stringify(item.failedEps || []),
          JSON.stringify((item as { pausedEps?: number[] }).pausedEps || []),
          JSON.stringify((item as { cancelledEps?: number[] }).cancelledEps || []),
          item.targetPath || '',
          item.outputDirIndex ?? 0,
          null,
        );
      }
    });
    measure('importQueue transaction', () => tx());

    const bak = fp + '.bak';
    try {
      fs.renameSync(fp, bak);
    } catch {}
  } catch (e) {
    options.log.error('Error importing queue from JSON: ' + safeErrorMessage(e));
  }
}

function importHistoryFromJson(db: Database.Database, options: LegacyImportOptions): void {
  try {
    const fp = path.join(options.dataDir, 'download_history.json');
    if (!fs.existsSync(fp)) return;

    const raw = fs.readFileSync(fp, 'utf-8');
    const records = JSON.parse(raw);

    if (!Array.isArray(records) || records.length === 0) {
      const bak = fp + '.bak';
      try {
        fs.renameSync(fp, bak);
      } catch {}
      return;
    }

    const tx = db.transaction(() => {
      for (const rec of records) {
        db.prepare(
          `INSERT INTO download_history (date, anime, slug, episode, status, path, provider_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          rec.date || '',
          rec.anime || '',
          rec.slug || '',
          rec.episode ?? 0,
          rec.status || 'fail',
          rec.path || '',
          rec.providerId || null,
        );
      }
    });
    measure('importHistory transaction', () => tx());

    const bak = fp + '.bak';
    try {
      fs.renameSync(fp, bak);
    } catch {}
  } catch (e) {
    options.log.error('Error importing history from JSON: ' + safeErrorMessage(e));
  }
}

function importFolderMetaFromJson(db: Database.Database, options: LegacyImportOptions): void {
  try {
    const settings = new SettingsRows(db).getSettings();
    if (!settings) return;

    const dirs = settings.outputDirs || [settings.defaultOutputDir];

    for (const dirPath of dirs) {
      if (!dirPath || !fs.existsSync(dirPath)) continue;

      let entries: string[];
      try {
        entries = fs.readdirSync(dirPath);
      } catch {
        continue;
      }

      for (const entry of entries) {
        const folderPath = path.join(dirPath, entry);
        let isDirectory = false;
        try {
          isDirectory = fs.statSync(folderPath).isDirectory();
        } catch {
          continue;
        }
        if (!isDirectory) continue;

        const metaFile = path.join(folderPath, '.omnianime');
        if (!fs.existsSync(metaFile)) continue;

        try {
          const marker = JSON.parse(fs.readFileSync(metaFile, 'utf-8')) as Record<string, unknown>;
          if (!marker || typeof marker !== 'object') continue;

          const assetMetaPath = path.join(
            options.userDataDir,
            'library_assets_v1',
            folderHash(folderPath),
            'library-meta.json',
          );
          let assetMeta: Record<string, unknown> = {};
          try {
            if (fs.existsSync(assetMetaPath)) {
              const parsed = JSON.parse(fs.readFileSync(assetMetaPath, 'utf-8'));
              if (parsed && typeof parsed === 'object') assetMeta = parsed;
            }
          } catch {
            /* El marcador mínimo sigue siendo un respaldo válido. */
          }

          const meta: Record<string, unknown> = {
            ...assetMeta,
            slug: assetMeta.slug || marker.slug,
            title: assetMeta.title || marker.title,
            secondaryTitle: assetMeta.secondaryTitle || marker.secondaryTitle,
            alternativeTitles: assetMeta.alternativeTitles || marker.alternativeTitles,
            providerId: assetMeta.providerId || marker.providerId,
            anilistId: assetMeta.anilistId ?? marker.anilistId,
            updatedAt: assetMeta.updatedAt || marker.updatedAt,
          };

          const asText = (value: unknown): string | null => (typeof value === 'string' ? value : null);
          const asTimestamp = (value: unknown): number => (typeof value === 'number' ? value : Date.now());
          const asJsonArray = (value: unknown): string => {
            const list = Array.isArray(value)
              ? (value as unknown[]).filter((v): v is string => typeof v === 'string' && !!v.trim())
              : [];
            return JSON.stringify(list);
          };

          db.prepare(
            `INSERT OR REPLACE INTO folder_meta
                         (folder_path_hash, folder_path, slug, title, secondary_title, alternative_titles, category, year,
                          status, season, poster_url, banner_url, provider_id, anilist_id, updated_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            folderHash(folderPath),
            folderPath,
            asText(meta.slug),
            asText(meta.title),
            asText(meta.secondaryTitle),
            asJsonArray(meta.alternativeTitles),
            asText(meta.category),
            asText(meta.year),
            asText(meta.status),
            asText(meta.season),
            asText(meta.posterUrl),
            asText(meta.bannerUrl),
            asText(meta.providerId),
            Number.isInteger(meta.anilistId) ? (meta.anilistId as number) : null,
            asTimestamp(meta.updatedAt),
          );
        } catch {
          continue;
        }
      }
    }
  } catch (e) {
    options.log.error('Error importing folder meta from JSON: ' + safeErrorMessage(e));
  }
}
