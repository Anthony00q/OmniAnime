import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';
import { DatabaseManager } from './DatabaseManager';

export interface StorageDiskInfo {
  path: string;
  label: string;
  free: number | null;
  total: number | null;
  available: number | null;
  error?: string;
}

export interface StorageDbInfo {
  db: number;
  wal: number;
  shm: number;
  total: number;
}

export interface StorageThumbnailsInfo {
  count: number;
  size: number;
  expiredCount: number;
}

export interface StorageCacheInfo {
  count: number;
  size: number;
  perDir: Array<{ dir: string; count: number; size: number }>;
}

export interface StorageStats {
  disks: StorageDiskInfo[];
  db: StorageDbInfo;
  thumbnails: StorageThumbnailsInfo;
  cache: StorageCacheInfo;
}

const THUMBNAIL_DIR_NAME = 'thumbnails_v3';
const THUMBNAIL_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 16;

async function statDisk(dir: string, label: string): Promise<StorageDiskInfo> {
  const info: StorageDiskInfo = { path: dir, label, free: null, total: null, available: null };
  try {
    if (!fs.existsSync(dir)) {
      info.error = 'No existe';
      return info;
    }
    // Node 19+ fsp.statfs
    const statfs = await (
      fsp as unknown as {
        statfs: (p: string) => Promise<{ bsize: number; blocks: number; bfree: number; bavail: number }>;
      }
    ).statfs(dir);
    if (statfs && typeof statfs.bsize === 'number') {
      info.total = statfs.blocks * statfs.bsize;
      info.free = statfs.bfree * statfs.bsize;
      info.available = statfs.bavail * statfs.bsize;
    } else {
      info.error = 'No disponible';
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    info.error = msg;
  }
  return info;
}

function getDirLabel(dir: string, index: number): string {
  const parts = dir.split(/[\\/]/);
  const last = parts[parts.length - 1] || parts[parts.length - 2] || `Carpeta ${index + 1}`;
  return last;
}

export class StorageService {
  constructor(
    private readonly options: {
      database: DatabaseManager;
      userDataDir: string;
      getAllowedBaseDirs: () => string[];
      queueOwnsFolder: (folderPath: string) => boolean;
      log: (error: unknown) => void;
    },
  ) {}

  async getStorageStats(): Promise<StorageStats> {
    const allowedDirs = this.options.getAllowedBaseDirs().filter(Boolean);
    const disks: StorageDiskInfo[] = [];
    for (let i = 0; i < allowedDirs.length; i++) {
      const dir = allowedDirs[i];
      const label = getDirLabel(dir, i);
      const info = await statDisk(dir, label);
      disks.push(info);
    }

    const db = this.options.database.getDbSizeBreakdown();

    const [thumbnails, cache] = await Promise.all([this.getThumbnailsInfo(), this.getCacheInfo(allowedDirs)]);

    return { disks, db, thumbnails, cache };
  }

  private async getThumbnailsInfo(): Promise<StorageThumbnailsInfo> {
    const thumbDir = path.join(this.options.userDataDir, THUMBNAIL_DIR_NAME);
    let count = 0;
    let size = 0;
    let expiredCount = 0;
    try {
      if (!fs.existsSync(thumbDir)) return { count: 0, size: 0, expiredCount: 0 };
      const files = await fsp.readdir(thumbDir);
      const jpgFiles = files.filter((f) => f.endsWith('.jpg'));
      const now = Date.now();
      for (let i = 0; i < jpgFiles.length; i += BATCH_SIZE) {
        const chunk = jpgFiles.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          chunk.map(async (file) => {
            const fp = path.join(thumbDir, file);
            try {
              const st = await fsp.stat(fp);
              const isExpired = now - st.mtimeMs > THUMBNAIL_MAX_AGE_MS;
              return { size: st.size, isExpired };
            } catch {
              return null;
            }
          }),
        );
        for (const r of results) {
          if (r) {
            count += 1;
            size += r.size;
            if (r.isExpired) expiredCount += 1;
          }
        }
      }
    } catch (e) {
      this.options.log(e);
      throw e;
    }
    return { count, size, expiredCount };
  }

  private async getCacheInfo(allowedDirs: string[]): Promise<StorageCacheInfo> {
    let totalCount = 0;
    let totalSize = 0;
    const perDir: Array<{ dir: string; count: number; size: number }> = [];

    for (const baseDir of allowedDirs) {
      let dirCount = 0;
      let dirSize = 0;
      let hadCriticalError = false;
      try {
        if (!fs.existsSync(baseDir)) {
          perDir.push({ dir: baseDir, count: 0, size: 0 });
          continue;
        }
        const dirents = await fsp.readdir(baseDir, { withFileTypes: true });
        const folders = dirents.filter((d) => d.isDirectory()).map((d) => path.join(baseDir, d.name));

        for (let i = 0; i < folders.length; i += BATCH_SIZE) {
          const chunk = folders.slice(i, i + BATCH_SIZE);
          const chunkResults = await Promise.all(
            chunk.map(async (folderPath) => {
              const cacheDir = path.join(folderPath, '.cache');
              try {
                const st = await fsp.stat(cacheDir);
                if (!st.isDirectory()) return { count: 0, size: 0 };
                const files = await fsp.readdir(cacheDir);
                let c = 0;
                let s = 0;
                for (const file of files) {
                  try {
                    const fp = path.join(cacheDir, file);
                    const fst = await fsp.stat(fp);
                    if (fst.isFile()) {
                      c += 1;
                      s += fst.size;
                    }
                  } catch {}
                }
                return { count: c, size: s };
              } catch {
                return { count: 0, size: 0 };
              }
            }),
          );
          for (const r of chunkResults) {
            dirCount += r.count;
            dirSize += r.size;
          }
        }
      } catch (e) {
        this.options.log(e);
        hadCriticalError = true;
      }
      if (hadCriticalError) throw new Error(`No se pudo leer ${baseDir}`);
      perDir.push({ dir: baseDir, count: dirCount, size: dirSize });
      totalCount += dirCount;
      totalSize += dirSize;
    }

    return { count: totalCount, size: totalSize, perDir };
  }

  async cleanCache(): Promise<{ cleaned: number; freed: number; errors: string[] }> {
    const allowedDirs = this.options.getAllowedBaseDirs().filter(Boolean);
    let cleaned = 0;
    let freed = 0;
    const errors: string[] = [];

    for (const baseDir of allowedDirs) {
      try {
        if (!fs.existsSync(baseDir)) continue;
        const dirents = await fsp.readdir(baseDir, { withFileTypes: true });
        const folders = dirents.filter((d) => d.isDirectory()).map((d) => path.join(baseDir, d.name));

        for (let i = 0; i < folders.length; i += BATCH_SIZE) {
          const chunk = folders.slice(i, i + BATCH_SIZE);
          const results = await Promise.all(
            chunk.map(async (folderPath) => {
              const normalized = path.resolve(folderPath).toLowerCase();
              if (this.options.queueOwnsFolder(normalized)) return { cleaned: 0, freed: 0 };
              const cacheDir = path.join(folderPath, '.cache');
              try {
                const st = await fsp.stat(cacheDir);
                if (!st.isDirectory()) return { cleaned: 0, freed: 0 };
                const files = await fsp.readdir(cacheDir);
                let c = 0;
                let s = 0;
                for (const file of files) {
                  try {
                    const fp = path.join(cacheDir, file);
                    const fst = await fsp.stat(fp);
                    if (fst.isFile()) {
                      s += fst.size;
                      c += 1;
                    }
                  } catch {}
                }
                await fsp.rm(cacheDir, { recursive: true, force: true });
                return { cleaned: c, freed: s };
              } catch {
                return { cleaned: 0, freed: 0 };
              }
            }),
          );
          for (const r of results) {
            cleaned += r.cleaned;
            freed += r.freed;
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(msg);
        this.options.log(e);
      }
    }

    return { cleaned, freed, errors };
  }

  async cleanThumbnails(
    mode: 'expired' | 'all' = 'expired',
  ): Promise<{ cleaned: number; freed: number; errors: string[] }> {
    const thumbDir = path.join(this.options.userDataDir, THUMBNAIL_DIR_NAME);
    let cleaned = 0;
    let freed = 0;
    const errors: string[] = [];
    try {
      if (!fs.existsSync(thumbDir)) return { cleaned: 0, freed: 0, errors: [] };
      const files = await fsp.readdir(thumbDir);
      const jpgFiles = files.filter((f) => f.endsWith('.jpg'));
      const now = Date.now();

      for (let i = 0; i < jpgFiles.length; i += BATCH_SIZE) {
        const chunk = jpgFiles.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          chunk.map(async (file) => {
            const fp = path.join(thumbDir, file);
            try {
              const st = await fsp.stat(fp);
              const isExpired = now - st.mtimeMs > THUMBNAIL_MAX_AGE_MS;
              if (mode === 'expired' && !isExpired) return { cleaned: 0, freed: 0 };
              await fsp.unlink(fp);
              return { cleaned: 1, freed: st.size };
            } catch {
              return { cleaned: 0, freed: 0 };
            }
          }),
        );
        for (const r of results) {
          cleaned += r.cleaned;
          freed += r.freed;
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(msg);
      this.options.log(e);
    }
    return { cleaned, freed, errors };
  }

  getAppPaths(): { userData: string; logs: string; toolsDir: string; dbPath: string } {
    const userData = this.options.userDataDir;
    const logs = path.join(userData, 'logs');
    const toolsDir = app.isPackaged
      ? path.join(process.resourcesPath, 'tools', 'win')
      : path.join(app.getAppPath(), 'tools', 'win');
    return {
      userData,
      logs,
      toolsDir,
      dbPath: this.options.database.getDbPath(),
    };
  }
}
