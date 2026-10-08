import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import Database from 'better-sqlite3';
import { AppSettings } from '../../types/settings';
import type { QueueDatabaseRow, QueueDatabaseWriteRow } from '../../types/queue';
import type { HistoryDatabaseRow, HistoryWriteRecord } from '../../types/history';
import { noopScopedLogger, type ScopedLogger } from '../logging/AppLogger';
import { safeErrorMessage } from '../../utils/logging/redactLog';
import { getWriteCount, getTotalPersistMs, resetWriteCount } from './dbMetrics';
import { checkDatabaseIntegrity, quarantineCorruptDatabase } from './integrity';
import { migrateToLatest } from './migrations';
import { QueueRows } from './QueueRows';
import { HistoryRows } from './HistoryRows';
import { SettingsRows } from './SettingsRows';
import { FolderMetaRows } from './FolderMetaRows';
import { AniLinkRows, type AniLinkRecord, type AniLinkSource } from './AniLinkRows';

export class DatabaseManager {
  private static instance: DatabaseManager;
  private static logger: ScopedLogger = noopScopedLogger;
  private static pending: Array<{ level: 'warn' | 'error'; message: string }> = [];

  static setLogger(logger: ScopedLogger): void {
    DatabaseManager.logger = logger;
    for (const entry of DatabaseManager.pending) DatabaseManager.logger[entry.level](entry.message);
    DatabaseManager.pending = [];
  }

  private dbLog(level: 'warn' | 'error', message: string): void {
    if (DatabaseManager.logger === noopScopedLogger) {
      if (DatabaseManager.pending.length < 50) DatabaseManager.pending.push({ level, message });
      return;
    }
    DatabaseManager.logger[level](message);
  }

  private scopedLog(): ScopedLogger {
    return {
      debug: () => undefined,
      info: () => undefined,
      warn: (message) => this.dbLog('warn', String(message)),
      error: (message) => this.dbLog('error', String(message)),
    };
  }

  private db: Database.Database | null = null;
  private queueRows: QueueRows | null = null;
  private historyRows: HistoryRows | null = null;
  private settingsRows: SettingsRows | null = null;
  private folderMetaRows: FolderMetaRows | null = null;
  private aniLinkRows: AniLinkRows | null = null;
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
      this.queueRows = null;
      this.historyRows = null;
      this.settingsRows = null;
      this.folderMetaRows = null;
      this.aniLinkRows = null;
      this.ready = false;
      this.initPromise = null;
    }
  }

  getDbPath(): string {
    return this.dbPath;
  }

  getWriteCount(): number {
    return getWriteCount();
  }

  getTotalPersistMs(): number {
    return getTotalPersistMs();
  }

  resetWriteCount(): void {
    resetWriteCount();
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
        const integrity = checkDatabaseIntegrity(this.dbPath);
        if (integrity.ok) {
          this.db = new Database(this.dbPath);
        } else {
          this.dbLog('error', 'DB corrupta o no SQLite, se respalda y crea nueva: ' + integrity.detail);
          quarantineCorruptDatabase(this.dbPath);
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
        this.dbLog('warn', 'No se pudo activar WAL: ' + safeErrorMessage(e));
      }

      migrateToLatest(this.db, {
        dbPath: this.dbPath,
        userDataDir: app.getPath('userData'),
        dataDir: path.join(process.cwd(), 'data'),
        log: this.scopedLog(),
      });

      this.queueRows = new QueueRows(this.db);
      this.historyRows = new HistoryRows(this.db);
      this.settingsRows = new SettingsRows(this.db);
      this.folderMetaRows = new FolderMetaRows(this.db);
      this.aniLinkRows = new AniLinkRows(this.db);
      this.historyRows.pruneHistory();
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

  getSettings(): AppSettings | null {
    return this.settingsRows?.getSettings() ?? null;
  }

  saveSettings(settings: AppSettings): void {
    this.settingsRows?.saveSettings(settings);
  }

  settingsExist(): boolean {
    return this.settingsRows?.settingsExist() ?? false;
  }

  getAllQueueItems(): QueueDatabaseRow[] {
    return this.queueRows?.getAllQueueItems() ?? [];
  }

  saveQueueItems(items: QueueDatabaseWriteRow[]): void {
    this.queueRows?.saveQueueItems(items);
  }

  getAllHistory(): HistoryDatabaseRow[] {
    return this.historyRows?.getAllHistory() ?? [];
  }

  addHistoryRecord(record: HistoryWriteRecord): boolean {
    return this.historyRows?.addHistoryRecord(record) ?? false;
  }

  clearHistory(): void {
    this.historyRows?.clearHistory();
  }

  removeHistoryEntryByRowId(rowId: number): boolean {
    return this.historyRows?.removeHistoryEntryByRowId(rowId) ?? false;
  }

  removeHistoryEntriesByRowIds(rowIds: number[]): boolean {
    return this.historyRows?.removeHistoryEntriesByRowIds(rowIds) ?? false;
  }

  getHistoryCount(): number {
    return this.historyRows?.getHistoryCount() ?? 0;
  }

  getFolderMeta(folderPath: string): Record<string, unknown> | null {
    return this.folderMetaRows?.getFolderMeta(folderPath) ?? null;
  }

  setFolderMeta(folderPath: string, data: Record<string, unknown>): void {
    this.folderMetaRows?.setFolderMeta(folderPath, data);
  }

  deleteFolderMeta(folderPath: string): void {
    this.folderMetaRows?.deleteFolderMeta(folderPath);
  }

  getAniLink(providerId: string, slug: string): AniLinkRecord | null {
    return this.aniLinkRows?.getLink(providerId, slug) ?? null;
  }

  setAniLink(providerId: string, slug: string, anilistId: number, source: AniLinkSource): void {
    this.aniLinkRows?.setLink(providerId, slug, anilistId, source);
  }

  removeAniLink(providerId: string, slug: string): void {
    this.aniLinkRows?.removeLink(providerId, slug);
  }

  getDb(): Database.Database | null {
    return this.db;
  }
}
