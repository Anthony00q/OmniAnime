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
import { isPathSafeForDestructiveOperation } from '../../utils/security/pathSecurity';
import {
  anilistBannerInputFromDetails,
  type AniListBannerInput,
  type AniListBannerResult,
} from '../providers/AniListService';
import {
  buildFolderName,
  extractFolderNameYear,
  nextAvailableFolderName,
  withFolderLanguage,
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
  reserveFolder?: (folderPath: string) => () => void;
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
  getFolderMeta?: (folderPath: string) => FolderLibraryMeta | null;
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
  private enqueueTail: Promise<unknown> = Promise.resolve();
  constructor(private readonly options: QueueEnqueueServiceOptions) {}

  enqueue(payload: QueueEnqueuePayload): Promise<QueueEnqueueResult | false> {
    const task = this.enqueueTail.then(() => this.enqueueItem(payload));
    this.enqueueTail = task.catch(() => undefined);
    return task;
  }

  private async enqueueItem(payload: QueueEnqueuePayload): Promise<QueueEnqueueResult | false> {
    const { slug, episodes, preferredServer, lang: rawLang, outputDirIndex } = payload;
    if (rawLang !== undefined && rawLang !== 'SUB' && rawLang !== 'DUB') return false;
    const lang = rawLang || 'SUB';
    // El provider del payload (el de la ficha visible) manda; el activo es fallback.
    const requestedProvider = String(payload.provider || '')
      .trim()
      .toLowerCase();
    const queueProvider = (
      requestedProvider === 'animeav1' || requestedProvider === 'jkanime'
        ? requestedProvider
        : this.options.getActiveProviderId()
    ) as DownloadProvider;
    if (lang === 'DUB' && queueProvider !== 'animeav1') return false;
    const details = await this.options.getAnimeDetails(slug, queueProvider);
    if (!details) return false;

    const { outputDirs, defaultOutputDir } = this.options.getOutputDirs();
    const dirs = outputDirs || [defaultOutputDir];
    const resolvedIndex = outputDirIndex ?? 0;
    const baseDir = dirs[resolvedIndex] || defaultOutputDir;
    if (!Array.isArray(episodes) || !episodes.every((ep) => Number.isSafeInteger(ep) && ep > 0)) return false;
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
      folderName = this.resolveFolderName(details, slug, anilist, baseDir, lang, queueProvider);
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

    let release: () => void;
    try {
      release = this.options.reserveFolder?.(targetPath) ?? (() => {});
    } catch {
      return false;
    }
    try {
      try {
        if (!isPathSafeForDestructiveOperation(targetPath, [...dirs, defaultOutputDir])) return false;
        await fs.promises.mkdir(targetPath, { recursive: true });
        if (!isPathSafeForDestructiveOperation(targetPath, [...dirs, defaultOutputDir])) return false;
      } catch {
        return false;
      }
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
        lang,
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
      this.options.logQueue(
        `Agregado a la cola: ${item.animeTitle} (${formatEpisodeCountLabel(item.episodes.length)})`,
        {
          queueId: item.id,
          provider: queueProvider,
        },
      );

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
    } finally {
      release();
    }
  }

  private resolveFolderName(
    details: DownloadAnimeDetails,
    payloadSlug: string,
    anilist: AniListBannerResult | null,
    baseDir: string,
    lang: 'SUB' | 'DUB',
    provider: DownloadProvider,
  ): string {
    const titleBase = buildFolderName(
      {
        providerTitle: details.title,
        providerAlternativeTitles: details.alternativeTitles,
        japaneseTitle: details.japaneseTitle,
        anilist: anilist?.titles ?? null,
        year: details.year,
      },
      this.options.getFolderNameSource(),
    );
    const base = withFolderLanguage(titleBase, lang);
    const animeSlug = String(details.slug || payloadSlug || '').trim();
    return nextAvailableFolderName(base, extractFolderNameYear(details.year), (name) => {
      const candidatePath = path.join(baseDir, name);
      const activeOwner = this.options
        .listQueueItems()
        .find(
          (item) =>
            ['pending', 'downloading', 'paused'].includes(item.status) &&
            path.resolve(item.targetPath).toLowerCase() === path.resolve(candidatePath).toLowerCase(),
        );
      if (
        activeOwner &&
        (activeOwner.providerId !== provider ||
          (activeOwner.lang || 'SUB') !== lang ||
          (activeOwner.downloadSlug || activeOwner.slug) !== animeSlug)
      )
        return true;
      try {
        if (!fs.existsSync(candidatePath)) return false;
      } catch {
        return false;
      }
      const ownerSlug = String(this.options.getFolderMetaSlug(candidatePath) || '').trim();
      const meta = this.options.getFolderMeta?.(candidatePath);
      if (meta && ((meta.lang || 'SUB') !== lang || (meta.providerId || 'animeav1') !== provider)) return true;
      if (lang === 'DUB' && !meta) return true;
      return ownerSlug !== '' && ownerSlug !== animeSlug;
    });
  }
}
