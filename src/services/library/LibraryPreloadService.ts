import * as fs from 'fs';
import * as path from 'path';
import anitomy from 'anitomy';
import type { AnimeDetails, AnimeSearchResult } from '../../types/anime';
import type { FolderLibraryMeta, LibraryMetaPreloadRow } from '../../types/library';
import {
  computeTitleMatchScore,
  normalizeFolderAlternativeTitles,
  normalizeTitleForMatch,
} from '../../utils/titleUtils';
import {
  anilistBannerInputFromDetails,
  canonicalizeSeasonTokens,
  type AniListBannerInput,
  type AniListBannerResult,
} from '../providers/AniListService';
import { errorDetailForLog, safeErrorMessage } from '../../utils/logging/redactLog';

export interface LibraryPreloadAssetPort {
  getFolderPosterFileUrlAsync(folderPath: string): Promise<string | null>;
  getFolderBannerFileUrlAsync(folderPath: string): Promise<string | null>;
  readFolderLibraryMetaAsync(folderPath: string): Promise<FolderLibraryMeta | null>;
  writeFolderLibraryMeta(folderPath: string, data: FolderLibraryMeta): void;
  ensureFolderPoster(folderPath: string, posterUrl: string | null | undefined): Promise<string | null>;
  ensureFolderBanner(folderPath: string, bannerUrl: string | null | undefined): Promise<string | null>;
}

export interface LibraryPreloadProviderPort {
  id: string;
  search(query: string): Promise<AnimeSearchResult[]>;
  getDetails(slug: string): Promise<AnimeDetails | null>;
}

export interface LibraryPreloadServiceOptions {
  assetService: LibraryPreloadAssetPort;
  // El proveedor de la carpeta manda; el activo solo es fallback si no hay id o no existe.
  getMatchingProvider: (preferredProviderId?: string | null) => LibraryPreloadProviderPort;
  resolveAniListMeta?: (input: AniListBannerInput) => Promise<AniListBannerResult | null>;
  checkConnectivity: () => Promise<boolean>;
  log: (error: unknown) => void;
  scopedLogError: (message: string) => void;
}

