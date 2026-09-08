import * as fs from 'fs';
import * as path from 'path';
import * as cryptolib from 'crypto';
import { app } from 'electron';
import Database from 'better-sqlite3';
import { AppSettings } from '../types/settings';
import type { HistoryScope, HistoryStatus, HistoryWriteRecord } from '../types/history';

const SCHEMA_VERSION = 4;

interface QueueItemRow {
  id: string;
  slug: string;
  download_slug: string | null;
  anime_title: string;
  poster: string | null;
  preferred_server: string | null;
  episodes: string;
  lang: string;
  status: string;
  current_ep: number | null;
  provider_id: string | null;
  progress: number;
  completed_eps: string;
  failed_eps: string;
  paused_eps?: string;
  cancelled_eps?: string;
  target_path: string;
  output_dir_index: number;
  current_server: string | null;
}

interface HistoryRow {
  id: number;
  date: string;
  anime: string;
  slug: string;
  episode: number | null;
  status: HistoryStatus;
  path: string;
  provider_id: string | null;
  scope: HistoryScope;
  queue_id: string | null;
  reason: string | null;
  episode_list: string;
}

let writeCount = 0;
let totalPersistMs = 0;
function measure<T>(label: string, fn: () => T): T {
  const result = fn();
  if (
    label.includes('INSERT') ||
    label.includes('DELETE') ||
    label.toLowerCase().includes('transaction') ||
    label.includes('saveQueue')
  ) {
    writeCount++;
  }
  return result;
}

export class DatabaseManager {
  private static instance: DatabaseManager;
  private db: Database.Database | null = null;
  private dbPath: string;
  private ready = false;

  private constructor() {
    this.dbPath = path.join(app.getPath('userData'), 'omnianime.db');
  }

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  isReady(): boolean {
    return this.ready;
  }

