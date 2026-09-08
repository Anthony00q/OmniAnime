import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import type { DownloadService, YtdlpRuntimeTools } from './DownloadService';
import type { ProviderDownloadLink, QueueItem } from '../types/queue';
import type { DownloadSettings } from '../types/settings';
import { normalizeDownloadSettings } from '../utils/downloadSettings';
import { normalizeMp4UploadUrl, resolveHlsPlaybackUrl } from '../utils/serverUtils';

export interface EpisodeAttemptProgress {
  progress: number;
  status?: string;
  progressLog?: string;
}

export interface EpisodeAttemptCallbacks {
  onProgress: (update: EpisodeAttemptProgress) => void;
  updateTray: (text: string) => void;
}

export interface EpisodeAttemptResult {
  success: boolean;
  aborted: boolean;
  parentAborted: boolean;
  skipRequested: boolean;
  attemptTimedOut: boolean;
  invalidMp4: boolean;
  toolFailureMessage: string | null;
  // Hubo progreso o archivo inicial en disco: la URL resolvió a algo real.
  started: boolean;
}

export interface EpisodeDownloadAttemptOptions {
  downloadService: DownloadService;
  getRuntimeTools: () => YtdlpRuntimeTools;
  userAgent: string;
  hlsPlayerReferer: string;
  log: (message: string, type?: 'info' | 'success' | 'error' | 'warn') => void;
  logError: (error: unknown) => void;
  getDownloadSettings?: () => DownloadSettings | undefined;
}

const START_TIMEOUT_MS = 90_000;
const YTDLP_BUFFER_SIZE = '16M';

export class EpisodeDownloadAttemptService {
  private readonly activeAttempts = new Map<string, AbortController>();
  private readonly skipEpochs = new Map<string, number>();

  constructor(private readonly options: EpisodeDownloadAttemptOptions) {}

  private attemptKey(itemId: string, episode: number): string {
    return `${itemId}:${episode}`;
  }

  skip(itemId?: string, episode?: number): boolean {
    if (itemId !== undefined && episode !== undefined) return this.skipEpisode(itemId, episode);
    if (this.activeAttempts.size === 0) return false;
    for (const key of Array.from(this.skipEpochs.keys())) {
      this.skipEpochs.set(key, (this.skipEpochs.get(key) || 0) + 1);
    }
    // Claves nuevas sin epoch previo también cuentan como skip
    for (const key of Array.from(this.activeAttempts.keys())) {
      if (!this.skipEpochs.has(key)) this.skipEpochs.set(key, 1);
    }
    for (const controller of Array.from(this.activeAttempts.values())) {
      try {
        controller.abort();
      } catch {
        /* abort is idempotent */
      }
    }
    return true;
  }

  skipEpisode(itemId: string, episode: number): boolean {
    const key = this.attemptKey(itemId, episode);
    const controller = this.activeAttempts.get(key);
    if (!controller) return false;
    this.skipEpochs.set(key, (this.skipEpochs.get(key) || 0) + 1);
    try {
      controller.abort();
    } catch {
      /* abort is idempotent */
    }
    return true;
  }

  abortEpisode(itemId: string, episode: number): boolean {
    const key = this.attemptKey(itemId, episode);
    const controller = this.activeAttempts.get(key);
    if (!controller) return false;
    try {
      controller.abort();
    } catch {
      /* abort is idempotent */
    }
    return true;
  }

  abortItem(itemId: string): boolean {
    let aborted = false;
    for (const [key, controller] of Array.from(this.activeAttempts.entries())) {
      if (key === itemId || key.startsWith(`${itemId}:`)) {
        try {
          controller.abort();
        } catch {
          /* abort is idempotent */
        }
        aborted = true;
      }
    }
    return aborted;
  }

  abort(): void {
    for (const controller of Array.from(this.activeAttempts.values())) {
      try {
        controller.abort();
      } catch {
        /* abort is idempotent */
      }
    }
  }

  hasCompletedFile(destPath: string): boolean {
    return this.isRegularFileWithContent(destPath);
  }

