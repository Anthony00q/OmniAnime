import * as fs from 'fs';
import * as path from 'path';
import type { DownloadAnimeDetails } from '../../types/anime';
import type { FolderLibraryMeta } from '../../types/library';
import type { DownloadProvider, QueueItem } from '../../types/queue';
import {
  formatEpisodeCountLabel,
  normalizeDisplayAnimeTitle,
  normalizeFolderAlternativeTitles,
} from '../../utils/titleUtils';
import { errorDetailForLog } from '../../utils/logging/redactLog';
import {
  anilistBannerInputFromDetails,
  type AniListBannerInput,
  type AniListBannerResult,
} from '../providers/AniListService';
import {
  buildFolderName,
  extractFolderNameYear,
  nextAvailableFolderName,
  type FolderNameSource,
} from '../../utils/downloads/folderNaming';

export type AniListBannerFailureKind = 'ratelimit' | 'network' | 'nomatch';

export interface QueueEnqueuePayload {
  slug: string;
  episodes: number[];
  preferredServer?: string;
  lang?: 'SUB' | 'DUB';
  outputDirIndex?: number;
  // Proveedor de la ficha visible; sin él o desconocido se usa el activo.
  provider?: DownloadProvider;
}

export interface QueueEnqueueResult {
  id: string;
  libraryPreload: {
    folderName: string;
    title: string;
    slug: string;
    poster: string | null;
    banner: string | null;
  };
}

export interface QueueEnqueueServiceOptions {
  getAnimeDetails: (slug: string, providerId: DownloadProvider) => Promise<DownloadAnimeDetails | null>;
  getActiveProviderId: () => string;
  getOutputDirs: () => { outputDirs: string[]; defaultOutputDir: string };
  listQueueItems: () => QueueItem[];
  ensureFolderPoster: (folderPath: string, posterUrl: string | null | undefined) => Promise<string | null>;
  ensureFolderBanner: (folderPath: string, bannerUrl: string | null | undefined) => Promise<string | null>;
  resolveAniListMeta: (
    input: AniListBannerInput,
    onFailure?: (kind: AniListBannerFailureKind) => void,
  ) => Promise<AniListBannerResult | null>;
  getFolderNameSource: () => FolderNameSource;
  getFolderMetaSlug: (folderPath: string) => string | null;
  urlToFilePath: (url: string) => string | null;
  writeFolderLibraryMeta: (folderPath: string, data: FolderLibraryMeta) => void;
  addItem: (item: QueueItem) => void;
  sendQueueUpdate: () => void;
  processQueue: () => Promise<void>;
  logQueue: (message: string, meta: { queueId: string; provider: string }) => void;
  logAnilistWarn: (message: string) => void;
  logError: (error: unknown) => void;
}

export class QueueEnqueueService {
  constructor(private readonly options: QueueEnqueueServiceOptions) {}