  // Para tests: cerrar y reabrir
  close(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch {}
      this.db = null;
      this.ready = false;
      this.initPromise = null;
    }
  }

  getDbPath(): string {
    return this.dbPath;
  }

  getWriteCount(): number {
    return writeCount;
  }

  getTotalPersistMs(): number {
    return totalPersistMs;
  }

  resetWriteCount(): void {
    writeCount = 0;
    totalPersistMs = 0;
  }

  getDbSize(): number {
    try {
      let total = 0;
      try {
        total += fs.statSync(this.dbPath).size;
      } catch {}
      try {
        total += fs.statSync(this.dbPath + '-wal').size;
      } catch {}
      try {
        total += fs.statSync(this.dbPath + '-shm').size;
      } catch {}
      return total;
    } catch {
      return 0;
    }
  }

  getDbSizeBreakdown(): { db: number; wal: number; shm: number; total: number } {
    let db = 0,
      wal = 0,
      shm = 0;
    try {
      db = fs.statSync(this.dbPath).size;
    } catch {}
    try {
      wal = fs.statSync(this.dbPath + '-wal').size;
    } catch {}
    try {
      shm = fs.statSync(this.dbPath + '-shm').size;
    } catch {}
    return { db, wal, shm, total: db + wal + shm };
  }

  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.ready) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const isExisting = fs.existsSync(this.dbPath);
      if (isExisting) {
        try {
          const testDb = new Database(this.dbPath, { readonly: true });
          testDb.pragma('integrity_check');
          testDb.close();
          this.db = new Database(this.dbPath);
        } catch (e) {
          console.error('DB corrupta o no SQLite, creando nueva:', e);
          const corruptPath = this.dbPath + '.corrupt-' + Date.now();
          try {
            fs.renameSync(this.dbPath, corruptPath);
          } catch {}
          this.db = new Database(this.dbPath);
        }
      } else {
        this.db = new Database(this.dbPath);
      }

      try {
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');
        this.db.pragma('busy_timeout = 5000');
        this.db.pragma('cache_size = -64000');
        this.db.pragma('temp_store = MEMORY');
        this.db.pragma('foreign_keys = ON');
      } catch (e) {
        console.warn('No se pudo activar WAL:', e);
      }

      this.runMigrations();
      const currentVersion = this.getMetaVersion();
      const historyNeedsMigration = !this.hasHistoryV2Columns();
      if (currentVersion === 0 && historyNeedsMigration) {
        const backupPath = `${this.dbPath}.pre-v${SCHEMA_VERSION}-${Date.now()}.bak`;
        try {
          this.db.pragma('wal_checkpoint(TRUNCATE)');
          fs.copyFileSync(this.dbPath, backupPath);
        } catch (e) {
          console.error('No se pudo crear respaldo antes de migrar SQLite:', e);
        }
        this.runSchemaMigrations(currentVersion);
        this.setMetaVersion(SCHEMA_VERSION);
      } else if (currentVersion === 0) {
        this.importFromJsonFiles();
        this.setMetaVersion(SCHEMA_VERSION);
      } else if (currentVersion < SCHEMA_VERSION) {
        const backupPath = `${this.dbPath}.pre-v${SCHEMA_VERSION}-${Date.now()}.bak`;
        try {
          this.db.pragma('wal_checkpoint(TRUNCATE)');
          fs.copyFileSync(this.dbPath, backupPath);
        } catch (e) {
          console.error('No se pudo crear respaldo antes de migrar SQLite:', e);
        }
        this.runSchemaMigrations(currentVersion);
        this.setMetaVersion(SCHEMA_VERSION);
      }

      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_history_queue_id ON download_history(queue_id)`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_history_scope_queue_id ON download_history(scope, queue_id)`);
      this.pruneHistory();
      this.persist();

      this.ready = true;
    })().catch((error) => {
      this.initPromise = null;
      throw error;
    });

    return this.initPromise;
  }

  private persist(): void {
    if (!this.db) return;
  }

  private getMetaVersion(): number {
    try {
      this.db!.exec(`
                CREATE TABLE IF NOT EXISTS _meta (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
            `);
      const row = this.db!.prepare('SELECT value FROM _meta WHERE key = ?').get('schema_version') as
        { value?: string } | undefined;
      if (row?.value) {
        return parseInt(row.value, 10) || 0;
      }
      return 0;
    } catch {
      return 0;
    }
  }

  private setMetaVersion(version: number): void {
    measure('setMetaVersion INSERT', () => {
      this.db!.prepare('INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)').run(
        'schema_version',
        String(version),
      );
    });
  }

  private tableHasColumn(table: string, column: string): boolean {
    if (!this.db) return false;
    const rows = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>;
    return rows.some((r) => r.name === column);
  }

  private hasHistoryV2Columns(): boolean {
    return ['scope', 'queue_id', 'reason', 'episode_list'].every((column) =>
      this.tableHasColumn('download_history', column),
    );
  }

  private pruneHistory(): void {
    measure('pruneHistory DELETE', () => {
      this.db!.prepare(
        `
            DELETE FROM download_history WHERE id < (
                SELECT id FROM download_history ORDER BY id DESC LIMIT 1 OFFSET 199
            )
        `,
      ).run();
    });
  }

  private runMigrations(): void {
    measure('runMigrations', () => {
      this.db!.exec(`
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                default_output_dir TEXT NOT NULL,
                output_dirs TEXT NOT NULL,
                notify_on_complete INTEGER NOT NULL DEFAULT 1,
                minimize_to_tray_on_close INTEGER NOT NULL DEFAULT 0,
                naming_style TEXT NOT NULL DEFAULT 'descriptive',
                auto_rename_retroactive INTEGER NOT NULL DEFAULT 0,
                theme TEXT NOT NULL DEFAULT 'dark',
                accent_color TEXT NOT NULL DEFAULT 'hsl(217.2 91.2% 59.8%)',
                toast_position TEXT NOT NULL DEFAULT 'top-center',
                notifications_sound INTEGER NOT NULL DEFAULT 1,
                sound_volume REAL NOT NULL DEFAULT 0.5,
                sound_enabled TEXT NOT NULL DEFAULT '{}',
                sound_profiles TEXT NOT NULL DEFAULT '{}',
                notification_settings TEXT NOT NULL DEFAULT '{}',
                shortcuts TEXT NOT NULL DEFAULT '{}',
                default_provider TEXT NOT NULL DEFAULT 'animeav1',
                hardware_acceleration INTEGER NOT NULL DEFAULT 1,
                download_settings TEXT NOT NULL DEFAULT '{}'
            )
        `);

      this.db!.exec(`
            CREATE TABLE IF NOT EXISTS download_queue (
                id TEXT PRIMARY KEY,
                slug TEXT NOT NULL,
                download_slug TEXT,
                anime_title TEXT NOT NULL,
                poster TEXT,
                preferred_server TEXT,
                episodes TEXT NOT NULL,
                lang TEXT NOT NULL DEFAULT 'SUB',
                status TEXT NOT NULL DEFAULT 'pending',
                current_ep INTEGER,
                provider_id TEXT,
                progress REAL NOT NULL DEFAULT 0,
                completed_eps TEXT NOT NULL DEFAULT '[]',
                failed_eps TEXT NOT NULL DEFAULT '[]',
                paused_eps TEXT NOT NULL DEFAULT '[]',
                cancelled_eps TEXT NOT NULL DEFAULT '[]',
                target_path TEXT NOT NULL,
                output_dir_index INTEGER NOT NULL DEFAULT 0,
                current_server TEXT
            )
        `);

      this.db!.exec(`
            CREATE TABLE IF NOT EXISTS download_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                anime TEXT NOT NULL,
                slug TEXT NOT NULL,
                episode INTEGER,
                status TEXT NOT NULL CHECK (status IN ('ok', 'fail', 'cancelled')),
                path TEXT NOT NULL,
                provider_id TEXT,
                scope TEXT NOT NULL DEFAULT 'episode' CHECK (scope IN ('episode', 'queue')),
                queue_id TEXT,
                reason TEXT,
                episode_list TEXT NOT NULL DEFAULT '[]'
            )
        `);

      this.db!.exec(`
            CREATE INDEX IF NOT EXISTS idx_history_slug ON download_history(slug)
        `);
      this.db!.exec(`
            CREATE INDEX IF NOT EXISTS idx_history_scope_queue_id ON download_history(scope, queue_id)
        `);

      this.db!.exec(`
            CREATE TABLE IF NOT EXISTS folder_meta (
                folder_path_hash TEXT PRIMARY KEY,
                folder_path TEXT NOT NULL,
                slug TEXT,
                title TEXT,
                category TEXT,
                year TEXT,
                status TEXT,
                season TEXT,
                poster_url TEXT,
                banner_url TEXT,
                provider_id TEXT,
                updated_at INTEGER NOT NULL
            )
        `);
    });
  }

  private ensureDownloadSettingsColumn(): void {
    try {
      if (!this.tableHasColumn('settings', 'download_settings')) {
        this.db!.exec(`ALTER TABLE settings ADD COLUMN download_settings TEXT NOT NULL DEFAULT '{}'`);
      }
    } catch {}
  }

  private ensureQueueEpisodeColumns(): void {
    try {
      if (!this.tableHasColumn('download_queue', 'paused_eps')) {
        this.db!.exec(`ALTER TABLE download_queue ADD COLUMN paused_eps TEXT NOT NULL DEFAULT '[]'`);
      }
    } catch {}
    try {
      if (!this.tableHasColumn('download_queue', 'cancelled_eps')) {
        this.db!.exec(`ALTER TABLE download_queue ADD COLUMN cancelled_eps TEXT NOT NULL DEFAULT '[]'`);
      }
    } catch {}
  }

  private runSchemaMigrations(currentVersion: number): void {
    this.ensureDownloadSettingsColumn();
    this.ensureQueueEpisodeColumns();
    if (currentVersion >= 4) return;
    if (currentVersion >= 2 && this.hasHistoryV2Columns()) return;

    if (currentVersion >= 2 && this.tableHasColumn('download_history', 'scope')) {
      if (!this.tableHasColumn('download_history', 'queue_id')) {
        this.db!.exec('ALTER TABLE download_history ADD COLUMN queue_id TEXT');
      }
      if (!this.tableHasColumn('download_history', 'reason')) {
        this.db!.exec('ALTER TABLE download_history ADD COLUMN reason TEXT');
      }
      if (!this.tableHasColumn('download_history', 'episode_list')) {
        this.db!.exec(`ALTER TABLE download_history ADD COLUMN episode_list TEXT NOT NULL DEFAULT '[]'`);
      }
      return;
    }

    const tx = this.db!.transaction(() => {
      this.db!.exec('DROP TABLE IF EXISTS download_history_v2');
      this.db!.exec(`
                CREATE TABLE download_history_v2 (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    date TEXT NOT NULL,
                    anime TEXT NOT NULL,
                    slug TEXT NOT NULL,
                    episode INTEGER,
                    status TEXT NOT NULL CHECK (status IN ('ok', 'fail', 'cancelled')),
                    path TEXT NOT NULL,
                    provider_id TEXT,
                    scope TEXT NOT NULL DEFAULT 'episode' CHECK (scope IN ('episode', 'queue')),
                    queue_id TEXT,
                    reason TEXT,
                    episode_list TEXT NOT NULL DEFAULT '[]'
                )
            `);
      this.db!.exec(`
                INSERT INTO download_history_v2
                    (id, date, anime, slug, episode, status, path, provider_id,
                     scope, queue_id, reason, episode_list)
                SELECT id, date, anime, slug, episode, status, path, provider_id,
                       'episode', NULL, NULL, '[]'
                FROM download_history
            `);
      this.db!.exec('DROP TABLE download_history');
      this.db!.exec('ALTER TABLE download_history_v2 RENAME TO download_history');
      this.db!.exec('CREATE INDEX idx_history_slug ON download_history(slug)');
      this.db!.exec('CREATE INDEX idx_history_queue_id ON download_history(queue_id)');
    });

    measure('runSchemaMigrations transaction', () => {
      tx();
    });
  }

  private importFromJsonFiles(): void {
    this.importSettingsFromJson();
    this.importQueueFromJson();
    this.importHistoryFromJson();
    this.importFolderMetaFromJson();
  }

  private importSettingsFromJson(): void {
    try {
      const fp = path.join(app.getPath('userData'), 'settings.json');
      if (!fs.existsSync(fp)) return;

      const raw = fs.readFileSync(fp, 'utf-8');
      const settings = JSON.parse(raw);

      if (!settings || typeof settings !== 'object') return;

      measure('importSettings INSERT', () => {
        const hasDownloadCol = this.tableHasColumn('settings', 'download_settings');
        if (hasDownloadCol) {
          this.db!.prepare(
            `INSERT OR REPLACE INTO settings
                   (id, default_output_dir, output_dirs, notify_on_complete, minimize_to_tray_on_close,
                    naming_style, auto_rename_retroactive, theme, accent_color, toast_position,
                    notifications_sound, sound_volume, sound_enabled, sound_profiles,
                    notification_settings, shortcuts, default_provider, hardware_acceleration,
                    download_settings)
                   VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            settings.defaultOutputDir || '',
            JSON.stringify(settings.outputDirs || []),
            settings.notifyOnComplete ? 1 : 0,
            settings.minimizeToTrayOnClose ? 1 : 0,
            settings.namingStyle || 'descriptive',
            settings.autoRenameRetroactive ? 1 : 0,
            settings.theme || 'dark',
            settings.accentColor || 'hsl(217.2 91.2% 59.8%)',
            settings.toastPosition || 'top-center',
            settings.notificationsSound ? 1 : 0,
            settings.soundVolume ?? 0.5,
            JSON.stringify(settings.soundEnabled || {}),
            JSON.stringify(settings.soundProfiles || {}),
            JSON.stringify(settings.notificationSettings || {}),
            JSON.stringify(settings.shortcuts || {}),
            settings.defaultProvider || 'animeav1',
            settings.hardwareAcceleration === false ? 0 : 1,
            JSON.stringify(settings.download || {}),
          );
        } else {
          this.db!.prepare(
            `INSERT OR REPLACE INTO settings
                   (id, default_output_dir, output_dirs, notify_on_complete, minimize_to_tray_on_close,
                    naming_style, auto_rename_retroactive, theme, accent_color, toast_position,
                    notifications_sound, sound_volume, sound_enabled, sound_profiles,
                    notification_settings, shortcuts, default_provider, hardware_acceleration)
                   VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            settings.defaultOutputDir || '',
            JSON.stringify(settings.outputDirs || []),
            settings.notifyOnComplete ? 1 : 0,
            settings.minimizeToTrayOnClose ? 1 : 0,
            settings.namingStyle || 'descriptive',
            settings.autoRenameRetroactive ? 1 : 0,
            settings.theme || 'dark',
            settings.accentColor || 'hsl(217.2 91.2% 59.8%)',
            settings.toastPosition || 'top-center',
            settings.notificationsSound ? 1 : 0,
            settings.soundVolume ?? 0.5,
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
      console.error('Error importing settings from JSON:', e);
    }
  }

  private importQueueFromJson(): void {
    try {
      const fp = path.join(process.cwd(), 'data', 'download_queue.json');
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

      const tx = this.db!.transaction(() => {
        for (const item of items) {
          this.db!.prepare(
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
      console.error('Error importing queue from JSON:', e);
    }
  }

  private importHistoryFromJson(): void {
    try {
      const fp = path.join(process.cwd(), 'data', 'download_history.json');
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

      const tx = this.db!.transaction(() => {
        for (const rec of records) {
          this.db!.prepare(
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
      console.error('Error importing history from JSON:', e);
    }
  }

  private importFolderMetaFromJson(): void {
    try {
      const settings = this.getSettings();
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
              app.getPath('userData'),
              'library_assets_v1',
              cryptolib.createHash('sha1').update(folderPath.toLowerCase()).digest('hex'),
              'library-meta.json',
            );
            let assetMeta: Record<string, unknown> = {};
            try {
              if (fs.existsSync(assetMetaPath)) {
                const parsed = JSON.parse(fs.readFileSync(assetMetaPath, 'utf-8'));
                if (parsed && typeof parsed === 'object') assetMeta = parsed;
              }
            } catch {
              /* The minimal marker remains a valid fallback. */
            }

            const meta: Record<string, unknown> = {
              ...assetMeta,
              slug: assetMeta.slug || marker.slug,
              title: assetMeta.title || marker.title,
              providerId: assetMeta.providerId || marker.providerId,
              updatedAt: assetMeta.updatedAt || marker.updatedAt,
            };

            const hash = cryptolib.createHash('sha1').update(folderPath.toLowerCase()).digest('hex');
            const asText = (value: unknown): string | null => (typeof value === 'string' ? value : null);
            const asTimestamp = (value: unknown): number => (typeof value === 'number' ? value : Date.now());

            this.db!.prepare(
              `INSERT OR REPLACE INTO folder_meta
                             (folder_path_hash, folder_path, slug, title, category, year,
                              status, season, poster_url, banner_url, provider_id, updated_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ).run(
              hash,
              folderPath,
              asText(meta.slug),
              asText(meta.title),
              asText(meta.category),
              asText(meta.year),
              asText(meta.status),
              asText(meta.season),
              asText(meta.posterUrl),
              asText(meta.bannerUrl),
              asText(meta.providerId),
              asTimestamp(meta.updatedAt),
            );
          } catch {
            continue;
          }
        }
      }
    } catch (e) {
      console.error('Error importing folder meta from JSON:', e);
    }
  }

  getSettings(): AppSettings | null {
    if (!this.db) return null;

    return measure('SELECT settings', () => {
      try {
        const row = this.db!.prepare('SELECT * FROM settings WHERE id = 1').get() as
          Record<string, unknown> | undefined;
        if (!row) return null;
        return this.rowToSettings(row);
      } catch {
        return null;
      }
    });
  }

  saveSettings(settings: AppSettings): void {
    if (!this.db) return;

    measure('INSERT settings', () => {
      this.ensureDownloadSettingsColumn();
      this.db!.prepare(
        `INSERT OR REPLACE INTO settings
               (id, default_output_dir, output_dirs, notify_on_complete, minimize_to_tray_on_close,
                naming_style, auto_rename_retroactive, theme, accent_color, toast_position,
                notifications_sound, sound_volume, sound_enabled, sound_profiles,
                notification_settings, shortcuts, default_provider, hardware_acceleration,
                download_settings)
               VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        settings.defaultOutputDir,
        JSON.stringify(settings.outputDirs || []),
        settings.notifyOnComplete ? 1 : 0,
        settings.minimizeToTrayOnClose ? 1 : 0,
        settings.namingStyle || 'descriptive',
        settings.autoRenameRetroactive ? 1 : 0,
        settings.theme || 'dark',
        settings.accentColor || 'hsl(217.2 91.2% 59.8%)',
        settings.toastPosition || 'top-center',
        settings.notificationsSound ? 1 : 0,
        settings.soundVolume ?? 0.5,
        JSON.stringify(settings.soundEnabled || {}),
        JSON.stringify(settings.soundProfiles || {}),
        JSON.stringify(settings.notificationSettings || {}),
        JSON.stringify(settings.shortcuts || {}),
        settings.defaultProvider || 'animeav1',
        settings.hardwareAcceleration === false ? 0 : 1,
        JSON.stringify(settings.download || {}),
      );
    });
  }

  clearAutoRenameRetroactiveOnce(): boolean {
    if (!this.db) return false;
    try {
      this.db.prepare(`UPDATE settings SET auto_rename_retroactive = 0 WHERE id = 1`).run();
      return true;
    } catch {
      return false;
    }
  }

  private rowToSettings(row: Record<string, unknown>): AppSettings {
    const parseJson = (val: unknown, fallback: any = undefined) => {
      try {
        if (typeof val === 'string') return JSON.parse(val);
        if (fallback !== undefined) return fallback;
        return {};
      } catch {
        return fallback !== undefined ? fallback : {};
      }
    };

    return {
      defaultOutputDir: String(row.default_output_dir || ''),
      outputDirs: (() => {
        const parsed = parseJson(row.output_dirs, []);
        return Array.isArray(parsed) ? parsed : [];
      })(),
      notifyOnComplete: Boolean(row.notify_on_complete),
      minimizeToTrayOnClose: Boolean(row.minimize_to_tray_on_close),
      namingStyle: String(row.naming_style || 'descriptive') as 'minimal' | 'descriptive',
      autoRenameRetroactive: Boolean(row.auto_rename_retroactive),
      theme: String(row.theme || 'dark') as 'dark' | 'quantum' | 'oled',
      accentColor: String(row.accent_color || 'hsl(217.2 91.2% 59.8%)'),
      toastPosition: String(row.toast_position || 'top-center') as AppSettings['toastPosition'],
      notificationsSound: Boolean(row.notifications_sound),
      soundVolume: Number(row.sound_volume ?? 0.5),
      soundEnabled: parseJson(row.sound_enabled, {
        download: true,
        success: true,
        error: true,
        info: true,
      }) as AppSettings['soundEnabled'],
      soundProfiles: parseJson(row.sound_profiles, {
        download: 0.55,
        success: 0.5,
        error: 0.6,
        info: 0.45,
      }) as AppSettings['soundProfiles'],
      notificationSettings: parseJson(row.notification_settings, {
        showDownloadStarted: true,
        showDownloadFinished: true,
        showDownloadError: true,
        showSystemMessages: true,
      }) as AppSettings['notificationSettings'],
      shortcuts: parseJson(row.shortcuts, {
        search: 'F',
        close: 'Escape',
        prevView: 'ArrowLeft',
        nextView: 'ArrowRight',
      }) as AppSettings['shortcuts'],
      defaultProvider: String(row.default_provider || 'animeav1') as 'animeav1' | 'jkanime',
      hardwareAcceleration: (row as Record<string, unknown>).hardware_acceleration !== 0,
      download: (() => {
        const parsed = parseJson((row as Record<string, unknown>).download_settings, undefined);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as AppSettings['download'])
          : undefined;
      })(),
    };
  }

  settingsExist(): boolean {
    if (!this.db) return false;
    return measure('SELECT settingsExist', () => {
      const row = this.db!.prepare('SELECT COUNT(*) as c FROM settings WHERE id = 1').get() as
        { c: number } | undefined;
      return (row?.c ?? 0) > 0;
    });
  }

  getAllQueueItems(): QueueItemRow[] {
    if (!this.db) return [];
    return measure('SELECT queue', () => {
      const rows = this.db!.prepare('SELECT * FROM download_queue').all() as QueueItemRow[];
      return rows;
    });
  }

  saveQueueItems(items: QueueItemRow[]): void {
    if (!this.db) return;

    measure('transaction saveQueueItems', () => {
      this.ensureQueueEpisodeColumns();
      const tx = this.db!.transaction(() => {
        this.db!.prepare('DELETE FROM download_queue').run();
        if (items.length > 0) {
          const stmt = this.db!.prepare(
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

  getAllHistory(): HistoryRow[] {
    if (!this.db) return [];
    return measure('SELECT history', () => {
      const rows = this.db!.prepare('SELECT * FROM download_history ORDER BY id DESC LIMIT 500').all() as HistoryRow[];
      return rows;
    });
  }

  private sanitizeReason(reason?: string | null): string | null {
    if (!reason) return null;
    let r = reason.trim().replace(/\s+/g, ' ');
    if (r.length > 300) r = r.slice(0, 297) + '...';
    return r;
  }

  addHistoryRecord(record: HistoryWriteRecord): boolean {
    if (!this.db) return false;

    const scope = record.scope || 'episode';
    if (scope === 'queue' && record.queueId) {
      const existing = measure('SELECT history queue_id', () => {
        return this.db!.prepare(`SELECT id FROM download_history WHERE scope = 'queue' AND queue_id = ? LIMIT 1`).get(
          record.queueId,
        ) as { id?: number } | undefined;
      });
      if (existing) return false;
    }

    const sanitizedReason = this.sanitizeReason(record.reason);
    measure('transaction addHistory', () => {
      const tx = this.db!.transaction(() => {
        this.db!.prepare(
          `INSERT INTO download_history
                (date, anime, slug, episode, status, path, provider_id, scope, queue_id, reason, episode_list)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
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
        this.db!.prepare(
          `DELETE FROM download_history WHERE id < (
                SELECT id FROM download_history ORDER BY id DESC LIMIT 1 OFFSET 199
            )`,
        ).run();
      });
      tx();
    });

    return true;
  }

  clearHistory(): void {
    if (!this.db) return;
    measure('DELETE history', () => {
      this.db!.prepare('DELETE FROM download_history').run();
    });
  }

  removeHistoryEntryByRowId(rowId: number): boolean {
    if (!this.db) return false;
    return measure('DELETE history by id', () => {
      const info = this.db!.prepare('DELETE FROM download_history WHERE id = ?').run(rowId);
      return info.changes > 0;
    });
  }

  removeHistoryEntriesByRowIds(rowIds: number[]): boolean {
    if (!this.db) return false;
    if (rowIds.length === 0) return true;

    const sorted = [...new Set(rowIds)].sort((a, b) => b - a);
    measure('transaction removeHistory', () => {
      const tx = this.db!.transaction(() => {
        const stmt = this.db!.prepare('DELETE FROM download_history WHERE id = ?');
        for (const id of sorted) {
          stmt.run(id);
        }
      });
      tx();
    });
    return true;
  }

  getHistoryCount(): number {
    if (!this.db) return 0;
    return measure('SELECT history count', () => {
      const row = this.db!.prepare('SELECT COUNT(*) as c FROM download_history').get() as { c: number } | undefined;
      return row?.c ?? 0;
    });
  }

  getFolderMeta(folderPath: string): Record<string, unknown> | null {
    if (!this.db) return null;

    return measure('SELECT folder_meta', () => {
      const hash = cryptolib.createHash('sha1').update(folderPath.toLowerCase()).digest('hex');
      const row = this.db!.prepare('SELECT * FROM folder_meta WHERE folder_path_hash = ?').get(hash) as
        Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        slug: row.slug || null,
        title: row.title || undefined,
        category: row.category || undefined,
        year: row.year || undefined,
        status: row.status || undefined,
        season: row.season || undefined,
        updatedAt: row.updated_at || undefined,
        posterUrl: row.poster_url || undefined,
        bannerUrl: row.banner_url || undefined,
        providerId: row.provider_id || null,
        folderPath: row.folder_path || folderPath,
      };
    });
  }

  setFolderMeta(folderPath: string, data: Record<string, unknown>): void {
    if (!this.db) return;

    measure('INSERT folder_meta', () => {
      const hash = cryptolib.createHash('sha1').update(folderPath.toLowerCase()).digest('hex');
      this.db!.prepare(
        `INSERT OR REPLACE INTO folder_meta
               (folder_path_hash, folder_path, slug, title, category, year,
                status, season, poster_url, banner_url, provider_id, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        hash,
        folderPath,
        (data.slug as string) || null,
        (data.title as string) || null,
        (data.category as string) || null,
        (data.year as string) || null,
        (data.status as string) || null,
        (data.season as string) || null,
        (data.posterUrl as string) || null,
        (data.bannerUrl as string) || null,
        (data.providerId as string) || null,
        Date.now(),
      );
    });
  }

  deleteFolderMeta(folderPath: string): void {
    if (!this.db) return;

    measure('DELETE folder_meta', () => {
      const hash = cryptolib.createHash('sha1').update(folderPath.toLowerCase()).digest('hex');
      this.db!.prepare('DELETE FROM folder_meta WHERE folder_path_hash = ?').run(hash);
    });
  }

  getDb(): Database.Database | null {
    return this.db;
  }
}
