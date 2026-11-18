import * as crypto from 'crypto';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import type { LibraryAssetService } from './LibraryAssetService';
import { LibraryMetadataService } from './LibraryMetadataService';
import { THUMBNAIL_DIR_NAME } from './ThumbnailService';
import { withFolderLanguage } from '../../utils/downloads/folderNaming';
import type { AniListBannerInput, AniListBannerResult } from '../providers/AniListService';
import { errorDetailForLog } from '../../utils/logging/redactLog';
import {
  isPathWithinAnyDirectory,
  isPathSafeForDestructiveOperation,
  isSafeChildName,
} from '../../utils/security/pathSecurity';

export interface LibraryFolder {
  name: string;
  path: string;
  birthtime: number;
  episodeCount: number;
  posterLocal: string | null;
  bannerLocal: string | null;
  metaSlug?: string | null;
  metaTitle?: string | null;
  secondaryTitle?: string | null;
  alternativeTitles?: string[];
  year?: string | null;
  category?: string | null;
  season?: string | null;
  providerId?: string | null;
  anilistId?: number | null;
  lang?: 'SUB' | 'DUB';
  hasProviderMetadata?: boolean;
  sourceDir: string;
}

export interface LibraryAnimeDetails {
  title?: string;
  japaneseTitle?: string;
  poster?: string | null;
  banner?: string | null;
  alternativeTitles?: string[];
  malId?: number | null;
  year?: number | string | null;
  season?: string | null;
  type?: string | null;
  category?: string | null;
  status?: string | null;
}

export interface LibraryFileServiceOptions {
  assetService: LibraryAssetService;
  getAllowedBaseDirs: () => string[];
  queueOwnsFolder: (folderPath: string) => boolean;
  getAnimeDetails: (slug: string, providerId?: string | null) => Promise<LibraryAnimeDetails | null>;
  getActiveProviderId: () => string;
  // Meta AniList validada para la carpeta, o null. Sin fallback al póster.
  resolveAniListMeta?: (input: AniListBannerInput) => Promise<AniListBannerResult | null>;
  openPath: (targetPath: string) => Promise<string>;
  userDataDir: string;
  log: (error: unknown) => void;
  onFilesRenamed?: (pairs: Array<{ from: string; to: string }>) => Promise<void>;
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
        let dirents: fs.Dirent[];
        try {
          dirents = await fs.promises.readdir(baseDir, { withFileTypes: true });
        } catch (error) {
          this.options.log(`No se pudo leer una ubicación de la librería: ${errorDetailForLog(error)}`);
          continue;
        }
        const folderDirents = dirents.filter((dirent) => dirent.isDirectory());

