import * as fs from 'fs/promises';
import { createHash, randomUUID } from 'crypto';
import type {
  FolderLibraryMeta,
  LibraryMetadataPreview,
  LibraryMetadataRequest,
  LibraryMetadataResult,
} from '../../types/library';
import type { AniListBannerInput, AniListBannerResult } from '../providers/AniListService';
import { isPathSafeForDestructiveOperation } from '../../utils/security/pathSecurity';
import type { LibraryAssetService } from './LibraryAssetService';
import type { LibraryAnimeDetails } from './LibraryFileService';
import { normalizeDisplayAnimeTitle } from '../../utils/titleUtils';

interface MetadataOptions {
  assetService: LibraryAssetService;
  getAllowedBaseDirs: () => string[];
  getDetails: (slug: string, providerId: string) => Promise<LibraryAnimeDetails | null>;
  getActiveProviderId?: () => string;
  resolveAniListMeta: (input: AniListBannerInput) => Promise<AniListBannerResult | null>;
  mutate: <T>(paths: string[], action: () => Promise<T>) => Promise<T>;
  getAniListLinkId?: (providerId: string, slug: string) => number | null;
  commitAniListLink?: (providerId: string, slug: string, anilistId: number) => void;
}

interface PreparedMetadata {
  owner: number;
  expires: number;
  revision: string;
  request: LibraryMetadataRequest;
  meta: FolderLibraryMeta;
  warnings: string[];
  linkId: number | null;
}

export class LibraryMetadataService {
  private readonly prepared = new Map<string, PreparedMetadata>();

  constructor(private readonly options: MetadataOptions) {}

  private async snapshot(folderPath: string): Promise<{ revision: string; meta: FolderLibraryMeta | null }> {
    if (!isPathSafeForDestructiveOperation(folderPath, this.options.getAllowedBaseDirs(), false)) {
      throw new Error('La carpeta está fuera de la librería configurada o no es segura.');
    }
    const stat = await fs.stat(folderPath);
    if (!stat.isDirectory()) throw new Error('La carpeta ya no existe.');
    const meta = await this.options.assetService.readFolderLibraryMetaAsync(folderPath);
    const revision = createHash('sha256')
      .update(JSON.stringify([stat.dev, stat.ino, stat.birthtimeMs, meta]))
      .digest('hex');
    return { revision, meta };
  }

  async prepareLegacy(folderPath: string, slug: string, providerId: string | null | undefined, owner: number) {
    const snapshot = await this.snapshot(folderPath);
    return this.prepare(
      {
        folderPath,
        slug,
        providerId: providerId || snapshot.meta?.providerId || this.options.getActiveProviderId?.() || 'animeav1',
      },
      owner,
      snapshot,
    );
  }

