import type Database from 'better-sqlite3';
import type { ScopedLogger } from '../logging/AppLogger';
import { errorDetailForLog } from '../../utils/logging/redactLog';
import {
  SCHEMA_VERSION,
  applyAniLinkTable,
  applyBaseSchema,
  applyHistoryIndexes,
  ensureDownloadSettingsColumn,
  ensureFolderMetaColumns,
  ensureQueueEpisodeColumns,
  ensureSoundPackColumn,
  hasHistoryV2Columns,
  tableHasColumn,
} from './schema';
import { importLegacyJsonFiles, importLegacyLoggingSettings, type LegacyImportOptions } from './legacyImport';
import { measure } from './dbMetrics';

export interface MigrationStep {
  version: number;
  run: (db: Database.Database) => void;
}

export interface MigrateOptions extends LegacyImportOptions {
  dbPath: string;
}

export function getMetaVersion(db: Database.Database): number {
  try {
    const row = db.prepare('SELECT value FROM _meta WHERE key = ?').get('schema_version') as
      | { value?: string }
      | undefined;
    if (row?.value) {
      return parseInt(row.value, 10) || 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

export function setMetaVersion(db: Database.Database, version: number): void {
  measure('setMetaVersion INSERT', () => {
    db.prepare('INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)').run('schema_version', String(version));
  });
}

// Si la migración sale mal, la DB queda recuperable desde este .bak.
export function createPreUpgradeBackup(
  db: Database.Database,
  dbPath: string,
  targetVersion: number,
  log: ScopedLogger,
): string | null {
  const backupPath = `${dbPath}.pre-v${targetVersion}-${Date.now()}.bak`;
  try {
    db.prepare('VACUUM INTO ?').run(backupPath);
    return backupPath;
  } catch (e) {
    log.error('No se pudo crear respaldo antes de migrar SQLite: ' + errorDetailForLog(e));
    return null;
  }
}

// Cada paso corre en su propia transacción: o aplica entero o no deja rastro.
export function runMigrationSteps(db: Database.Database, steps: MigrationStep[], from: number, to: number): number[] {
  const applied: number[] = [];
  for (const step of steps) {
    if (step.version <= from || step.version > to) continue;
    measure('migration transaction', () => {
      db.transaction(() => step.run(db))();
    });
    applied.push(step.version);
  }
  return applied;
}

function migrateHistoryToV2(db: Database.Database): void {
  if (hasHistoryV2Columns(db)) return;

  if (tableHasColumn(db, 'download_history', 'scope')) {
    if (!tableHasColumn(db, 'download_history', 'queue_id')) {
      db.exec('ALTER TABLE download_history ADD COLUMN queue_id TEXT');
    }
    if (!tableHasColumn(db, 'download_history', 'reason')) {
      db.exec('ALTER TABLE download_history ADD COLUMN reason TEXT');
    }
    if (!tableHasColumn(db, 'download_history', 'episode_list')) {
      db.exec(`ALTER TABLE download_history ADD COLUMN episode_list TEXT NOT NULL DEFAULT '[]'`);
    }
    return;
  }

  db.exec('DROP TABLE IF EXISTS download_history_v2');
  db.exec(`
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
  db.exec(`
        INSERT INTO download_history_v2
            (id, date, anime, slug, episode, status, path, provider_id,
             scope, queue_id, reason, episode_list)
        SELECT id, date, anime, slug, episode, status, path, provider_id,
               'episode', NULL, NULL, '[]'
        FROM download_history
    `);
  db.exec('DROP TABLE download_history');
  db.exec('ALTER TABLE download_history_v2 RENAME TO download_history');
}

function ensureCompatColumns(db: Database.Database): void {
  ensureDownloadSettingsColumn(db);
  ensureSoundPackColumn(db);
  ensureQueueEpisodeColumns(db);
  ensureFolderMetaColumns(db);
}

export const MIGRATIONS: MigrationStep[] = [
  {
    version: 4,
    run: (db) => {
      ensureCompatColumns(db);
      migrateHistoryToV2(db);
    },
  },
  {
    version: 5,
    run: ensureCompatColumns,
  },
  {
    version: 6,
    run: (db) => {
      applyAniLinkTable(db);
    },
  },
  {
    version: 7,
    run: (db) => {
      if (!tableHasColumn(db, 'download_history', 'lang')) {
        db.exec("ALTER TABLE download_history ADD COLUMN lang TEXT NOT NULL DEFAULT 'SUB'");
      }
      if (!tableHasColumn(db, 'folder_meta', 'lang')) {
        db.exec("ALTER TABLE folder_meta ADD COLUMN lang TEXT NOT NULL DEFAULT 'SUB'");
      }
    },
  },
  {
    version: 8,
    run: (db) => {
      if (!tableHasColumn(db, 'settings', 'logging_settings')) {
        db.exec("ALTER TABLE settings ADD COLUMN logging_settings TEXT NOT NULL DEFAULT '{}'");
      }
    },
  },
];

export function migrateToLatest(db: Database.Database, options: MigrateOptions): void {
  const from = getMetaVersion(db);
  const freshInstall = !db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' LIMIT 1")
    .get();
  if (from < SCHEMA_VERSION && !freshInstall) {
    const backup = createPreUpgradeBackup(db, options.dbPath, SCHEMA_VERSION, options.log);
    if (!backup) throw new Error('No se puede actualizar la base de datos sin un respaldo previo');
  }

  applyBaseSchema(db);
  if (from < SCHEMA_VERSION) {
    runMigrationSteps(db, MIGRATIONS, from, SCHEMA_VERSION);

    if (freshInstall) importLegacyJsonFiles(db, options);
    else if (from < 8) importLegacyLoggingSettings(db, options);
    setMetaVersion(db, SCHEMA_VERSION);
  }

  applyHistoryIndexes(db);
}
