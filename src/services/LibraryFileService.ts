import * as crypto from 'crypto';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import type { LibraryAssetService } from './LibraryAssetService';
import { normalizeDisplayAnimeTitle } from '../utils/titleUtils';
import { isPathWithinAnyDirectory, isPathSafeForDestructiveOperation, isSafeChildName } from '../utils/pathSecurity';

export interface LibraryFolder {
  name: string;
  path: string;
  birthtime: number;
  episodeCount: number;
  posterLocal: string | null;
  bannerLocal: string | null;
  metaSlug?: string | null;
  metaTitle?: string | null;
  providerId?: string | null;
  sourceDir: string;
}

export interface LibraryAnimeDetails {
  title?: string;
  poster?: string | null;
  banner?: string | null;
}

export interface LibraryFileServiceOptions {
  assetService: LibraryAssetService;
  getAllowedBaseDirs: () => string[];
  queueOwnsFolder: (folderPath: string) => boolean;
  getAnimeDetails: (slug: string) => Promise<LibraryAnimeDetails | null>;
  getActiveProviderId: () => string;
  openPath: (targetPath: string) => Promise<string>;
  userDataDir: string;
  log: (error: unknown) => void;
}

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.flv', '.webm']);

export class LibraryFileService {
  constructor(private readonly options: LibraryFileServiceOptions) {}

