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
import { anilistBannerInputFromDetails, type AniListBannerInput } from '../providers/AniListService';

export type AniListBannerFailureKind = 'ratelimit' | 'network' | 'nomatch';

export interface QueueEnqueuePayload {
  slug: string;
  episodes: number[];
  preferredServer?: string;
  lang?: 'SUB' | 'DUB';
  outputDirIndex?: number;
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
  resolveAniListBannerUrl: (
    input: AniListBannerInput,
    onFailure?: (kind: AniListBannerFailureKind) => void,
  ) => Promise<string | null>;
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
    const queueProvider = this.options.getActiveProviderId() as DownloadProvider;
    const details = await this.options.getAnimeDetails(slug, queueProvider);
    if (!details) return false;

    const { outputDirs, defaultOutputDir } = this.options.getOutputDirs();
    const dirs = outputDirs || [defaultOutputDir];
    const resolvedIndex = outputDirIndex ?? 0;
    const baseDir = dirs[resolvedIndex] || defaultOutputDir;
    const folderName = details.title.replace(/[^a-z0-9\s]/gi, '_').trim();
    const targetPath = path.join(baseDir, folderName);
    const normalizedEpisodes = Array.from(new Set(episodes)).sort((a, b) => a - b);
    if (normalizedEpisodes.length === 0) return false;
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
    let anilistBannerUrl: string | null = null;
    try {
      // Banner como en la ficha: solo AniList validado, sin fallback al
      // póster. En paralelo al póster para no sumar latencia.
      const anilistInput = anilistBannerInputFromDetails(details);
      [localPosterUrl, localBannerUrl] = await Promise.all([
        this.options.ensureFolderPoster(targetPath, details.poster || null),
        (async () => {
          const resolvedBanner = await this.options.resolveAniListBannerUrl(anilistInput, (kind) => {
            if (kind !== 'nomatch') this.options.logAnilistWarn(`banner no resuelto (${kind})`);
          });
          anilistBannerUrl = resolvedBanner ?? null;
          return anilistBannerUrl ? this.options.ensureFolderBanner(targetPath, anilistBannerUrl) : null;
        })(),
      ]);
    } catch (error) {
      this.options.logError(`Error descargando portada para ${slug}: ${error}`);
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
}