  async attempt(
    item: QueueItem,
    episode: number,
    link: ProviderDownloadLink,
    dest: string,
    parentSignal: AbortSignal,
    callbacks: EpisodeAttemptCallbacks,
  ): Promise<EpisodeAttemptResult> {
    const attemptAbort = new AbortController();
    const key = this.attemptKey(item.id, episode);
    this.activeAttempts.set(key, attemptAbort);
    const startSkipEpoch = this.skipEpochs.get(key) || 0;
    const dl = normalizeDownloadSettings(this.options.getDownloadSettings?.());

    const onParentAbort = () => {
      try {
        attemptAbort.abort();
      } catch {
        /* abort is idempotent */
      }
    };
    parentSignal.addEventListener('abort', onParentAbort);
    if (parentSignal.aborted) onParentAbort();

    let attemptTimedOut = false;
    let started = false;
    const markStarted = () => {
      if (!started) started = true;
    };
    try {
      if (await this.hasDownloadStartedOnDiskAsync(dest)) {
        markStarted();
      }
    } catch {}
    const filesBeforeAttempt = await this.snapshotStableFilesAsync(path.dirname(dest));
    const startTimeoutMs = Math.max(10_000, Math.min(180_000, dl.startTimeoutSec * 1000 || START_TIMEOUT_MS));
    const startTimeout = setTimeout(async () => {
      if (started || attemptAbort.signal.aborted) return;
      try {
        if (await this.hasDownloadStartedOnDiskAsync(dest)) {
          markStarted();
          return;
        }
      } catch {}
      attemptTimedOut = true;
      try {
        attemptAbort.abort();
      } catch {
        /* abort is idempotent */
      }
    }, startTimeoutMs);

    let success = false;
    let invalidMp4 = false;
    let toolFailureMessage: string | null = null;

    try {
      if (attemptAbort.signal.aborted) {
        success = false;
      } else if (link.server === 'PDrain') {
        let lastReportedPct = -1;
        success = await this.options.downloadService.downloadPixeldrain(
          link.url,
          dest,
          (progress) => {
            markStarted();
            const pct = Math.round(progress * 100);
            callbacks.onProgress({
              progress,
              progressLog: pct !== lastReportedPct ? `   -> EP ${episode} * PDrain * ${pct}%` : undefined,
            });
            if (pct !== lastReportedPct) lastReportedPct = pct;
            callbacks.updateTray(`Descargando ${item.animeTitle} - EP ${episode} (${pct}%)`);
          },
          attemptAbort.signal,
        );
      } else if (link.server === 'Mega') {
        let lastReportedPctMega = -1;
        if (attemptAbort.signal.aborted) {
          success = false;
        } else {
          success = await this.options.downloadService.downloadMega(
            link.url,
            dest,
            (progress) => {
              markStarted();
              const pct = Math.round(progress * 100);
              if (pct === lastReportedPctMega) {
                callbacks.updateTray(`Descargando ${item.animeTitle} - EP ${episode} (${pct}%)`);
                return;
              }
              lastReportedPctMega = pct;
              callbacks.onProgress({ progress, progressLog: `   -> EP ${episode} * Mega * ${pct}%` });
              callbacks.updateTray(`Descargando ${item.animeTitle} - EP ${episode} (${pct}%)`);
            },
            attemptAbort.signal,
          );
        }
      } else if (link.server === 'Mediafire') {
        let lastReportedPct = -1;
        if (attemptAbort.signal.aborted) {
          success = false;
        } else {
          success = await this.options.downloadService.downloadMediafire(
            link.url,
            dest,
            (progress) => {
              markStarted();
              const pct = Math.round(progress * 100);
              callbacks.onProgress({
                progress,
                progressLog: pct !== lastReportedPct ? `   -> EP ${episode} * Mediafire * ${pct}%` : undefined,
              });
              if (pct !== lastReportedPct) lastReportedPct = pct;
              callbacks.updateTray(`Descargando ${item.animeTitle} - EP ${episode} (${pct}%)`);
            },
            attemptAbort.signal,
          );
        }
      } else {
        let hardcodedFragments = 16;
        if (link.server === 'HLS') {
          hardcodedFragments = 8;
        } else if (link.server.toLowerCase().includes('streamwish')) {
          hardcodedFragments = 8;
        } else if (link.server.toLowerCase().includes('filemoon')) {
          hardcodedFragments = 12;
        }
        const concurrentFragments = hardcodedFragments;

        const extraArgs = ['--buffer-size', YTDLP_BUFFER_SIZE];
        extraArgs.push('--retries', String(dl.retries));
        extraArgs.push('--fragment-retries', String(dl.retries));
        extraArgs.push('--socket-timeout', String(dl.socketTimeout));
        extraArgs.push('--retry-sleep', 'linear=1::2');
        extraArgs.push('--retry-sleep', 'fragment:exp=1:20');
        extraArgs.push('--extractor-retries', '3');
        let downloadUrl = link.url;
        if (link.server === 'HLS') {
          downloadUrl = resolveHlsPlaybackUrl(link.url);
          extraArgs.push('--hls-use-mpegts');
          // Falla en voz alta si un fragmento es irrecuperable: evita colar
          // un mp4 incompleto como exito y dispara el rescate a Mega.
          extraArgs.push('--abort-on-unavailable-fragments');
          extraArgs.push('--downloader', 'm3u8:native');
          extraArgs.push('--user-agent', this.options.userAgent);
          extraArgs.push('--referer', this.options.hlsPlayerReferer);
          extraArgs.push('--add-headers', 'Sec-Fetch-Dest: empty');
          extraArgs.push('--add-headers', 'Sec-Fetch-Mode: cors');
          extraArgs.push('--add-headers', 'Sec-Fetch-Site: same-origin');
        }
        if (link.server === 'MP4Upload') {
          downloadUrl = normalizeMp4UploadUrl(downloadUrl);
          extraArgs.push('--referer', 'https://www.mp4upload.com/');
          extraArgs.push('--user-agent', this.options.userAgent);
        }

        const cacheDir = path.join(path.dirname(dest), '.cache');
        const partialYtdl = path.join(cacheDir, path.basename(dest) + '.ytdl');
        const partialPart = path.join(cacheDir, path.basename(dest) + '.part');
        const hasPartial = link.server !== 'HLS' && (fs.existsSync(partialYtdl) || fs.existsSync(partialPart));
        if (!dl.allowContinue && hasPartial) {
          for (const stale of [partialYtdl, partialPart]) {
            try {
              if (fs.existsSync(stale)) fs.unlinkSync(stale);
            } catch {}
          }
        } else if (dl.allowContinue && hasPartial) {
          extraArgs.push('--continue');
        }

        let lastReportedMsg: string | number = -1;
        callbacks.updateTray(`Descargando ${item.animeTitle} - EP ${episode}...`);
        const ytdlpResult = await this.options.downloadService.downloadYtdlpCustom(
          downloadUrl,
          dest,
          concurrentFragments,
          attemptAbort.signal,
          extraArgs,
          (progress, status) => {
            markStarted();
            const pct = Math.round(progress * 100);
            const statusText = status ? status : `${pct}%`;
            const logMsg = status
              ? `   -> EP ${episode} * ${link.server} * ${status}`
              : `   -> EP ${episode} * ${link.server} * ${pct}%`;
            callbacks.onProgress({
              progress,
              status,
              progressLog: logMsg !== lastReportedMsg ? logMsg : undefined,
            });
            lastReportedMsg = logMsg;
            callbacks.updateTray(`Descargando ${item.animeTitle} - EP ${episode} (${statusText})`);
          },
          this.options.getRuntimeTools(),
        );
        success = ytdlpResult.ok;
        if (!success) {
          toolFailureMessage =
            ytdlpResult.error || 'Herramienta yt-dlp local no encontrada. Verifica tools/win/yt-dlp.exe.';
        }
      }

      if (success) {
        const mp4Ready = await this.ensureEpisodeMp4FileWithSnapshotAsync(dest, filesBeforeAttempt);
        if (!mp4Ready) {
          success = false;
          invalidMp4 = true;
          this.options.log(
            `WARN  "${link.server}" reporto exito, pero no quedo archivo .mp4 valido. Probando siguiente...`,
            'warn',
          );
        } else if (dl.cleanCacheOnComplete) {
          this.cleanYtdlpCacheForEpisode(dest);
        }
      }
    } finally {
      clearTimeout(startTimeout);
      parentSignal.removeEventListener('abort', onParentAbort);
      if (this.activeAttempts.get(key) === attemptAbort) this.activeAttempts.delete(key);
    }

    return {
      success,
      aborted: attemptAbort.signal.aborted,
      parentAborted: parentSignal.aborted,
      skipRequested: (this.skipEpochs.get(key) || 0) > startSkipEpoch,
      attemptTimedOut,
      invalidMp4,
      toolFailureMessage,
      started,
    };
  }