  async scanDownloads(baseDirs: string | string[]): Promise<LibraryFolder[]> {
    try {
      const allowedBaseDirs = this.options.getAllowedBaseDirs();
      const dirs = (Array.isArray(baseDirs) ? baseDirs : [baseDirs]).filter((dir) =>
        isPathWithinAnyDirectory(dir, allowedBaseDirs),
      );
      const allFolders: LibraryFolder[] = [];

      for (const baseDir of dirs) {
        if (!fs.existsSync(baseDir)) continue;
        const dirents = await fs.promises.readdir(baseDir, { withFileTypes: true });
        const folderDirents = dirents.filter((dirent) => dirent.isDirectory());

        const BATCH_SIZE = 16;
        for (let batchStart = 0; batchStart < folderDirents.length; batchStart += BATCH_SIZE) {
          const chunk = folderDirents.slice(batchStart, batchStart + BATCH_SIZE);
          const chunkResults = await Promise.all(
            chunk.map(async (dirent): Promise<LibraryFolder | null> => {
              const folderPath = path.join(baseDir, dirent.name);
              let stats: fs.Stats;
              try {
                stats = await fs.promises.stat(folderPath);
              } catch (error) {
                this.options.log(`No se pudo inspeccionar la carpeta de biblioteca ${folderPath}: ${error}`);
                return null;
              }

              let episodeCount = 0;
              let entries: fs.Dirent[];
              try {
                entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
                episodeCount = entries.reduce((acc, entry) => {
                  if (!entry.isFile()) return acc;
                  return VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) ? acc + 1 : acc;
                }, 0);
              } catch (error) {
                this.options.log(`No se pudo leer la carpeta de biblioteca ${folderPath}: ${error}`);
                return null;
              }

              const normalizedFolderPath = path.resolve(folderPath).toLowerCase();
              const queueOwnsFolder = this.options.queueOwnsFolder(normalizedFolderPath);

              if (episodeCount === 0) {
                if (!queueOwnsFolder) {
                  try {
                    await fs.promises.rm(folderPath, { recursive: true, force: true });
                  } catch (error) {
                    this.options.log(`No se pudo eliminar la carpeta vacia ${folderPath}: ${error}`);
                  }
                }
                return null;
              }

              // Hot path: use async asset lookups to avoid sync Main block
              const assetServiceAny = this.options.assetService as unknown as {
                readFolderLibraryMetaAsync?: (p: string) => Promise<unknown>;
                readFolderLibraryMeta: (p: string) => unknown;
                getFolderPosterFilePathAsync?: (p: string) => Promise<string | null>;
                getFolderPosterFilePath: (p: string) => string | null;
                getFolderBannerFilePathAsync?: (p: string) => Promise<string | null>;
                getFolderBannerFilePath: (p: string) => string | null;
                getFolderPosterFileUrlAsync?: (p: string) => Promise<string | null>;
                getFolderPosterFileUrl: (p: string) => string | null;
                getFolderBannerFileUrlAsync?: (p: string) => Promise<string | null>;
                getFolderBannerFileUrl: (p: string) => string | null;
                restoreMissingAssets: (p: string, m: unknown) => Promise<void>;
                writeFolderLibraryMeta: (p: string, m: unknown) => void;
              };
              const meta: any = assetServiceAny.readFolderLibraryMetaAsync
                ? await assetServiceAny.readFolderLibraryMetaAsync(folderPath)
                : assetServiceAny.readFolderLibraryMeta(folderPath);
              if (meta) {
                if (!meta.folderPath || meta.folderPath !== folderPath) {
                  // keep sync write (rare, not hot) to preserve atomicity
                  this.options.assetService.writeFolderLibraryMeta(folderPath, meta);
                }

                // Parallel async poster/banner existence checks (max 2 concurrent per folder)
                const [hasPoster, hasBanner] = await Promise.all([
                  assetServiceAny.getFolderPosterFilePathAsync
                    ? assetServiceAny.getFolderPosterFilePathAsync(folderPath)
                    : Promise.resolve(assetServiceAny.getFolderPosterFilePath(folderPath)),
                  assetServiceAny.getFolderBannerFilePathAsync
                    ? assetServiceAny.getFolderBannerFilePathAsync(folderPath)
                    : Promise.resolve(assetServiceAny.getFolderBannerFilePath(folderPath)),
                ]);
                if ((!hasPoster && meta.posterUrl) || (!hasBanner && (meta.bannerUrl || meta.posterUrl))) {
                  void this.options.assetService.restoreMissingAssets(folderPath, meta);
                }
              }

              try {
                const cacheDir = path.join(folderPath, '.cache');
                // async existence check — void sync existsSync
                let cacheExists = false;
                try {
                  const st = await fsp.stat(cacheDir);
                  cacheExists = st.isDirectory();
                } catch {
                  cacheExists = false;
                }
                if (cacheExists && !queueOwnsFolder) {
                  await fsp.rm(cacheDir, { recursive: true, force: true });
                }
              } catch (error) {
                this.options.log(`No se pudo limpiar la cache de ${folderPath}: ${error}`);
              }

              // Fetch poster/banner URLs async to avoid sync scan
              const [posterLocalAsync, bannerLocalAsync] = await Promise.all([
                assetServiceAny.getFolderPosterFileUrlAsync
                  ? assetServiceAny.getFolderPosterFileUrlAsync(folderPath)
                  : Promise.resolve(assetServiceAny.getFolderPosterFileUrl(folderPath)),
                assetServiceAny.getFolderBannerFileUrlAsync
                  ? assetServiceAny.getFolderBannerFileUrlAsync(folderPath)
                  : Promise.resolve(assetServiceAny.getFolderBannerFileUrl(folderPath)),
              ]);

              return {
                name: dirent.name,
                path: folderPath,
                birthtime: stats.birthtimeMs,
                episodeCount,
                posterLocal: posterLocalAsync || (meta as any)?.posterUrl || null,
                bannerLocal: bannerLocalAsync || (meta as any)?.bannerUrl || null,
                metaSlug: (meta as any)?.slug || null,
                metaTitle: (meta as any)?.title || null,
                providerId: (meta as any)?.providerId || 'animeav1',
                sourceDir: baseDir,
              };
            }),
          );

          for (const result of chunkResults) {
            if (result) allFolders.push(result);
          }
        }
      }

      const seen = new Set<string>();
      const unique = allFolders.filter((folder) => {
        if (seen.has(folder.path)) return false;
        seen.add(folder.path);
        return true;
      });

      unique.sort((a, b) => b.birthtime - a.birthtime);
      return unique;
    } catch (error) {
      this.options.log(error);
      return [];
    }
  }

  renameFolder(oldPath: string, newName: string): { success: boolean; newPath?: string; error?: string } {
    try {
      const allowedBaseDirs = this.options.getAllowedBaseDirs();
      if (!isPathSafeForDestructiveOperation(oldPath, allowedBaseDirs, false)) {
        return { success: false, error: 'La carpeta está fuera de la librería configurada.' };
      }
      if (!isSafeChildName(newName)) {
        return { success: false, error: 'El nombre de carpeta no es válido.' };
      }
      if (!fs.existsSync(oldPath)) return { success: false, error: 'La carpeta original no existe.' };
      if (this.options.queueOwnsFolder(path.resolve(oldPath).toLowerCase())) {
        return { success: false, error: 'No se puede renombrar una carpeta con una descarga activa.' };
      }
      const baseDir = path.dirname(oldPath);
      const newPath = path.join(baseDir, newName);
      if (!isPathSafeForDestructiveOperation(newPath, allowedBaseDirs, false)) {
        return { success: false, error: 'La nueva ruta está fuera de la librería configurada.' };
      }
      if (fs.existsSync(newPath)) return { success: false, error: 'Ya existe una carpeta con ese nombre.' };

      const oldAssetDir = path.join(
        this.options.assetService.getLibraryAssetRootPath(),
        this.options.assetService.getFolderAssetKey(oldPath),
      );
      const newAssetDir = path.join(
        this.options.assetService.getLibraryAssetRootPath(),
        this.options.assetService.getFolderAssetKey(newPath),
      );

      fs.renameSync(oldPath, newPath);

      try {
        if (fs.existsSync(oldAssetDir) && !fs.existsSync(newAssetDir)) {
          fs.renameSync(oldAssetDir, newAssetDir);
        }
      } catch (error) {
        this.options.log(`No se pudieron mover los assets de ${oldPath} a ${newPath}: ${error}`);
      }
      this.options.assetService.renameFolderLibraryMeta(oldPath, newPath);
      return { success: true, newPath };
    } catch (error) {
      this.options.log(error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  deleteFolder(folderPath: string): boolean {
    try {
      if (!isPathSafeForDestructiveOperation(folderPath, this.options.getAllowedBaseDirs(), false)) return false;
      if (!fs.existsSync(folderPath)) return false;
      if (this.options.queueOwnsFolder(path.resolve(folderPath).toLowerCase())) return false;
      const assetDir = path.join(
        this.options.assetService.getLibraryAssetRootPath(),
        this.options.assetService.getFolderAssetKey(folderPath),
      );
      fs.rmSync(folderPath, { recursive: true, force: true });
      try {
        if (fs.existsSync(assetDir)) fs.rmSync(assetDir, { recursive: true, force: true });
      } catch (error) {
        this.options.log(`No se pudieron eliminar los assets de ${folderPath}: ${error}`);
      }
      this.options.assetService.deleteFolderLibraryMeta(folderPath);
      return true;
    } catch (error) {
      this.options.log(error);
      return false;
    }
  }

  async relinkFolder(folderPath: string, targetSlug: string): Promise<boolean> {
    try {
      if (!isPathSafeForDestructiveOperation(folderPath, this.options.getAllowedBaseDirs(), false)) return false;
      if (!fs.existsSync(folderPath)) return false;
      const details = await this.options.getAnimeDetails(targetSlug);
      if (!details) return false;

      try {
        const assetDir = this.options.assetService.getFolderAssetDir(folderPath);
        const files = ['poster.jpg', 'poster.jpeg', 'poster.png', 'banner.jpg', 'banner.jpeg', 'banner.png'];
        for (const file of files) {
          const filePath = path.join(assetDir, file);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
      } catch (error) {
        this.options.log(`Error limpiando assets anteriores en relink: ${error}`);
      }

      this.options.assetService.writeFolderLibraryMeta(folderPath, {
        slug: targetSlug,
        title: normalizeDisplayAnimeTitle(details.title || '') || targetSlug,
        posterUrl: details.poster,
        bannerUrl: details.banner,
        providerId: this.options.getActiveProviderId(),
      });

      setImmediate(async () => {
        try {
          await this.options.assetService.ensureFolderPoster(folderPath, details.poster || null);
          await this.options.assetService.ensureFolderBanner(folderPath, details.banner || details.poster || null);
        } catch (error) {
          this.options.log(`Error descargando assets en relink: ${error}`);
        }
      });

      return true;
    } catch (error) {
      this.options.log(`Relink error: ${error}`);
      return false;
    }
  }

  async playVideo(videoPath: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!isPathSafeForDestructiveOperation(videoPath, this.options.getAllowedBaseDirs(), false)) {
        return { success: false, error: 'El vídeo está fuera de la librería configurada.' };
      }
      if (!fs.existsSync(videoPath) || !fs.statSync(videoPath).isFile()) {
        return { success: false, error: 'El vídeo no existe.' };
      }
      await this.options.openPath(videoPath);
      return { success: true };
    } catch (error) {
      this.options.log(error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  deleteVideo(videoPath: string): boolean {
    try {
      if (!isPathSafeForDestructiveOperation(videoPath, this.options.getAllowedBaseDirs(), false)) return false;
      if (!fs.existsSync(videoPath)) return false;
      if (!fs.statSync(videoPath).isFile()) return false;
      fs.unlinkSync(videoPath);

      try {
        const parentDir = path.dirname(videoPath);
        if (fs.existsSync(parentDir)) {
          const remaining = fs
            .readdirSync(parentDir, { withFileTypes: true })
            .filter((entry) => entry.isFile())
            .some((entry) => VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()));

          if (!remaining) fs.rmSync(parentDir, { recursive: true, force: true });
        }
      } catch (error) {
        this.options.log(`No se pudo limpiar la carpeta contenedora de ${videoPath}: ${error}`);
      }

      const thumbDir = path.join(this.options.userDataDir, 'thumbnails_v3');
      const hash = crypto.createHash('md5').update(videoPath).digest('hex');
      const thumbPath = path.join(thumbDir, `${hash}.jpg`);
      if (fs.existsSync(thumbPath)) {
        try {
          fs.unlinkSync(thumbPath);
        } catch (error) {
          this.options.log(`No se pudo eliminar el thumbnail de ${videoPath}: ${error}`);
        }
      }

      return true;
    } catch (error) {
      this.options.log(error);
      return false;
    }
  }
}