  async enqueue(payload: QueueEnqueuePayload): Promise<QueueEnqueueResult | false> {
    const { slug, episodes, preferredServer, lang: rawLang, outputDirIndex } = payload;
    // DUB desactivado: solo SUB
    const lang = rawLang === 'DUB' ? 'SUB' : rawLang || 'SUB';
    // El provider del payload (el de la ficha visible) manda; el activo es fallback.
    const requestedProvider = String(payload.provider || '')
      .trim()
      .toLowerCase();
    const queueProvider = (
      requestedProvider === 'animeav1' || requestedProvider === 'jkanime'
        ? requestedProvider
        : this.options.getActiveProviderId()
    ) as DownloadProvider;
    const details = await this.options.getAnimeDetails(slug, queueProvider);
    if (!details) return false;

    const { outputDirs, defaultOutputDir } = this.options.getOutputDirs();
    const dirs = outputDirs || [defaultOutputDir];
    const resolvedIndex = outputDirIndex ?? 0;
    const baseDir = dirs[resolvedIndex] || defaultOutputDir;
    const normalizedEpisodes = Array.from(new Set(episodes)).sort((a, b) => a - b);
    if (normalizedEpisodes.length === 0) return false;

    // AniList primero: sus títulos pueden dar nombre a la carpeta.
    let anilist: AniListBannerResult | null = null;
    try {
      anilist = await this.options.resolveAniListMeta(
        { ...anilistBannerInputFromDetails(details, queueProvider), slug },
        (kind) => {
          if (kind !== 'nomatch') this.options.logAnilistWarn(`banner no resuelto (${kind})`);
        },
      );
    } catch (error) {
      this.options.logError(`Error resolviendo AniList para ${slug}: ${errorDetailForLog(error)}`);
    }

    let folderName: string;
    try {
      folderName = this.resolveFolderName(details, slug, anilist, baseDir);
    } catch (error) {
      this.options.logError(`Error resolviendo carpeta para ${slug}: ${errorDetailForLog(error)}`);
      return false;
    }
    const targetPath = path.join(baseDir, folderName);
    const duplicateQueueItem = this.options
      .listQueueItems()
      .find(
        (existing) =>
          (existing.status === 'pending' || existing.status === 'downloading' || existing.status === 'paused') &&
          existing.providerId === queueProvider &&
          (existing.downloadSlug || existing.slug) === slug &&
          (existing.lang || 'SUB') === (lang || 'SUB') &&
          path.resolve(existing.targetPath).toLowerCase() === path.resolve(targetPath).toLowerCase() &&
          existing.episodes.some((episode) => normalizedEpisodes.includes(episode)),
      );
    if (duplicateQueueItem) return false;

    try {
      await fs.promises.mkdir(targetPath, { recursive: true });
    } catch {}
    let localPosterUrl: string | null = null;
    let localBannerUrl: string | null = null;
    const anilistBannerUrl = anilist?.banner ?? null;
    try {
      // Banner como en la ficha: solo AniList validado, sin fallback al póster.
      [localPosterUrl, localBannerUrl] = await Promise.all([
        this.options.ensureFolderPoster(targetPath, details.poster || null),
        anilistBannerUrl ? this.options.ensureFolderBanner(targetPath, anilistBannerUrl) : Promise.resolve(null),
      ]);
    } catch (error) {
      this.options.logError(`Error descargando portada para ${slug}: ${errorDetailForLog(error)}`);
    }

    if (localPosterUrl && (localPosterUrl.startsWith('file:') || localPosterUrl.startsWith('omni-media:'))) {
      try {
        const filePath = this.options.urlToFilePath(localPosterUrl);
        if (!filePath || !fs.existsSync(filePath)) localPosterUrl = null;
      } catch {
        localPosterUrl = null;
      }
    }

    const folderTitle = normalizeDisplayAnimeTitle(details.title || folderName);
    this.options.writeFolderLibraryMeta(targetPath, {
      slug: details.slug || slug,
      title: folderTitle,
      secondaryTitle: String(details.japaneseTitle || '').trim(),
      alternativeTitles: normalizeFolderAlternativeTitles(details.alternativeTitles, folderTitle),
      category: details.category || '',
      year: details.year || '',
      status: details.status || '',
      season: details.season || '',
      posterUrl: details.poster || null,
      bannerUrl: anilistBannerUrl,
      providerId: queueProvider,
      anilistId: anilist?.anilistId ?? null,
    });

    const item: QueueItem = {
      id: `q-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      slug,
      downloadSlug: slug,
      animeTitle: normalizeDisplayAnimeTitle(details.title),
      poster: localPosterUrl || details.poster || null,
      preferredServer: preferredServer || 'Auto',
      lang: lang || 'SUB',
      episodes: normalizedEpisodes,
      status: 'pending',
      currentEp: null,
      providerId: queueProvider,
      progress: 0,
      completedEps: [],
      failedEps: [],
      targetPath,
      outputDirIndex: resolvedIndex,
    };

    this.options.addItem(item);
    this.options.sendQueueUpdate();
    this.options.logQueue(`Agregado a la cola: ${item.animeTitle} (${formatEpisodeCountLabel(item.episodes.length)})`, {
      queueId: item.id,
      provider: queueProvider,
    });

    setImmediate(() => {
      this.options.processQueue().catch((error) => {
        this.options.logError(error);
      });
    });

    return {
      id: item.id,
      libraryPreload: {
        folderName,
        title: normalizeDisplayAnimeTitle(details.title || folderName),
        slug: details.slug || slug,
        poster: localPosterUrl || details.poster || null,
        banner: localBannerUrl || null,
      },
    };
  }

  private resolveFolderName(
    details: DownloadAnimeDetails,
    payloadSlug: string,
    anilist: AniListBannerResult | null,
    baseDir: string,
  ): string {
    const base = buildFolderName(
      {
        providerTitle: details.title,
        providerAlternativeTitles: details.alternativeTitles,
        japaneseTitle: details.japaneseTitle,
        anilist: anilist?.titles ?? null,
        year: details.year,
      },
      this.options.getFolderNameSource(),
    );
    const animeSlug = String(details.slug || payloadSlug || '').trim();
    return nextAvailableFolderName(base, extractFolderNameYear(details.year), (name) => {
      const candidatePath = path.join(baseDir, name);
      try {
        if (!fs.existsSync(candidatePath)) return false;
      } catch {
        return false;
      }
      const ownerSlug = String(this.options.getFolderMetaSlug(candidatePath) || '').trim();
      // Sin meta se comparte carpeta: solo otro anime empuja el nombre.
      return ownerSlug !== '' && ownerSlug !== animeSlug;
    });
  }
}
