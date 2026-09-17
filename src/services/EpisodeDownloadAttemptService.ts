import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import type { DownloadService, FfmpegRuntimeTools } from './DownloadService';
import { megaResumeFiles } from './DownloadService';
import type { ProviderDownloadLink, QueueItem } from '../types/queue';
import type { DownloadSettings } from '../types/settings';
import { normalizeDownloadSettings } from '../utils/downloadSettings';
import type { DownloadEngine, EngineProgress } from './downloads/downloadContracts';
import { createDefaultDownloadEngines, findDownloadEngine } from './downloads/downloadEngines';
import type { Mp4UploadResolveFn } from './Mp4UploadResolver';
import { noopScopedLogger, type ScopedLogger } from './AppLogger';

export interface EpisodeAttemptProgress {
  progress: number;
  status?: string;
  progressLog?: string;
  // Fase HLS: solo la emite el descargador nativo (resto: undefined).
  phase?: 'downloading' | 'assembling';
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
  getFfmpegTools: () => FfmpegRuntimeTools;
  userAgent: string;
  hlsPlayerReferer: string;
  log: (message: string, type?: 'info' | 'success' | 'error' | 'warn') => void;
  logError: (error: unknown) => void;
  getDownloadSettings?: () => DownloadSettings | undefined;
  resolveMp4UploadDirect?: Mp4UploadResolveFn;
  // Fichero de sesión con contexto (provider/queue/ep/server), sin URLs ni rutas.
  fileLog?: ScopedLogger;
  // Opcional por compatibilidad: por defecto se construye desde estas opciones.
  engines?: DownloadEngine[];
}

const START_TIMEOUT_MS = 90_000;

export function isSameStemCandidate(destFileName: string, candidateName: string): boolean {
  if (!destFileName || !candidateName) return false;
  if (candidateName.endsWith('.part') || candidateName.endsWith('.ytdl')) return false;
  const base = destFileName.replace(/\.mp4$/i, '');
  if (candidateName === destFileName || candidateName === base) return true;
  if (!candidateName.startsWith(base)) return false;
  return candidateName[base.length] === '.';
}

export class EpisodeDownloadAttemptService {
  private readonly activeAttempts = new Map<string, AbortController>();
  private readonly skipEpochs = new Map<string, number>();
  private readonly engines: DownloadEngine[];

  constructor(private readonly options: EpisodeDownloadAttemptOptions) {
    this.engines =
      options.engines ??
      createDefaultDownloadEngines({
        downloadService: options.downloadService,
        getFfmpegTools: options.getFfmpegTools,
        userAgent: options.userAgent,
        hlsPlayerReferer: options.hlsPlayerReferer,
        resolveMp4UploadDirect: options.resolveMp4UploadDirect,
      });
  }

  private attemptKey(itemId: string, episode: number): string {
    return `${itemId}:${episode}`;
  }

  private get fileLog(): ScopedLogger {
    return this.options.fileLog ?? noopScopedLogger;
  }