export function buildLibrarySearchVariants(rawName: string): string[] {
  const base = String(rawName || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\(.*?\)|\[.*?\]|\{.*?\}/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  let anitomyTitle = '';
  try {
    const parsed = anitomy.parse(rawName + '.mkv');
    if (parsed && parsed.title) {
      anitomyTitle = parsed.title.replace(/[_-]+/g, ' ').trim();
    }
  } catch {}

  const cleaned = base
    .replace(/\b(season|temporada|part|cour|sub|dub|final|completo)\b/gi, ' ')
    .replace(/\b\d{1,2}\b/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const variants = [base];
  if (anitomyTitle && anitomyTitle !== base) {
    variants.push(anitomyTitle);
  }
  variants.push(cleaned);

  return Array.from(new Set(variants.map((v) => v.trim()).filter(Boolean))).slice(0, 3);
}

const MIN_FOLDER_MATCH_SCORE = 50;
const MIN_FOLDER_MATCH_GAP = 10;

function seasonMarker(title: string): number | null {
  const m = canonicalizeSeasonTokens(title).match(/\bseason (\d{1,2})\b/);
  return m ? Number(m[1]) : null;
}

function seasonsConflict(folderName: string, title: string): boolean {
  const a = seasonMarker(folderName);
  const b = seasonMarker(title);
  return a !== null && b !== null && a !== b;
}

async function mapLimit<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onError: (error: unknown) => void,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;

  const runners = new Array(Math.max(1, concurrency)).fill(0).map(async () => {
    while (true) {
      const idx = cursor;
      cursor += 1;
      if (idx >= items.length) break;
      try {
        out[idx] = await worker(items[idx], idx);
      } catch (error) {
        onError(error);
        // Preserve slot as null-equivalent to avoid hiding via filter(Boolean) ambiguity
        (out as unknown as Array<R | null>)[idx] = null as unknown as R;
      }
    }
  });

  await Promise.all(runners);
  return out;
}

export class LibraryPreloadService {
  constructor(private readonly options: LibraryPreloadServiceOptions) {}

  async buildMetaPreload(
    baseDirs: string[],
    maxFolders = 0,
    onProgress?: (info: { processed: number; total: number; matched: number }) => void,
    allowRemoteLookup = true,
  ): Promise<LibraryMetaPreloadRow[]> {
    try {
      const videoExts = new Set(['.mp4', '.mkv', '.avi', '.flv', '.webm']);
      const allFolders: Array<{
        name: string;
        folderPath: string;
        sourceDir: string;
        sourceDirIndex: number;
        birthtime: number;
        episodeCount: number;
        localPoster: string | null;
        localBanner: string | null;
        localMeta: FolderLibraryMeta | null;
      }> = [];

      for (const [dirIndex, baseDir] of baseDirs.entries()) {
        if (!baseDir) continue;
        try {
          await fs.promises.stat(baseDir);
        } catch {
          continue;
        }

        let dirents: fs.Dirent[];
        try {
          dirents = (await fs.promises.readdir(baseDir, { withFileTypes: true })) as unknown as fs.Dirent[];
        } catch (error) {
          this.options.log(
            `No se pudo leer ${path.basename(baseDir)} durante el precargado: ${errorDetailForLog(error)}`,
          );
          continue;
        }
        for (const d of await mapLimit(
          dirents.filter((x) => x.isDirectory()),
          16,
          async (d) => {
            const folderPath = path.join(baseDir, d.name);
            // Conteo en la misma lectura que detecta video: sin I/O extra
            let episodeCount = 0;
            try {
              const entries = (await fs.promises.readdir(folderPath, {
                withFileTypes: true,
              })) as unknown as fs.Dirent[];
              episodeCount = entries.reduce(
                (acc, e) => (e.isFile() && videoExts.has(path.extname(e.name).toLowerCase()) ? acc + 1 : acc),
                0,
              );
            } catch (error) {
              this.options.log(
                `No se pudo leer ${path.basename(folderPath)} durante el precargado: ${errorDetailForLog(error)}`,
              );
            }
            if (episodeCount === 0) return null;

            let birthtime = 0;
            try {
              const st = await fs.promises.stat(folderPath);
              birthtime = st.birthtimeMs || 0;
            } catch (error) {
              this.options.log(
                `No se pudo obtener la fecha de ${path.basename(folderPath)}: ${errorDetailForLog(error)}`,
              );
            }
            const [localPoster, localBanner, localMeta] = await Promise.all([
              this.options.assetService.getFolderPosterFileUrlAsync(folderPath),
              this.options.assetService.getFolderBannerFileUrlAsync(folderPath),
              this.options.assetService.readFolderLibraryMetaAsync(folderPath),
            ]);
            return {
              name: d.name,
              folderPath,
              sourceDir: baseDir,
              sourceDirIndex: dirIndex,
              birthtime,
              episodeCount,
              localPoster,
              localBanner,
              localMeta,
            };
          },
          this.options.log,
        )) {
          if (!d) continue;
          allFolders.push(d);
        }
      }

      if (allFolders.length === 0) {
        return [];
      }

      const sorted = allFolders.sort((a, b) => b.birthtime - a.birthtime);
      const targets = maxFolders > 0 ? sorted.slice(0, maxFolders) : sorted;
      if (!targets.length) {
        return [];
      }

      const searchCache = new Map<string, Promise<AnimeSearchResult[]>>();
      let processed = 0;
      let matched = 0;
      let lastProgressEmit = 0;
      onProgress?.({ processed: 0, total: targets.length, matched: 0 });

      const rows = await mapLimit(
        targets,
        3,
        async (folder) => {
          if (folder.localMeta?.slug && (folder.localPoster || folder.localBanner)) {
            processed += 1;
            matched += 1;
            if (onProgress && (processed % 3 === 0 || processed === targets.length)) {
              onProgress({ processed, total: targets.length, matched });
            }

            return {
              folderName: folder.name,
              folderPath: folder.folderPath,
              sourceDir: folder.sourceDir,
              sourceDirIndex: folder.sourceDirIndex,
              birthtime: folder.birthtime,
              episodeCount: folder.episodeCount,
              slug: folder.localMeta.slug || null,
              title: folder.localMeta.title || folder.name,
              secondaryTitle: folder.localMeta.secondaryTitle || '',
              alternativeTitles: folder.localMeta.alternativeTitles || [],
              poster: folder.localPoster,
              banner: folder.localBanner,
              category: folder.localMeta.category || '',
              year: folder.localMeta.year || '',
              status: folder.localMeta.status || '',
              season: folder.localMeta.season || '',
              providerId: folder.localMeta.providerId ?? null,
              updatedAt: Date.now(),
            };
          }

          if (folder.localPoster && folder.localMeta && !folder.localMeta.slug) {
            processed += 1;
            matched += 1;
            if (onProgress && (processed % 3 === 0 || processed === targets.length)) {
              onProgress({ processed, total: targets.length, matched });
            }

            return {
              folderName: folder.name,
              folderPath: folder.folderPath,
              sourceDir: folder.sourceDir,
              sourceDirIndex: folder.sourceDirIndex,
              birthtime: folder.birthtime,
              episodeCount: folder.episodeCount,
              slug: null,
              title: folder.localMeta.title || folder.name,
              secondaryTitle: folder.localMeta.secondaryTitle || '',
              alternativeTitles: folder.localMeta.alternativeTitles || [],
              poster: folder.localPoster,
              banner: folder.localBanner,
              category: folder.localMeta.category || '',
              year: folder.localMeta.year || '',
              status: folder.localMeta.status || '',
              season: folder.localMeta.season || '',
              providerId: folder.localMeta.providerId ?? null,
              updatedAt: Date.now(),
            };
          }

          // Sin lookup remoto (splash) o sin conexión: fila básica completa en vez
          // de null, para que la siembra ['library', dirs] no oculte carpetas.
          const buildBasicRow = (): LibraryMetaPreloadRow => ({
            folderName: folder.name,
            folderPath: folder.folderPath,
            sourceDir: folder.sourceDir,
            sourceDirIndex: folder.sourceDirIndex,
            birthtime: folder.birthtime,
            episodeCount: folder.episodeCount,
            slug: folder.localMeta?.slug || null,
            title: folder.localMeta?.title || folder.name,
            secondaryTitle: folder.localMeta?.secondaryTitle || '',
            alternativeTitles: folder.localMeta?.alternativeTitles || [],
            poster: folder.localPoster,
            banner: folder.localBanner,
            category: folder.localMeta?.category || '',
            year: folder.localMeta?.year || '',
            status: folder.localMeta?.status || '',
            season: folder.localMeta?.season || '',
            providerId: folder.localMeta?.providerId ?? null,
            updatedAt: Date.now(),
          });

          if (!allowRemoteLookup || !(await this.options.checkConnectivity())) {
            processed += 1;
            const now = Date.now();
            if (onProgress && (processed % 4 === 0 || now - lastProgressEmit > 450 || processed === targets.length)) {
              lastProgressEmit = now;
              onProgress({ processed, total: targets.length, matched });
            }
            return buildBasicRow();
          }

          const variants = buildLibrarySearchVariants(folder.name);
          const matchingProvider = this.options.getMatchingProvider(folder.localMeta?.providerId ?? null);
          const matchingProviderId = matchingProvider.id;
          const bySlug = new Map<string, { item: AnimeSearchResult; score: number; titleKey: string }>();

          for (const q of variants) {
            if (!q) continue;
            const searchCacheKey = `${matchingProviderId}:${q}`;
            let pending = searchCache.get(searchCacheKey);
            if (!pending) {
              // La promesa se comparte: dos carpetas iguales en paralelo hacen una sola búsqueda.
              pending = matchingProvider
                .search(q)
                .then((found) => found || [])
                .catch(() => [] as AnimeSearchResult[]);
              searchCache.set(searchCacheKey, pending);
            }

            const list = (await pending) || [];
            for (const item of list.slice(0, 10)) {
              const title = String(item.title || '').trim();
              const score = seasonsConflict(folder.name, title) ? 0 : computeTitleMatchScore(q, title);
              const key = String(item.slug || item.id || title);
              const prev = bySlug.get(key);
              if (!prev || score > prev.score) {
                bySlug.set(key, { item, score, titleKey: normalizeTitleForMatch(title) });
              }
            }
          }

          const byTitle = new Map<string, { item: AnimeSearchResult; score: number }>();
          for (const entry of bySlug.values()) {
            const prev = byTitle.get(entry.titleKey);
            if (!prev || entry.score > prev.score) byTitle.set(entry.titleKey, entry);
          }
          const ranked = Array.from(byTitle.values()).sort((a, b) => b.score - a.score);
          const best = ranked[0]?.item ?? null;
          const bestScore = ranked[0]?.score ?? -1;
          const runnerUpScore = ranked[1]?.score ?? -1;

          processed += 1;
          const now = Date.now();
          if (onProgress && (processed % 4 === 0 || now - lastProgressEmit > 450 || processed === targets.length)) {
            lastProgressEmit = now;
            onProgress({ processed, total: targets.length, matched });
          }

          // Sin match remoto: conservar la carpeta con fila básica (no ocultar)
          if (!best || bestScore < MIN_FOLDER_MATCH_SCORE || bestScore - runnerUpScore < MIN_FOLDER_MATCH_GAP) {
            return buildBasicRow();
          }

          let details: AnimeDetails | null = null;
          try {
            details = await matchingProvider.getDetails(String(best.slug || ''));
          } catch (error) {
            this.options.log(
              `No se pudieron obtener detalles de ${String(best.slug || '')}: ${safeErrorMessage(error)}`,
            );
          }

          const posterUrl = details?.poster || best.poster || null;
          const localPoster = await this.options.assetService.ensureFolderPoster(folder.folderPath, posterUrl);
          // Banner como en la ficha: solo AniList validado, sin fallback al póster.
          const anilist = details
            ? ((await this.options.resolveAniListMeta?.(anilistBannerInputFromDetails(details, matchingProviderId))) ??
              null)
            : null;
          const anilistBannerUrl = anilist?.banner ?? null;
          const localBanner = anilistBannerUrl
            ? await this.options.assetService.ensureFolderBanner(folder.folderPath, anilistBannerUrl)
            : null;

          const preloadTitle = String(details?.title || best.title || folder.name);
          this.options.assetService.writeFolderLibraryMeta(folder.folderPath, {
            slug: String(best.slug || ''),
            title: preloadTitle,
            secondaryTitle: String(details?.japaneseTitle || '').trim(),
            alternativeTitles: normalizeFolderAlternativeTitles(details?.alternativeTitles, preloadTitle),
            category: details?.category || '',
            year: details?.year || '',
            status: details?.status || '',
            season: details?.season || '',
            posterUrl,
            bannerUrl: anilistBannerUrl,
            providerId: matchingProviderId,
            anilistId: anilist?.anilistId ?? null,
          });

          matched += 1;
          if (onProgress && (processed % 3 === 0 || processed === targets.length)) {
            onProgress({ processed, total: targets.length, matched });
          }

          return {
            folderName: folder.name,
            folderPath: folder.folderPath,
            sourceDir: folder.sourceDir,
            sourceDirIndex: folder.sourceDirIndex,
            birthtime: folder.birthtime,
            episodeCount: folder.episodeCount,
            slug: String(best.slug || ''),
            title: preloadTitle,
            secondaryTitle: String(details?.japaneseTitle || '').trim(),
            alternativeTitles: normalizeFolderAlternativeTitles(details?.alternativeTitles, preloadTitle),
            poster: localPoster || best.poster || null,
            banner: localBanner || null,
            category: details?.category || '',
            year: details?.year || '',
            status: details?.status || '',
            season: details?.season || '',
            providerId: matchingProviderId,
            updatedAt: Date.now(),
          };
        },
        this.options.log,
      );

      return rows.filter(Boolean) as LibraryMetaPreloadRow[];
    } catch {
      return [];
    }
  }
}