  cleanEpisodeTemps(destPath: string): void {
    try {
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      if (fs.existsSync(destPath + '.part')) fs.unlinkSync(destPath + '.part');
      if (fs.existsSync(destPath + '.ytdl')) fs.unlinkSync(destPath + '.ytdl');
      this.options.log(`[CLEAN] Limpieza agresiva: Temporales eliminados para ${path.basename(destPath)}`, 'info');
    } catch (error) {
      this.options.log(`WARN ï¸ Error limpiando temporales de ${path.basename(destPath)}: ${error}`, 'warn');
    }
  }

  cleanYtdlpCacheForEpisode(destPath: string): void {
    const cacheDir = path.join(path.dirname(destPath), '.cache');
    if (!fs.existsSync(cacheDir)) return;
    const baseName = path.basename(destPath);
    const files = [baseName, baseName + '.part', baseName + '.ytdl'];
    for (const file of files) {
      const filePath = path.join(cacheDir, file);
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (error) {
        this.options.logError(`No se pudo eliminar temporal ${filePath}: ${error}`);
      }
    }
  }

  private hasDownloadStartedOnDisk(destPath: string): boolean {
    if (this.isExistingFile(destPath)) return true;
    if (this.isExistingFile(`${destPath}.part`)) return true;
    if (this.isExistingFile(`${destPath}.ytdl`)) return true;
    const cacheDir = path.join(path.dirname(destPath), '.cache');
    const cachePath = path.join(cacheDir, path.basename(destPath));
    if (this.isExistingFile(cachePath)) return true;
    if (this.isExistingFile(`${cachePath}.part`)) return true;
    if (this.isExistingFile(`${cachePath}.ytdl`)) return true;
    // Fallback compatibilidad
    if (this.getFileSizeSafe(destPath) > 0) return true;
    if (this.getFileSizeSafe(`${destPath}.part`) > 0) return true;
    if (this.getFileSizeSafe(`${destPath}.ytdl`) > 0) return true;
    if (this.getFileSizeSafe(cachePath) > 0) return true;
    if (this.getFileSizeSafe(`${cachePath}.part`) > 0) return true;
    if (this.getFileSizeSafe(`${cachePath}.ytdl`) > 0) return true;
    return false;
  }