  private attemptContext(
    item: QueueItem,
    episode: number,
    server: string,
  ): { provider?: string; queueId: string; episode: number; server: string } {
    return {
      ...(item.providerId ? { provider: String(item.providerId) } : {}),
      queueId: item.id,
      episode,
      server: String(server || ''),
    };
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

  // Salto acotado al item: solo aborta EPs de ese item, sin contaminar otros.
  skipItem(itemId: string): boolean {
    if (!itemId) return false;
    const prefix = `${itemId}:`;
    const targets = new Set<string>();
    for (const key of Array.from(this.skipEpochs.keys())) {
      if (key === itemId || key.startsWith(prefix)) targets.add(key);
    }
    for (const key of Array.from(this.activeAttempts.keys())) {
      if (key === itemId || key.startsWith(prefix)) targets.add(key);
    }
    if (targets.size === 0) return false;
    let aborted = false;
    for (const key of targets) {
      this.skipEpochs.set(key, (this.skipEpochs.get(key) || 0) + 1);
      const controller = this.activeAttempts.get(key);
      if (controller) {
        try {
          controller.abort();
          aborted = true;
        } catch {
          aborted = true;
        }
      }
    }
    // Solo éxito real si se abortó un intento en vuelo (paridad con skipEpisode).
    return aborted;
  }

  // Limpieza de épocas de un item terminal/eliminado: evita fuga por IDs únicos.
  forgetItem(itemId: string): void {
    if (!itemId) return;
    const prefix = `${itemId}:`;
    for (const key of Array.from(this.skipEpochs.keys())) {
      if (key === itemId || key.startsWith(prefix)) this.skipEpochs.delete(key);
    }
  }

  // Limpieza por EP finalizado (ok/fail/cancel): su época ya no se necesita.
  forgetEpisode(itemId: string, episode: number): void {
    if (!itemId || !Number.isInteger(episode)) return;
    this.skipEpochs.delete(this.attemptKey(itemId, episode));
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

  private async purgeMegaResumeFiles(destPath: string): Promise<void> {
    const { partial, sidecar } = megaResumeFiles(path.join(path.dirname(destPath), '.cache'), path.basename(destPath));
    await Promise.all([fsp.rm(partial, { force: true }), fsp.rm(sidecar, { force: true })]).catch(() => undefined);
  }

  private async purgeDirectResumeFiles(destPath: string): Promise<void> {
    const base = path.join(path.dirname(destPath), '.cache', path.basename(destPath));
    await Promise.all([fsp.rm(base, { force: true }), fsp.rm(`${base}.direct.json`, { force: true })]).catch(
      () => undefined,
    );
  }

  private async purgeHlsResumeFiles(destPath: string): Promise<void> {
    const cacheDir = path.join(path.dirname(destPath), '.cache');
    const prefix = `${path.basename(destPath)}.hls-`;
    try {
      const names = await fsp.readdir(cacheDir);
      await Promise.all(
        names
          .filter((name) => name.startsWith(prefix))
          .map((name) => fsp.rm(path.join(cacheDir, name), { force: true }).catch(() => undefined)),
      );
    } catch {
      /* purga best-effort */
    }
    await fsp.rm(path.join(cacheDir, `${path.basename(destPath)}.hls.json`), { force: true }).catch(() => undefined);
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
      // Un intento = un engine. Sin dispatch por servidor: el registry resuelve
      // el engine por la fuente y el engine delega en la implementación existente.
      const engine = findDownloadEngine(this.engines, link);
      if (!attemptAbort.signal.aborted && engine) {
        if (!dl.allowContinue) await this.purgeResumeForServer(link.server, dest);
        callbacks.updateTray(`Descargando ${item.animeTitle} - EP ${episode}...`);
        const progressState = { lastPct: -1 };
        const engineResult = await engine.download(link, {
          item,
          episode,
          dest,
          signal: attemptAbort.signal,
          settings: dl,
          onProgress: (engineProgress) => {
            markStarted();
            this.reportEngineProgress(item, episode, link.server, progressState, callbacks, engineProgress);
          },
        });
        success = engineResult.ok;
        if (!success && !attemptAbort.signal.aborted && engineResult.error) {
          toolFailureMessage = engineResult.error;
        }
      } else if (!attemptAbort.signal.aborted) {
        // Defensa en profundidad: la allowlist de main ya filtra servidores
        // no canónicos antes de llegar aquí.
        toolFailureMessage = `Servidor no soportado: ${link.server}`;
        this.fileLog.warn(toolFailureMessage, this.attemptContext(item, episode, link.server));
      }

      if (success) {
        const mp4Ready = await this.ensureEpisodeMp4FileWithSnapshotAsync(dest, filesBeforeAttempt);
        if (!mp4Ready) {
          success = false;
          invalidMp4 = true;
          if (link.server === 'Mega') await this.purgeMegaResumeFiles(dest);
          this.fileLog.warn(
            `"${link.server}" reportó éxito sin archivo válido, se prueba el siguiente.`,
            this.attemptContext(item, episode, link.server),
          );
          this.options.log(
            `WARN "${link.server}" reporto exito, pero no quedo archivo .mp4 valido. Probando siguiente...`,
            'warn',
          );
        } else if (dl.cleanCacheOnComplete) {
          await this.cleanEpisodeCacheForEpisode(dest);
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

  // Purga de resume por tipo de fuente cuando allowContinue=false.
  // Mapeo histórico: Mega → mega, HLS → hls, resto (Mediafire/MP4Upload) → directo.
  private purgeResumeForServer(server: string, destPath: string): Promise<void> {
    if (server === 'HLS') return this.purgeHlsResumeFiles(destPath);
    if (server === 'Mega') return this.purgeMegaResumeFiles(destPath);
    return this.purgeDirectResumeFiles(destPath);
  }

  // Mapeo único de progreso crudo del engine → callbacks del attempt.
  // Conserva el matiz histórico de Mega (sin onProgress si no cambia el %);
  // el throttle de QueueStore coalescea el resto, sin cambio observable.
  private reportEngineProgress(
    item: QueueItem,
    episode: number,
    server: string,
    state: { lastPct: number },
    callbacks: EpisodeAttemptCallbacks,
    engineProgress: EngineProgress,
  ): void {
    const pct = Math.round(engineProgress.fraction01 * 100);
    const changed = pct !== state.lastPct;
    if (changed || server !== 'Mega') {
      callbacks.onProgress({
        progress: engineProgress.fraction01,
        progressLog: changed ? `   -> EP ${episode} * ${server} * ${pct}%` : undefined,
        ...(engineProgress.phase ? { phase: engineProgress.phase } : {}),
      });
    }
    if (changed) state.lastPct = pct;
    callbacks.updateTray(`Descargando ${item.animeTitle} - EP ${episode} (${pct}%)`);
  }

  async cleanEpisodeTemps(destPath: string): Promise<void> {
    const cacheBase = path.join(path.dirname(destPath), '.cache', path.basename(destPath));
    const results = await Promise.allSettled([
      fsp.rm(destPath, { force: true }),
      fsp.rm(destPath + '.part', { force: true }),
      fsp.rm(destPath + '.ytdl', { force: true }),
      fsp.rm(cacheBase, { force: true }),
      fsp.rm(cacheBase + '.part', { force: true }),
      fsp.rm(cacheBase + '.direct.json', { force: true }),
      fsp.rm(cacheBase + '.mega.part', { force: true }),
      fsp.rm(cacheBase + '.mega.json', { force: true }),
    ]);
    try {
      const cacheDir = path.dirname(cacheBase);
      const names = await fsp.readdir(cacheDir);
      const prefix = `${path.basename(destPath)}.hls-`;
      await Promise.all(
        names
          .filter((name) => name.startsWith(prefix))
          .map((name) => fsp.rm(path.join(cacheDir, name), { force: true }).catch(() => undefined)),
      );
    } catch {
      /* purga HLS best-effort */
    }
    const failure = results.find((r) => r.status === 'rejected');
    if (failure) {
      this.options.log(
        `WARN Error limpiando temporales de ${path.basename(destPath)}: ${(failure as PromiseRejectedResult).reason}`,
        'warn',
      );
    } else {
      this.options.log(`[CLEAN] Limpieza agresiva: Temporales eliminados para ${path.basename(destPath)}`, 'info');
    }
  }

  async cleanEpisodeCacheForEpisode(destPath: string): Promise<void> {
    const cacheDir = path.join(path.dirname(destPath), '.cache');
    try {
      await fsp.stat(cacheDir);
    } catch {
      return;
    }
    const baseName = path.basename(destPath);
    const files = [
      baseName,
      baseName + '.part',
      baseName + '.direct.json',
      baseName + '.mega.part',
      baseName + '.mega.json',
    ];
    await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(cacheDir, file);
        try {
          await fsp.rm(filePath, { force: true });
        } catch (error) {
          this.options.logError(`No se pudo eliminar temporal ${filePath}: ${error}`);
        }
      }),
    );
    try {
      const names = await fsp.readdir(cacheDir);
      const prefix = `${baseName}.hls-`;
      await Promise.all(
        names
          .filter((name) => name.startsWith(prefix))
          .map((name) => fsp.rm(path.join(cacheDir, name), { force: true }).catch(() => undefined)),
      );
    } catch (error) {
      this.options.logError(`No se pudo purgar temporales HLS de ${cacheDir}: ${error}`);
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

  // Variantes asíncronas — semántica: existencia == iniciado (mp4upload lento), no size>0
  async hasDownloadStartedOnDiskAsync(destPath: string): Promise<boolean> {
    const cacheDir = path.join(path.dirname(destPath), '.cache');
    const cachePath = path.join(cacheDir, path.basename(destPath));
    const candidates = [destPath, `${destPath}.part`, cachePath, `${cachePath}.part`, `${cachePath}.mega.part`];
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
        const destFileName = path.basename(destPath);
        if (!isSameStemCandidate(destFileName, name)) continue;
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
        if (name === fileName) continue;
        if (!isSameStemCandidate(fileName, name)) continue;
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