        const BATCH_SIZE = 16;
        for (let batchStart = 0; batchStart < folderDirents.length; batchStart += BATCH_SIZE) {
          const chunk = folderDirents.slice(batchStart, batchStart + BATCH_SIZE);
          const chunkResults = await Promise.allSettled(
            chunk.map(async (dirent): Promise<LibraryFolder | null> => {
              const folderPath = path.join(baseDir, dirent.name);
              let stats: fs.Stats;
              try {
                stats = await fs.promises.stat(folderPath);
              } catch (error) {
                this.options.log(
                  `No se pudo inspeccionar la carpeta de biblioteca ${path.basename(folderPath)}: ${errorDetailForLog(error)}`,
                );
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
                this.options.log(
                  `No se pudo leer la carpeta de biblioteca ${path.basename(folderPath)}: ${errorDetailForLog(error)}`,
                );
                return null;
              }

              if (episodeCount === 0) return null;

              // Hot path: use async asset lookups to avoid sync Main block
              const assetServiceAny = this.options.assetService as unknown as {
                readFolderLibraryMetaAsync?: (p: string) => Promise<unknown>;
                readFolderLibraryMeta: (p: string) => unknown;
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
              const [posterLocalAsync, bannerLocalAsync] = await Promise.all([
                assetServiceAny.getFolderPosterFileUrlAsync
                  ? assetServiceAny.getFolderPosterFileUrlAsync(folderPath)
                  : Promise.resolve(assetServiceAny.getFolderPosterFileUrl(folderPath)),
                assetServiceAny.getFolderBannerFileUrlAsync
                  ? assetServiceAny.getFolderBannerFileUrlAsync(folderPath)
                  : Promise.resolve(assetServiceAny.getFolderBannerFileUrl(folderPath)),
              ]);
              if (meta) {
                if (!meta.folderPath || meta.folderPath !== folderPath) {
                  // keep sync write (rare, not hot) to preserve atomicity
                  this.options.assetService.writeFolderLibraryMeta(folderPath, meta);
                }

                // Sin fallback al póster: el banner solo se restaura si la
                // meta trae uno genuino de AniList (distinto del póster).
                if (
                  (!posterLocalAsync && meta.posterUrl) ||
                  (!bannerLocalAsync && meta.bannerUrl && meta.bannerUrl !== meta.posterUrl)
                ) {
                  void this.options.assetService.restoreMissingAssets(folderPath, meta);
                }
              }

              const metaAlts = Array.isArray((meta as any)?.alternativeTitles)
                ? (((meta as any).alternativeTitles as unknown[]).filter(
                    (v): v is string => typeof v === 'string' && !!v.trim(),
                  ) as string[])
                : [];
              return {
                name: dirent.name,
                path: folderPath,
                birthtime: stats.birthtimeMs,
                episodeCount,
                posterLocal: posterLocalAsync || (meta as any)?.posterUrl || null,
                // Sin fallback al póster: legacy guardaba el póster como
                // bannerUrl y no se muestra como banner.
                bannerLocal:
                  bannerLocalAsync ||
                  ((meta as any)?.bannerUrl && (meta as any)?.bannerUrl !== (meta as any)?.posterUrl
                    ? (meta as any)?.bannerUrl
                    : null),
                metaSlug: (meta as any)?.slug || null,
                metaTitle: (meta as any)?.title || null,
                secondaryTitle: typeof (meta as any)?.secondaryTitle === 'string' ? (meta as any).secondaryTitle : null,
                alternativeTitles: metaAlts,
                year: (meta as any)?.year || null,
                category: (meta as any)?.category || null,
                season: (meta as any)?.season || null,
                providerId: (meta as any)?.providerId || 'animeav1',
                anilistId: Number.isSafeInteger(meta?.anilistId) ? meta.anilistId : null,
                lang: meta?.lang === 'DUB' ? 'DUB' : 'SUB',
                hasProviderMetadata: Boolean(meta?.providerId || meta?.slug),
                sourceDir: baseDir,
              };
            }),
          );

          for (const result of chunkResults) {
            if (result.status === 'fulfilled') {
              if (result.value) allFolders.push(result.value);
            } else {
              this.options.log(
                `No se pudo inspeccionar una carpeta de la librería: ${errorDetailForLog(result.reason)}`,
              );
            }
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

  resolveRenameTarget(oldPath: string, newName: string): string {
    if (!isPathSafeForDestructiveOperation(oldPath, this.options.getAllowedBaseDirs(), false)) {
      throw new Error('La carpeta está fuera de la librería configurada.');
    }
    if (!isSafeChildName(newName)) throw new Error('El nombre de carpeta no es válido en Windows.');
    const meta = this.options.assetService.readFolderLibraryMeta(oldPath);
    return path.join(path.dirname(oldPath), withFolderLanguage(newName, meta?.lang));
  }

  async renameFolder(
    oldPath: string,
    newName: string,
  ): Promise<{
    success: boolean;
    newPath?: string;
    name?: string;
    posterLocal?: string | null;
    bannerLocal?: string | null;
    error?: string;
  }> {
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
      const newPath = this.resolveRenameTarget(oldPath, newName);
      if (!isPathSafeForDestructiveOperation(newPath, allowedBaseDirs, false)) {
        return { success: false, error: 'La nueva ruta está fuera de la librería configurada.' };
      }
      const sameFolder = path.resolve(oldPath).toLowerCase() === path.resolve(newPath).toLowerCase();
      if (fs.existsSync(newPath) && !sameFolder)
        return { success: false, error: 'Ya existe una carpeta con ese nombre.' };
      const videoNames = (await fsp.readdir(oldPath, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
        .map((entry) => entry.name);

      const oldAssetDir = path.join(
        this.options.assetService.getLibraryAssetRootPath(),
        this.options.assetService.getFolderAssetKey(oldPath),
      );
      const newAssetDir = path.join(
        this.options.assetService.getLibraryAssetRootPath(),
        this.options.assetService.getFolderAssetKey(newPath),
      );

      if (oldPath !== newPath) await fsp.rename(oldPath, newPath);

      try {
        if (fs.existsSync(oldAssetDir) && !fs.existsSync(newAssetDir)) {
          fs.renameSync(oldAssetDir, newAssetDir);
        }
      } catch (error) {
        this.options.log(
          `No se pudieron mover los assets de ${path.basename(oldPath)} a ${path.basename(newPath)}: ${errorDetailForLog(error)}`,
        );
      }
      this.options.assetService.renameFolderLibraryMeta(oldPath, newPath);
      try {
        await this.options.onFilesRenamed?.(
          videoNames.map((name) => ({ from: path.join(oldPath, name), to: path.join(newPath, name) })),
        );
      } catch (error) {
        this.options.log(
          `No se pudieron actualizar miniaturas en ${path.basename(newPath)}: ${errorDetailForLog(error)}`,
        );
      }
      return {
        success: true,
        newPath,
        name: path.basename(newPath),
        posterLocal: this.options.assetService.getFolderPosterFileUrl(newPath),
        bannerLocal: this.options.assetService.getFolderBannerFileUrl(newPath),
      };
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
      const videos = fs
        .readdirSync(folderPath, { withFileTypes: true })
        .filter((entry) => entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()));
      fs.rmSync(folderPath, { recursive: true, force: true });
      for (const video of videos) {
        const hash = crypto.createHash('md5').update(path.join(folderPath, video.name)).digest('hex');
        try {
          fs.rmSync(path.join(this.options.userDataDir, THUMBNAIL_DIR_NAME, `${hash}.jpg`), { force: true });
        } catch {}
      }
      this.forgetFolder(folderPath);
      return true;
    } catch (error) {
      this.options.log(`No se pudo eliminar la carpeta: ${errorDetailForLog(error)}`);
      return false;
    }
  }

  forgetFolder(folderPath: string): void {
    const assetDir = path.join(
      this.options.assetService.getLibraryAssetRootPath(),
      this.options.assetService.getFolderAssetKey(folderPath),
    );
    try {
      if (fs.existsSync(assetDir)) fs.rmSync(assetDir, { recursive: true, force: true });
    } catch (error) {
      this.options.log(
        `No se pudieron eliminar los assets de ${path.basename(folderPath)}: ${errorDetailForLog(error)}`,
      );
    }
    this.options.assetService.deleteFolderLibraryMeta(folderPath);
  }

  async relinkFolder(folderPath: string, targetSlug: string, providerId?: string | null): Promise<boolean> {
    try {
      const service = new LibraryMetadataService({
        assetService: this.options.assetService,
        getAllowedBaseDirs: this.options.getAllowedBaseDirs,
        getDetails: (slug, provider) => this.options.getAnimeDetails(slug, provider),
        resolveAniListMeta: (input) => this.options.resolveAniListMeta?.(input) ?? Promise.resolve(null),
        mutate: async (_paths, action) => {
          if (this.options.queueOwnsFolder(folderPath)) throw new Error('La carpeta tiene una descarga pendiente.');
          return action();
        },
      });
      const preview = await service.prepare(
        { folderPath, slug: targetSlug, providerId: providerId ?? this.options.getActiveProviderId() },
        0,
      );
      await service.apply(preview.token, 0);
      return true;
    } catch (error) {
      this.options.log(`Relink error: ${errorDetailForLog(error)}`);
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
          if (
            fs.readdirSync(parentDir).length === 0 &&
            isPathSafeForDestructiveOperation(parentDir, this.options.getAllowedBaseDirs(), false)
          ) {
            fs.rmdirSync(parentDir);
          }
        }
      } catch (error) {
        this.options.log(
          `No se pudo limpiar la carpeta contenedora de ${path.basename(videoPath)}: ${errorDetailForLog(error)}`,
        );
      }

      const thumbDir = path.join(this.options.userDataDir, THUMBNAIL_DIR_NAME);
      const hash = crypto.createHash('md5').update(videoPath).digest('hex');
      const thumbPath = path.join(thumbDir, `${hash}.jpg`);
      if (fs.existsSync(thumbPath)) {
        try {
          fs.unlinkSync(thumbPath);
        } catch (error) {
          this.options.log(
            `No se pudo eliminar el thumbnail de ${path.basename(videoPath)}: ${errorDetailForLog(error)}`,
          );
        }
      }

      return true;
    } catch (error) {
      this.options.log(`No se pudo eliminar el vídeo: ${errorDetailForLog(error)}`);
      return false;
    }
  }
}