  private isExistingFile(filePath: string): boolean {
    try {
      return fs.statSync(filePath).isFile();
    } catch {
      return false;
    }
  }

  private getFileSizeSafe(filePath: string): number {
    try {
      const stats = fs.statSync(filePath);
      return stats.isFile() ? stats.size : 0;
    } catch {
      return 0;
    }
  }

  private isRegularFileWithContent(filePath: string): boolean {
    return this.getFileSizeSafe(filePath) > 0;
  }

  private snapshotStableFiles(dirPath: string): Map<string, number> {
    const out = new Map<string, number>();
    try {
      for (const name of fs.readdirSync(dirPath)) {
        if (name.endsWith('.part') || name.endsWith('.ytdl')) continue;
        const fullPath = path.join(dirPath, name);
        if (!fs.statSync(fullPath).isFile()) continue;
        const size = this.getFileSizeSafe(fullPath);
        if (size > 0) out.set(name, size);
      }
    } catch (error) {
      this.options.logError(`No se pudo inspeccionar ${dirPath}: ${error}`);
    }
    return out;
  }

  private ensureEpisodeMp4FileWithSnapshot(destPath: string, before: Map<string, number>): boolean {
    if (this.ensureEpisodeMp4File(destPath)) return true;

    try {
      const dir = path.dirname(destPath);
      const now = this.snapshotStableFiles(dir);
      const candidates: Array<{ name: string; fullPath: string; size: number }> = [];
      for (const [name, size] of now.entries()) {
        const previousSize = before.get(name) || 0;
        if ((!before.has(name) && size <= 0) || (before.has(name) && size <= previousSize)) continue;
        if (name === path.basename(destPath)) continue;
        const extension = path.extname(name).toLowerCase();
        if (!['.mp4', '.mkv', '.avi', '.flv', '.webm'].includes(extension)) continue;
        candidates.push({ name, fullPath: path.join(dir, name), size });
      }
      candidates.sort((a, b) => b.size - a.size);
      if (candidates.length > 0) {
        fs.renameSync(candidates[0].fullPath, destPath);
        return fs.existsSync(destPath) && this.getFileSizeSafe(destPath) > 0;
      }
    } catch (error) {
      this.options.logError(`No se pudo completar la deteccion de un MP4 en ${destPath}: ${error}`);
    }
    return false;
  }

