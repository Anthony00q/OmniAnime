import { execFile } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { safeWriteFileSync } from '../utils/fsUtils';
import type { FolderLibraryMeta } from '../types/library';
import { assertAllowedImageRedirect, isAllowedImageUrl } from '../utils/networkSecurity';
import { isPathWithinAnyDirectory } from '../utils/pathSecurity';

export interface LibraryMetadataStore {
  isReady(): boolean;
  getFolderMeta(folderPath: string): Record<string, unknown> | null;
  setFolderMeta(folderPath: string, data: Record<string, unknown>): void;
  deleteFolderMeta?(folderPath: string): void;
}

export interface AssetHttpClient {
  get(
    url: string,
    config: {
      responseType: 'arraybuffer';
      timeout: number;
      maxRedirects: number;
      maxContentLength: number;
      maxBodyLength: number;
      beforeRedirect: (options: { protocol?: string; hostname?: string; path?: string }) => void;
      headers: Record<string, string>;
    },
  ): Promise<{ data: unknown; headers: Record<string, unknown> }>;
}

export interface LibraryAssetServiceOptions {
  database: LibraryMetadataStore;
  userDataDir: string;
  httpClient: AssetHttpClient;
  userAgent: string;
  log: (error: unknown) => void;
  hideFile?: (filePath: string) => void;
  getAllowedBaseDirs?: () => string[];
}

export class LibraryAssetService {
  private readonly assetRootPath: string;
  private readonly inFlightDownloads = new Set<string>();
  private readonly hideFile: (filePath: string) => void;

  constructor(private readonly options: LibraryAssetServiceOptions) {
    this.assetRootPath = path.join(options.userDataDir, 'library_assets_v1');
    this.hideFile =
      options.hideFile ||
      ((filePath) => {
        try {
          execFile('attrib', ['+h', filePath], { windowsHide: true }, () => {});
        } catch {}
      });
  }

  getLibraryAssetRootPath(): string {
    try {
      if (!fs.existsSync(this.assetRootPath)) fs.mkdirSync(this.assetRootPath, { recursive: true });
    } catch {}
    return this.assetRootPath;
  }

  getFolderAssetKey(folderPath: string): string {
    const normalized = path.resolve(String(folderPath || '')).toLowerCase();
    return crypto.createHash('sha1').update(normalized).digest('hex');
  }

