import { execFile } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { safeWriteFileSync } from '../../utils/fsUtils';
import { normalizeFolderAlternativeTitles } from '../../utils/titleUtils';
import { errorDetailForLog } from '../../utils/logging/redactLog';
import type { FolderLibraryMeta } from '../../types/library';
import { assertAllowedImageRedirect, isAllowedImageUrl } from '../../utils/security/networkSecurity';
import { isPathWithinAnyDirectory } from '../../utils/security/pathSecurity';

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

interface ManagedArtwork {
  identity: string;
  poster: { file: string; source: string } | null;
  banner: { file: string; source: string } | null;
}

export class LibraryAssetService {
  private readonly assetRootPath: string;
  private readonly inFlightDownloads = new Set<string>();
  private readonly artworkUpdates = new Map<string, Promise<string[]>>();
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
    const managed = this.managedArtworkPath(folderPath, 'poster');
    if (managed !== undefined) return managed;
    return this.getLegacyFolderPosterFilePath(folderPath);
  }

  getFolderPosterFileUrl(folderPath: string): string | null {
    return this.toFileUrl(this.getFolderPosterFilePath(folderPath));
  }

  getFolderBannerFilePath(folderPath: string): string | null {
    const managed = this.managedArtworkPath(folderPath, 'banner');
    if (managed !== undefined) return managed;
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
    const managed = await this.managedArtworkPathAsync(folderPath, 'poster');
    if (managed !== undefined) return managed;
    return this.getLegacyFolderPosterFilePathAsync(folderPath);
  }

  async getFolderPosterFileUrlAsync(folderPath: string): Promise<string | null> {
    const p = await this.getFolderPosterFilePathAsync(folderPath);
    return this.toFileUrl(p);
  }

  async getFolderBannerFilePathAsync(folderPath: string): Promise<string | null> {
    const managed = await this.managedArtworkPathAsync(folderPath, 'banner');
    if (managed !== undefined) return managed;
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
        if (parsed && typeof parsed === 'object') {
          try {
            const full = JSON.parse(
              await fsp.readFile(
                path.join(this.assetRootPath, this.getFolderAssetKey(folderPath), 'library-meta.json'),
                'utf8',
              ),
            ) as FolderLibraryMeta;
            if (full.slug === parsed.slug && full.providerId === parsed.providerId) return { ...full, ...parsed };
          } catch {}
          return parsed as FolderLibraryMeta;
        }
      } catch {
        // file missing or unreadable — fall through to asset meta
      }

      try {
        const assetDir = path.join(this.assetRootPath, this.getFolderAssetKey(folderPath));
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
        if (parsed && typeof parsed === 'object') {
          try {
            const full = JSON.parse(
              fs.readFileSync(
                path.join(this.assetRootPath, this.getFolderAssetKey(folderPath), 'library-meta.json'),
                'utf8',
              ),
            ) as FolderLibraryMeta;
            if (full.slug === parsed.slug && full.providerId === parsed.providerId) return { ...full, ...parsed };
          } catch {}
          return parsed as FolderLibraryMeta;
        }
      }

      const assetMetaPath = path.join(this.assetRootPath, this.getFolderAssetKey(folderPath), 'library-meta.json');
      if (fs.existsSync(assetMetaPath)) {
        const parsed = JSON.parse(fs.readFileSync(assetMetaPath, 'utf-8'));
        if (parsed && typeof parsed === 'object') return parsed as FolderLibraryMeta;
      }

      return null;
    } catch {
      return null;
    }
  }

  writeFolderLibraryMeta(folderPath: string, data: FolderLibraryMeta, options?: { strict?: boolean }): void {
    try {
      const secondary = String(data.secondaryTitle || '').trim();
      const normalized: FolderLibraryMeta = {
        ...data,
        lang: (data.lang ?? this.readFolderLibraryMeta(folderPath)?.lang) === 'DUB' ? 'DUB' : 'SUB',
        secondaryTitle: secondary,
        alternativeTitles: normalizeFolderAlternativeTitles(data.alternativeTitles, data.title),
      };
      if (this.options.database.isReady()) {
        this.options.database.setFolderMeta(folderPath, normalized as Record<string, unknown>);
      }

      const minimalMarker = JSON.stringify(
        {
          slug: normalized.slug || null,
          title: normalized.title || '',
          secondaryTitle: normalized.secondaryTitle,
          alternativeTitles: normalized.alternativeTitles,
          providerId: normalized.providerId || null,
          lang: normalized.lang,
          anilistId: Number.isInteger(normalized.anilistId) ? normalized.anilistId : null,
          updatedAt: Date.now(),
        },
        null,
        2,
      );

      const rootPath = path.join(folderPath, '.omnianime');
      try {
        safeWriteFileSync(rootPath, minimalMarker);
        this.hideFile(rootPath);
      } catch {
        if (options?.strict) throw new Error('No se pudo guardar el marcador de la carpeta.');
        /* hidden attribute is optional */
      }

      const assetMetaPath = path.join(this.getFolderAssetDir(folderPath), 'library-meta.json');
      safeWriteFileSync(assetMetaPath, JSON.stringify({ ...normalized, folderPath, updatedAt: Date.now() }, null, 2));
    } catch (error) {
      this.options.log(
        `Error guardando metadata de biblioteca en ${path.basename(folderPath)}: ${errorDetailForLog(error)}`,
      );
      if (options?.strict) throw new Error('No se pudo confirmar el guardado de los metadatos. Revisa la carpeta.');
    }
  }

  renameFolderLibraryMeta(oldPath: string, newPath: string): void {
    try {
      if (!this.options.database.isReady()) return;
      const meta = this.options.database.getFolderMeta(oldPath);
      if (!meta) return;

      this.options.database.setFolderMeta(newPath, { ...meta, folderPath: newPath });
      if (oldPath.toLowerCase() !== newPath.toLowerCase()) this.options.database.deleteFolderMeta?.(oldPath);
    } catch (error) {
      this.options.log(`No se pudo actualizar metadata de ${path.basename(newPath)}: ${errorDetailForLog(error)}`);
    }
  }

  deleteFolderLibraryMeta(folderPath: string): void {
    try {
      if (this.options.database.isReady()) {
        this.options.database.deleteFolderMeta?.(folderPath);
      }
    } catch (error) {
      this.options.log(`No se pudo eliminar metadata de ${path.basename(folderPath)}: ${errorDetailForLog(error)}`);
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

  private artworkIdentity(meta: FolderLibraryMeta | null): string {
    return JSON.stringify([meta?.providerId ?? '', meta?.slug ?? '', meta?.anilistId ?? null]);
  }

  private artworkManifest(folderPath: string): string {
    return path.join(this.assetRootPath, this.getFolderAssetKey(folderPath), 'artwork.json');
  }

  private imageExtension(bytes: Buffer): 'jpg' | 'png' | 'webp' | null {
    if (bytes.length > 5 * 1024 * 1024) return null;
    if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
    if (bytes.length > 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
    if (bytes.length > 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
      return 'webp';
    return null;
  }

  private managedEntryPath(
    folderPath: string,
    raw: unknown,
    kind: 'poster' | 'banner',
    meta: FolderLibraryMeta | null,
  ): string | null {
    if (!raw || typeof raw !== 'object') return null;
    const manifest = raw as ManagedArtwork;
    if (manifest.identity !== this.artworkIdentity(meta)) return null;
    const entry = manifest[kind];
    const source = kind === 'poster' ? meta?.posterUrl : meta?.bannerUrl;
    if (!entry || entry.source !== source || !/^(poster|banner)-[a-f0-9-]+\.(jpg|png|webp)$/.test(entry.file))
      return null;
    return path.join(this.assetRootPath, this.getFolderAssetKey(folderPath), entry.file);
  }

  private managedArtworkPath(folderPath: string, kind: 'poster' | 'banner'): string | null | undefined {
    const manifestPath = this.artworkManifest(folderPath);
    if (!fs.existsSync(manifestPath)) return undefined;
    try {
      const file = this.managedEntryPath(
        folderPath,
        JSON.parse(fs.readFileSync(manifestPath, 'utf8')),
        kind,
        this.readFolderLibraryMeta(folderPath),
      );
      return file && fs.statSync(file).isFile() ? file : null;
    } catch {
      return null;
    }
  }

  private async managedArtworkPathAsync(
    folderPath: string,
    kind: 'poster' | 'banner',
  ): Promise<string | null | undefined> {
    let text: string;
    try {
      text = await fsp.readFile(this.artworkManifest(folderPath), 'utf8');
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ENOENT' ? undefined : null;
    }
    try {
      const file = this.managedEntryPath(
        folderPath,
        JSON.parse(text),
        kind,
        await this.readFolderLibraryMetaAsync(folderPath),
      );
      return file && (await fsp.stat(file)).isFile() ? file : null;
    } catch {
      return null;
    }
  }

  async refreshFolderAssets(
    folderPath: string,
    meta: FolderLibraryMeta,
    options?: { previousMeta?: FolderLibraryMeta | null; missingOnly?: boolean },
  ): Promise<string[]> {
    const key = this.getFolderAssetKey(folderPath);
    const previous = this.artworkUpdates.get(key);
    const update = (previous ?? Promise.resolve())
      .catch(() => {})
      .then(() => this.updateFolderAssets(folderPath, meta, options));
    this.artworkUpdates.set(key, update);
    try {
      return await update;
    } finally {
      if (this.artworkUpdates.get(key) === update) this.artworkUpdates.delete(key);
    }
  }

  private async updateFolderAssets(
    folderPath: string,
    meta: FolderLibraryMeta,
    options?: { previousMeta?: FolderLibraryMeta | null; missingOnly?: boolean },
  ): Promise<string[]> {
    if (!this.isFolderPathAllowed(folderPath)) throw new Error('La carpeta no está autorizada.');
    const isCurrent = () => {
      const current = this.readFolderLibraryMeta(folderPath);
      return (
        this.artworkIdentity(current) === this.artworkIdentity(meta) &&
        (current?.posterUrl ?? null) === (meta.posterUrl ?? null) &&
        (current?.bannerUrl ?? null) === (meta.bannerUrl ?? null)
      );
    };
    if (!isCurrent()) return [];
    const directory = this.getFolderAssetDir(folderPath);
    const manifestPath = this.artworkManifest(folderPath);
    let previous: ManagedArtwork | null = null;
    try {
      previous = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ManagedArtwork;
    } catch {}
    const identity = this.artworkIdentity(meta);
    const manifest: ManagedArtwork = { identity, poster: null, banner: null };
    const warnings: string[] = [];
    for (const kind of ['poster', 'banner'] as const) {
      if (
        previous?.identity === identity &&
        previous[kind]?.source === (kind === 'poster' ? meta.posterUrl : meta.bannerUrl)
      ) {
        manifest[kind] = previous[kind];
      }
      const source = kind === 'poster' ? meta.posterUrl : meta.bannerUrl;
      const previousSource = kind === 'poster' ? options?.previousMeta?.posterUrl : options?.previousMeta?.bannerUrl;
      if (
        !previous &&
        source &&
        source === previousSource &&
        this.artworkIdentity(options?.previousMeta ?? null) === identity
      ) {
        const legacy =
          kind === 'poster'
            ? this.getLegacyFolderPosterFilePath(folderPath)
            : this.getLegacyFolderBannerFilePath(folderPath);
        if (legacy) {
          try {
            const stat = fs.lstatSync(legacy);
            if (!stat.isFile() || stat.size > 5 * 1024 * 1024) throw new Error('Imagen no válida.');
            const bytes = fs.readFileSync(legacy);
            const ext = this.imageExtension(bytes);
            if (!ext) throw new Error('Imagen no válida.');
            const file = `${kind}-${crypto.randomUUID()}.${ext}`;
            fs.writeFileSync(path.join(directory, file), bytes, { flag: 'wx' });
            manifest[kind] = { file, source };
          } catch {
            warnings.push(`No se pudo conservar ${kind === 'poster' ? 'la carátula' : 'el banner'} local.`);
          }
        }
      }
    }
    safeWriteFileSync(manifestPath, JSON.stringify(manifest));
    for (const kind of ['poster', 'banner'] as const) {
      const source = kind === 'poster' ? meta.posterUrl : meta.bannerUrl;
      if (!source || (kind === 'banner' && source === meta.posterUrl)) continue;
      if (options?.missingOnly && (await this.managedArtworkPathAsync(folderPath, kind))) continue;
      if (!isAllowedImageUrl(source)) {
        warnings.push(`No se pudo actualizar ${kind === 'poster' ? 'la carátula' : 'el banner'}.`);
        continue;
      }
      const previousEntry = manifest[kind];
      let target: string | null = null;
      try {
        const response = await this.options.httpClient.get(source, this.imageRequestConfig());
        const bytes = Buffer.from(response.data as ArrayBuffer);
        const ext = this.imageExtension(bytes);
        if (!ext) throw new Error('Imagen no válida.');
        if (!isCurrent()) return warnings;
        if (!isPathWithinAnyDirectory(folderPath, this.options.getAllowedBaseDirs?.() ?? [folderPath], false)) {
          throw new Error('La carpeta ya no está autorizada.');
        }
        const file = `${kind}-${crypto.randomUUID()}.${ext}`;
        target = path.join(directory, file);
        await fsp.writeFile(target, bytes, { flag: 'wx' });
        if (!isCurrent()) {
          await fsp.unlink(target).catch(() => {});
          return warnings;
        }
        manifest[kind] = { file, source };
        safeWriteFileSync(manifestPath, JSON.stringify(manifest));
      } catch {
        manifest[kind] = previousEntry;
        if (target) await fsp.unlink(target).catch(() => {});
        warnings.push(`No se pudo actualizar ${kind === 'poster' ? 'la carátula' : 'el banner'}.`);
      }
    }
    for (const kind of ['poster', 'banner'] as const) {
      const retired = previous?.[kind]?.file;
      if (retired && retired !== manifest[kind]?.file && /^(poster|banner)-[a-f0-9-]+\.(jpg|png|webp)$/.test(retired)) {
        await fsp.unlink(path.join(directory, retired)).catch(() => {});
      }
    }
    return warnings;
  }

  async ensureFolderPoster(folderPath: string, posterUrl: string | null | undefined): Promise<string | null> {
    if (!this.isFolderPathAllowed(folderPath)) return null;
    const existing = await this.getFolderPosterFileUrlAsync(folderPath);
    if (existing) return existing;
    if (fs.existsSync(this.artworkManifest(folderPath))) return null;

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
    if (fs.existsSync(this.artworkManifest(folderPath))) return null;

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
      if (fs.existsSync(this.artworkManifest(folderPath))) {
        await this.refreshFolderAssets(folderPath, meta, { missingOnly: true });
        return;
      }
      const hasPoster = this.getFolderPosterFilePath(folderPath);
      const hasBanner = this.getFolderBannerFilePath(folderPath);
      if (!hasPoster && meta.posterUrl) {
        await this.ensureFolderPoster(folderPath, meta.posterUrl);
      }
      // Sin fallback al póster: solo restaura un banner genuino de AniList
      // (legacy guardaba el póster como bannerUrl y no se rellena).
      if (!hasBanner && meta.bannerUrl && meta.bannerUrl !== meta.posterUrl) {
        await this.ensureFolderBanner(folderPath, meta.bannerUrl);
      }
    } catch (error) {
      this.options.log(`No se pudieron restaurar assets de ${path.basename(folderPath)}: ${errorDetailForLog(error)}`);
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