  private ensureEpisodeMp4File(destPath: string): boolean {
    if (fs.existsSync(destPath) && this.getFileSizeSafe(destPath) > 0) return true;
    try {
      const dir = path.dirname(destPath);
      const fileName = path.basename(destPath);
      const baseName = fileName.replace(/\.mp4$/i, '');
      const exactNoExt = path.join(dir, baseName);
      if (fs.existsSync(exactNoExt) && this.getFileSizeSafe(exactNoExt) > 0) {
        fs.renameSync(exactNoExt, destPath);
        return fs.existsSync(destPath) && this.getFileSizeSafe(destPath) > 0;
      }
      const candidates = fs
        .readdirSync(dir)
        .filter((name) => {
          if (name === fileName || !name.startsWith(baseName)) return false;
          if (name.endsWith('.part') || name.endsWith('.ytdl')) return false;
          const extension = path.extname(name).toLowerCase();
          if (!['.mp4', '.mkv', '.avi', '.flv', '.webm'].includes(extension)) return false;
          return this.getFileSizeSafe(path.join(dir, name)) > 0;
        })
        .map((name) => ({ name, fullPath: path.join(dir, name), size: this.getFileSizeSafe(path.join(dir, name)) }))
        .sort((a, b) => b.size - a.size);
      if (candidates.length > 0) {
        fs.renameSync(candidates[0].fullPath, destPath);
        return fs.existsSync(destPath) && this.getFileSizeSafe(destPath) > 0;
      }
    } catch (error) {
      this.options.logError(`No se pudo normalizar el archivo de episodio ${destPath}: ${error}`);
    }
    return false;
  }

  // Variantes asíncronas — semántica: existencia == iniciado (mp4upload lento), no size>0
  async hasDownloadStartedOnDiskAsync(destPath: string): Promise<boolean> {
    const cacheDir = path.join(path.dirname(destPath), '.cache');
    const cachePath = path.join(cacheDir, path.basename(destPath));
    const candidates = [
      destPath,
      `${destPath}.part`,
      `${destPath}.ytdl`,
      cachePath,
      `${cachePath}.part`,
      `${cachePath}.ytdl`,
    ];
    for (const p of candidates) {
      try {
        const st = await fsp.stat(p);
        if (st.isFile()) return true;
      } catch {
        /* no existe */
      }
    }
    return false;
  }