  async prepare(
    request: LibraryMetadataRequest,
    owner: number,
    suppliedSnapshot?: { revision: string; meta: FolderLibraryMeta | null },
  ): Promise<LibraryMetadataPreview> {
    if (
      !['animeav1', 'jkanime'].includes(request.providerId) ||
      !request.slug?.trim() ||
      request.slug !== request.slug.trim() ||
      request.slug === '.' ||
      request.slug === '..' ||
      request.slug.length > 250 ||
      /[\\/?#]/.test(request.slug) ||
      request.slug.includes(String.fromCharCode(0))
    ) {
      throw new Error('La ficha del proveedor no es válida.');
    }
    const { revision, meta: current } = suppliedSnapshot ?? (await this.snapshot(request.folderPath));
    const linkId = this.options.getAniListLinkId?.(request.providerId, request.slug) ?? null;
    if (current?.providerId && current.providerId !== request.providerId) {
      throw new Error('El proveedor no coincide con el de la carpeta.');
    }
    if (request.refresh && current?.slug !== request.slug) {
      throw new Error('El vínculo de la carpeta cambió. Vuelve a abrir la revisión.');
    }
    const details = await this.options.getDetails(request.slug, request.providerId);
    if (!details?.title) throw new Error('No se pudo consultar la ficha. El vínculo actual no ha cambiado.');
    const warnings: string[] = [];
    let anilist: AniListBannerResult | null = null;
    try {
      anilist = await this.options.resolveAniListMeta({
        title: details.title,
        alternativeTitles: details.alternativeTitles,
        providerId: request.providerId,
        slug: request.slug,
        providerYear: details.year,
        providerFormat: details.type ?? details.category,
        providerSeason: details.season,
        malId: details.malId,
        persistMatch: false,
        forceRefresh: request.refresh === true,
      });
    } catch {
      warnings.push('No se pudo consultar AniList. Puedes actualizar sus datos más tarde.');
    }
    const sameIdentity = current?.slug === request.slug && (current.providerId || 'animeav1') === request.providerId;
    const keepAniList = sameIdentity && warnings.length > 0 && (linkId === null || linkId === current.anilistId);
    const meta: FolderLibraryMeta = {
      slug: request.slug,
      providerId: request.providerId,
      title: normalizeDisplayAnimeTitle(details.title),
      secondaryTitle: details.japaneseTitle ?? '',
      alternativeTitles: details.alternativeTitles ?? [],
      year: String(details.year ?? ''),
      category: details.category ?? '',
      status: details.status ?? '',
      season: details.season ?? '',
      lang: current?.lang === 'DUB' ? 'DUB' : 'SUB',
      posterUrl: details.poster ?? null,
      anilistId: keepAniList ? current?.anilistId : (anilist?.anilistId ?? linkId),
      bannerUrl: keepAniList ? current?.bannerUrl : (anilist?.banner ?? null),
    };
    const now = Date.now();
    if ((this.options.getAniListLinkId?.(request.providerId, request.slug) ?? null) !== linkId) {
      throw new Error('El vínculo de AniList cambió durante la consulta. Prepara otra revisión.');
    }
    for (const [token, entry] of this.prepared) if (entry.expires < now) this.prepared.delete(token);
    if (this.prepared.size >= 128) this.prepared.delete(this.prepared.keys().next().value!);
    const token = randomUUID();
    this.prepared.set(token, {
      owner,
      expires: now + 300_000,
      revision,
      request: { ...request },
      meta,
      warnings,
      linkId,
    });
    return { token, folderPath: request.folderPath, current, proposed: meta, warnings };
  }

  async apply(token: string, owner: number): Promise<LibraryMetadataResult> {
    const plan = this.prepared.get(token);
    if (!plan || plan.owner !== owner || plan.expires < Date.now()) {
      throw new Error('La revisión ha caducado. Prepara una nueva vista previa.');
    }
    this.prepared.delete(token);
    return this.options.mutate([plan.request.folderPath], async () => {
      const { revision, meta: previousMeta } = await this.snapshot(plan.request.folderPath);
      if (revision !== plan.revision) {
        throw new Error('La carpeta o su vínculo cambió. Prepara una nueva revisión.');
      }
      if ((this.options.getAniListLinkId?.(plan.request.providerId, plan.request.slug) ?? null) !== plan.linkId) {
        throw new Error('El vínculo de AniList cambió. Prepara una nueva revisión.');
      }
      this.options.assetService.writeFolderLibraryMeta(plan.request.folderPath, plan.meta, { strict: true });
      const warnings = [...plan.warnings];
      if (plan.meta.anilistId && !plan.warnings.length && plan.meta.anilistId !== plan.linkId) {
        try {
          this.options.commitAniListLink?.(plan.request.providerId, plan.request.slug, plan.meta.anilistId);
        } catch {
          warnings.push('No se pudo guardar el vínculo de AniList para la ficha.');
        }
      }
      try {
        warnings.push(
          ...(await this.options.assetService.refreshFolderAssets(plan.request.folderPath, plan.meta, {
            previousMeta,
          })),
        );
      } catch {
        warnings.push('No se pudieron actualizar las imágenes de la carpeta.');
      }
      return { folderPath: plan.request.folderPath, meta: plan.meta, warnings };
    });
  }
}