  getFolderAssetDir(folderPath: string): string {
    const dir = path.join(this.getLibraryAssetRootPath(), this.getFolderAssetKey(folderPath));
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    } catch {}
    return dir;
  }

  getLegacyFolderPosterFilePath(folderPath: string): string | null {
    return this.findExistingAsset(folderPath, [
      '.poster.jpg',
      '.poster.jpeg',
      '.poster.png',
      'poster.jpg',
      'poster.jpeg',
      'poster.png',
      'folder.jpg',
      'folder.jpeg',
      'folder.png',
      'cover.jpg',
      'cover.jpeg',
      'cover.png',
    ]);
  }

  getLegacyFolderBannerFilePath(folderPath: string): string | null {
    return this.findExistingAsset(folderPath, [
      '.banner.jpg',
      '.banner.jpeg',
      '.banner.png',
      'banner.jpg',
      'banner.jpeg',
      'banner.png',
      'fanart.jpg',
      'fanart.png',
    ]);
  }

  getFolderPosterFilePath(folderPath: string): string | null {
    return this.getLegacyFolderPosterFilePath(folderPath);
  }

  getFolderPosterFileUrl(folderPath: string): string | null {
    return this.toFileUrl(this.getFolderPosterFilePath(folderPath));
  }

  getFolderBannerFilePath(folderPath: string): string | null {
    return this.getLegacyFolderBannerFilePath(folderPath);
  }

  getFolderBannerFileUrl(folderPath: string): string | null {
    return this.toFileUrl(this.getFolderBannerFilePath(folderPath));
  }

  // ─── Async variants for hot scan path (avoid sync Main block) ─

  async getLegacyFolderPosterFilePathAsync(folderPath: string): Promise<string | null> {
    return this.findExistingAssetAsync(folderPath, [
      '.poster.jpg',
      '.poster.jpeg',
      '.poster.png',
      'poster.jpg',
      'poster.jpeg',
      'poster.png',
      'folder.jpg',
      'folder.jpeg',
      'folder.png',
      'cover.jpg',
      'cover.jpeg',
      'cover.png',
    ]);
  }

  async getLegacyFolderBannerFilePathAsync(folderPath: string): Promise<string | null> {
    return this.findExistingAssetAsync(folderPath, [
      '.banner.jpg',
      '.banner.jpeg',
      '.banner.png',
      'banner.jpg',
      'banner.jpeg',
      'banner.png',
      'fanart.jpg',
      'fanart.png',
    ]);
  }

  async getFolderPosterFilePathAsync(folderPath: string): Promise<string | null> {
    return this.getLegacyFolderPosterFilePathAsync(folderPath);
  }

  async getFolderPosterFileUrlAsync(folderPath: string): Promise<string | null> {
    const p = await this.getFolderPosterFilePathAsync(folderPath);
    return this.toFileUrl(p);
  }

  async getFolderBannerFilePathAsync(folderPath: string): Promise<string | null> {
    return this.getLegacyFolderBannerFilePathAsync(folderPath);
  }

  async getFolderBannerFileUrlAsync(folderPath: string): Promise<string | null> {
    const p = await this.getFolderBannerFilePathAsync(folderPath);
    return this.toFileUrl(p);
  }

  async readFolderLibraryMetaAsync(folderPath: string): Promise<FolderLibraryMeta | null> {
    try {
      if (this.options.database.isReady()) {
        const dbMeta = this.options.database.getFolderMeta(folderPath);
        if (dbMeta) return dbMeta as FolderLibraryMeta;
      }

      const newRootPath = path.join(folderPath, '.omnianime');
      try {
        const raw = await fsp.readFile(newRootPath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed as FolderLibraryMeta;
      } catch {
        // file missing or unreadable — fall through to asset meta
      }

      try {
        const assetDir = this.getFolderAssetDir(folderPath);
        const assetMetaPath = path.join(assetDir, 'library-meta.json');
        const raw2 = await fsp.readFile(assetMetaPath, 'utf-8');
        const parsed2 = JSON.parse(raw2);
        if (parsed2 && typeof parsed2 === 'object') return parsed2 as FolderLibraryMeta;
      } catch {
        // missing
      }

      return null;
    } catch {
      return null;
    }
  }

  readFolderLibraryMeta(folderPath: string): FolderLibraryMeta | null {
    try {
      if (this.options.database.isReady()) {
        const dbMeta = this.options.database.getFolderMeta(folderPath);
        if (dbMeta) return dbMeta as FolderLibraryMeta;
      }

      const newRootPath = path.join(folderPath, '.omnianime');
      if (fs.existsSync(newRootPath)) {
        const parsed = JSON.parse(fs.readFileSync(newRootPath, 'utf-8'));
        if (parsed && typeof parsed === 'object') return parsed as FolderLibraryMeta;
      }

      const assetMetaPath = path.join(this.getFolderAssetDir(folderPath), 'library-meta.json');
      if (fs.existsSync(assetMetaPath)) {
        const parsed = JSON.parse(fs.readFileSync(assetMetaPath, 'utf-8'));
        if (parsed && typeof parsed === 'object') return parsed as FolderLibraryMeta;
      }

      return null;
    } catch {
      return null;
    }
  }

  writeFolderLibraryMeta(folderPath: string, data: FolderLibraryMeta): void {
    try {
      if (this.options.database.isReady()) {
        this.options.database.setFolderMeta(folderPath, data as Record<string, unknown>);
      }

      const minimalMarker = JSON.stringify({
        slug: data.slug || null,
        title: data.title || '',
        providerId: data.providerId || null,
        updatedAt: Date.now(),
      });

      const rootPath = path.join(folderPath, '.omnianime');
      try {
        safeWriteFileSync(rootPath, minimalMarker);
        this.hideFile(rootPath);
      } catch {
        /* hidden attribute is optional */
      }

      const assetMetaPath = path.join(this.getFolderAssetDir(folderPath), 'library-meta.json');
      safeWriteFileSync(assetMetaPath, JSON.stringify({ ...data, folderPath, updatedAt: Date.now() }, null, 2));
    } catch (error) {
      this.options.log(`Error guardando metadata de biblioteca en ${folderPath}: ${error}`);
    }
  }

  renameFolderLibraryMeta(oldPath: string, newPath: string): void {
    try {
      if (!this.options.database.isReady()) return;
      const meta = this.options.database.getFolderMeta(oldPath);
      if (!meta) return;

      this.options.database.setFolderMeta(newPath, { ...meta, folderPath: newPath });
      this.options.database.deleteFolderMeta?.(oldPath);
    } catch (error) {
      this.options.log(`No se pudo actualizar metadata de ${newPath}: ${error}`);
    }
  }

  deleteFolderLibraryMeta(folderPath: string): void {
    try {
      if (this.options.database.isReady()) {
        this.options.database.deleteFolderMeta?.(folderPath);
      }
    } catch (error) {
      this.options.log(`No se pudo eliminar metadata de ${folderPath}: ${error}`);
    }
  }

  private isFolderPathAllowed(folderPath: string): boolean {
    const raw = String(folderPath || '').trim();
    if (!raw) return false;
    if (!path.isAbsolute(raw)) return false;
    if (this.options.getAllowedBaseDirs) {
      try {
        const allowed = this.options.getAllowedBaseDirs();
        if (!isPathWithinAnyDirectory(raw, allowed, false)) return false;
      } catch {
        return false;
      }
    }
    return true;
  }

  async ensureFolderPoster(folderPath: string, posterUrl: string | null | undefined): Promise<string | null> {
    if (!this.isFolderPathAllowed(folderPath)) return null;
    const existing = await this.getFolderPosterFileUrlAsync(folderPath);
    if (existing) return existing;

    const raw = String(posterUrl || '').trim();
    if (!raw || !isAllowedImageUrl(raw)) return null;

    try {
      const response = await this.options.httpClient.get(raw, this.imageRequestConfig());
      const contentType = String(response.headers['content-type'] || '').toLowerCase();
      const ext = contentType.includes('png') ? '.png' : '.jpg';
      const posterPath = path.join(folderPath, `.poster${ext}`);

      await fsp.writeFile(posterPath, Buffer.from(response.data as ArrayBuffer));
      try {
        this.hideFile(posterPath);
      } catch {
        /* hidden attribute is optional */
      }
      return this.toFileUrl(posterPath);
    } catch {
      return null;
    }
  }

  async ensureFolderBanner(folderPath: string, bannerUrl: string | null | undefined): Promise<string | null> {
    if (!this.isFolderPathAllowed(folderPath)) return null;
    const existing = await this.getFolderBannerFileUrlAsync(folderPath);
    if (existing) return existing;

    const raw = String(bannerUrl || '').trim();
    if (!raw || !isAllowedImageUrl(raw)) return null;

    try {
      const response = await this.options.httpClient.get(raw, this.imageRequestConfig());
      const contentType = String(response.headers['content-type'] || '').toLowerCase();
      const ext = contentType.includes('png') ? '.png' : '.jpg';
      const bannerPath = path.join(folderPath, `.banner${ext}`);

      await fsp.writeFile(bannerPath, Buffer.from(response.data as ArrayBuffer));
      try {
        this.hideFile(bannerPath);
      } catch {
        /* hidden attribute is optional */
      }
      return this.toFileUrl(bannerPath);
    } catch {
      return null;
    }
  }

  async restoreMissingAssets(folderPath: string, meta: FolderLibraryMeta): Promise<void> {
    const key = this.getFolderAssetKey(folderPath);
    if (this.inFlightDownloads.has(key)) return;
    this.inFlightDownloads.add(key);

    try {
      const hasPoster = this.getFolderPosterFilePath(folderPath);
      const hasBanner = this.getFolderBannerFilePath(folderPath);
      if (!hasPoster && meta.posterUrl) {
        await this.ensureFolderPoster(folderPath, meta.posterUrl);
      }
      if (!hasBanner && (meta.bannerUrl || meta.posterUrl)) {
        await this.ensureFolderBanner(folderPath, meta.bannerUrl || meta.posterUrl);
      }
    } catch (error) {
      this.options.log(`No se pudieron restaurar assets de ${folderPath}: ${error}`);
    } finally {
      this.inFlightDownloads.delete(key);
    }
  }

  private findExistingAsset(folderPath: string, candidates: string[]): string | null {
    try {
      for (const file of candidates) {
        const filePath = path.join(folderPath, file);
        if (fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
          return filePath;
        }
      }
    } catch {}
    return null;
  }

  private async findExistingAssetAsync(folderPath: string, candidates: string[]): Promise<string | null> {
    for (const file of candidates) {
      const filePath = path.join(folderPath, file);
      try {
        const stat = await fsp.stat(filePath);
        if (stat.isFile() && stat.size > 0) return filePath;
      } catch {
        // missing — continue
      }
    }
    return null;
  }

  private toFileUrl(filePath: string | null): string | null {
    if (!filePath) return null;
    try {
      // Prefer omni-media:// (webSecurity:true compatible) for renderer <img>
      // Encode per segment to preserve '/' but escape '#', '?', etc. that would fragment the URL.
      const normalized = path.resolve(filePath);
      const withForwardSlashes = normalized.replace(/\\/g, '/');
      const rawPath = withForwardSlashes.startsWith('/') ? withForwardSlashes : `/${withForwardSlashes}`;
      const encodedPath = rawPath
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/');
      // encodeURIComponent encodes ':' on drive letter (C: -> C%3A) — restore colon for Windows drive
      const urlPath = encodedPath.replace(/^\/([A-Za-z])%3A\//, '/$1:/');
      return `omni-media://${urlPath}`;
    } catch {
      try {
        return pathToFileURL(filePath).href;
      } catch {
        return null;
      }
    }
  }

  /** Exposed for protocol handler and tests: converts omni-media:// or file:// URL to local file path */
  static urlToFilePath(url: string): string | null {
    try {
      if (url.startsWith('omni-media://')) {
        // Manual slice handles both new (%23) and legacy (bare '#') URLs.
        // Supports both triple-slash (omni-media:///C:/path) and legacy double-slash (omni-media://c/path) with/without colon.
        const encoded = url.slice('omni-media://'.length);
        // For new URLs, '#' is encoded as %23, so split won't affect. For legacy bare '#', strip fragment.
        const hasEncodedHash = encoded.includes('%23');
        const effective = hasEncodedHash ? encoded : encoded.split('#')[0].split('?')[0];
        let decoded: string;
        try {
          decoded = decodeURIComponent(effective);
        } catch {
          decoded = effective;
        }
        if (decoded.startsWith('/')) decoded = decoded.slice(1);
        // Handle legacy host-as-drive: "d/Anime/..." -> "D:/Anime/..." (missing colon)
        if (/^[a-zA-Z]\//.test(decoded)) {
          decoded = decoded[0] + ':/' + decoded.slice(2);
        }
        // Normalize drive letter case and separators
        return decoded.replace(/\//g, path.sep);
      }
      if (url.startsWith('file://')) {
        const u = new URL(url);
        let p = decodeURIComponent(u.pathname);
        // Windows file URL: /C:/path -> C:/path
        if (/^\/[A-Za-z]:\//.test(p)) p = p.slice(1);
        return p.replace(/\//g, path.sep);
      }
    } catch {}
    return null;
  }

  private imageRequestConfig() {
    return {
      responseType: 'arraybuffer' as const,
      timeout: 15000,
      maxRedirects: 5,
      maxContentLength: 5 * 1024 * 1024,
      maxBodyLength: 5 * 1024 * 1024,
      beforeRedirect: assertAllowedImageRedirect,
      headers: {
        'User-Agent': this.options.userAgent,
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    };
  }
}