  private async snapshotStableFilesAsync(dirPath: string): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    try {
      const names = await fsp.readdir(dirPath);
      const filtered = names.filter((n) => !n.endsWith('.part') && !n.endsWith('.ytdl'));
      const BATCH_SIZE = 16;
      for (let batchStart = 0; batchStart < filtered.length; batchStart += BATCH_SIZE) {
        const chunk = filtered.slice(batchStart, batchStart + BATCH_SIZE);
        const results = await Promise.all(
          chunk.map(async (name) => {
            const fullPath = path.join(dirPath, name);
            try {
              const st = await fsp.stat(fullPath);
              if (st.isFile() && st.size > 0) return { name, size: st.size } as const;
            } catch {}
            return null;
          }),
        );
        for (const r of results) if (r) out.set(r.name, r.size);
      }
    } catch (error) {
      this.options.logError(`No se pudo inspeccionar ${dirPath}: ${error}`);
    }
    return out;
  }

  private async ensureEpisodeMp4FileWithSnapshotAsync(destPath: string, before: Map<string, number>): Promise<boolean> {
    if (await this.ensureEpisodeMp4FileAsync(destPath)) return true;
    try {
      const dir = path.dirname(destPath);
      const now = await this.snapshotStableFilesAsync(dir);
      const candidates: Array<{ name: string; fullPath: string; size: number }> = [];
      for (const [name, size] of now.entries()) {
        const previousSize = before.get(name) || 0;
        if ((!before.has(name) && size <= 0) || (before.has(name) && size <= previousSize)) continue;
        if (name === path.basename(destPath)) continue;
        const extension = path.extname(name).toLowerCase();
        if (!['.mp4', '.mkv', '.avi', '.flv', '.webm'].includes(extension)) continue;
        candidates.push({ name, fullPath: path.join(dir, name), size });
      }
      candidates.sort((a, b) => b.size - a.size);
      if (candidates.length > 0) {
        await fsp.rename(candidates[0].fullPath, destPath);
        try {
          const st = await fsp.stat(destPath);
          return st.isFile() && st.size > 0;
        } catch {
          return false;
        }
      }
    } catch (error) {
      this.options.logError(`No se pudo completar la deteccion de un MP4 en ${destPath}: ${error}`);
    }
    return false;
  }

  private async ensureEpisodeMp4FileAsync(destPath: string): Promise<boolean> {
    try {
      const st = await fsp.stat(destPath);
      if (st.isFile() && st.size > 0) return true;
    } catch {}
    try {
      const dir = path.dirname(destPath);
      const fileName = path.basename(destPath);
      const baseName = fileName.replace(/\.mp4$/i, '');
      const exactNoExt = path.join(dir, baseName);
      try {
        const st = await fsp.stat(exactNoExt);
        if (st.isFile() && st.size > 0) {
          await fsp.rename(exactNoExt, destPath);
          const st2 = await fsp.stat(destPath);
          return st2.isFile() && st2.size > 0;
        }
      } catch {}
      const names = await fsp.readdir(dir);
      const candidates: Array<{ name: string; fullPath: string; size: number }> = [];
      for (const name of names) {
        if (name === fileName || !name.startsWith(baseName)) continue;
        if (name.endsWith('.part') || name.endsWith('.ytdl')) continue;
        const extension = path.extname(name).toLowerCase();
        if (!['.mp4', '.mkv', '.avi', '.flv', '.webm'].includes(extension)) continue;
        try {
          const st = await fsp.stat(path.join(dir, name));
          if (st.isFile() && st.size > 0) candidates.push({ name, fullPath: path.join(dir, name), size: st.size });
        } catch {}
      }
      candidates.sort((a, b) => b.size - a.size);
      if (candidates.length > 0) {
        await fsp.rename(candidates[0].fullPath, destPath);
        const st = await fsp.stat(destPath);
        return st.isFile() && st.size > 0;
      }
    } catch (error) {
      this.options.logError(`No se pudo normalizar el archivo de episodio ${destPath}: ${error}`);
    }
    return false;
  }
}
