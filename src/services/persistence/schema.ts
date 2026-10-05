import type Database from 'better-sqlite3';

export const SCHEMA_VERSION = 5;

export function applyBaseSchema(db: Database.Database): void {
  db.exec(`
        CREATE TABLE IF NOT EXISTS _meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    `);

  db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            default_output_dir TEXT NOT NULL,
            output_dirs TEXT NOT NULL,
            notify_on_complete INTEGER NOT NULL DEFAULT 1,
            minimize_to_tray_on_close INTEGER NOT NULL DEFAULT 0,
            naming_style TEXT NOT NULL DEFAULT 'descriptive',
            theme TEXT NOT NULL DEFAULT 'dark',
            accent_color TEXT NOT NULL DEFAULT 'hsl(35 78% 57%)',
            toast_position TEXT NOT NULL DEFAULT 'top-center',
            notifications_sound INTEGER NOT NULL DEFAULT 1,
            sound_volume REAL NOT NULL DEFAULT 0.5,
            sound_pack TEXT NOT NULL DEFAULT 'sala',
            sound_custom TEXT NOT NULL DEFAULT '{}',
            custom_sound_files TEXT NOT NULL DEFAULT '[]',
            sound_enabled TEXT NOT NULL DEFAULT '{}',
            sound_profiles TEXT NOT NULL DEFAULT '{}',
            notification_settings TEXT NOT NULL DEFAULT '{}',
            shortcuts TEXT NOT NULL DEFAULT '{}',
            default_provider TEXT NOT NULL DEFAULT 'animeav1',
            hardware_acceleration INTEGER NOT NULL DEFAULT 1,
            download_settings TEXT NOT NULL DEFAULT '{}'
        )
    `);

  db.exec(`
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

  db.exec(`
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

  db.exec(`
        CREATE TABLE IF NOT EXISTS folder_meta (
            folder_path_hash TEXT PRIMARY KEY,
            folder_path TEXT NOT NULL,
            slug TEXT,
            title TEXT,
            secondary_title TEXT,
            alternative_titles TEXT NOT NULL DEFAULT '[]',
            category TEXT,
            year TEXT,
            status TEXT,
            season TEXT,
            poster_url TEXT,
            banner_url TEXT,
            provider_id TEXT,
            anilist_id INTEGER,
            updated_at INTEGER NOT NULL
        )
    `);
}

// Se aplican tras las migraciones: un esquema antiguo aún no tiene scope/queue_id.
export function applyHistoryIndexes(db: Database.Database): void {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_history_slug ON download_history(slug)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_history_queue_id ON download_history(queue_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_history_scope_queue_id ON download_history(scope, queue_id)`);
}

export function tableHasColumn(db: Database.Database, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>;
  return rows.some((r) => r.name === column);
}

export function hasHistoryV2Columns(db: Database.Database): boolean {
  return ['scope', 'queue_id', 'reason', 'episode_list'].every((column) =>
    tableHasColumn(db, 'download_history', column),
  );
}

export function ensureDownloadSettingsColumn(db: Database.Database): void {
  try {
    if (!tableHasColumn(db, 'settings', 'download_settings')) {
      db.exec(`ALTER TABLE settings ADD COLUMN download_settings TEXT NOT NULL DEFAULT '{}'`);
    }
  } catch {}
}

export function ensureSoundPackColumn(db: Database.Database): void {
  try {
    if (!tableHasColumn(db, 'settings', 'sound_pack')) {
      db.exec(`ALTER TABLE settings ADD COLUMN sound_pack TEXT NOT NULL DEFAULT 'sala'`);
    }
  } catch {}
  try {
    if (!tableHasColumn(db, 'settings', 'sound_custom')) {
      db.exec(`ALTER TABLE settings ADD COLUMN sound_custom TEXT NOT NULL DEFAULT '{}'`);
    }
  } catch {}
  try {
    if (!tableHasColumn(db, 'settings', 'custom_sound_files')) {
      db.exec(`ALTER TABLE settings ADD COLUMN custom_sound_files TEXT NOT NULL DEFAULT '[]'`);
    }
  } catch {}
}

export function ensureQueueEpisodeColumns(db: Database.Database): void {
  try {
    if (!tableHasColumn(db, 'download_queue', 'paused_eps')) {
      db.exec(`ALTER TABLE download_queue ADD COLUMN paused_eps TEXT NOT NULL DEFAULT '[]'`);
    }
  } catch {}
  try {
    if (!tableHasColumn(db, 'download_queue', 'cancelled_eps')) {
      db.exec(`ALTER TABLE download_queue ADD COLUMN cancelled_eps TEXT NOT NULL DEFAULT '[]'`);
    }
  } catch {}
}

export function ensureFolderMetaColumns(db: Database.Database): void {
  try {
    if (!tableHasColumn(db, 'folder_meta', 'alternative_titles')) {
      db.exec(`ALTER TABLE folder_meta ADD COLUMN alternative_titles TEXT NOT NULL DEFAULT '[]'`);
    }
  } catch {}
  try {
    if (!tableHasColumn(db, 'folder_meta', 'secondary_title')) {
      db.exec(`ALTER TABLE folder_meta ADD COLUMN secondary_title TEXT`);
    }
  } catch {}
  try {
    if (!tableHasColumn(db, 'folder_meta', 'anilist_id')) {
      db.exec(`ALTER TABLE folder_meta ADD COLUMN anilist_id INTEGER`);
    }
  } catch {}
}
