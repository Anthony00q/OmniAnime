import { execFile } from 'child_process';
import axios from 'axios';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import * as megajs from 'megajs';
import { normalizeMegaUrl } from '../utils/serverUtils';
import { noopScopedLogger, type ScopedLogger } from './AppLogger';
import { clampDirectConnections, downloadDirectRanged, probeDirectRangeSupport } from './DirectRangedDownloader';

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 32 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 32 });

const DIRECT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const DEFAULT_DOWNLOAD_REFERER = 'https://animeav1.com/';

export interface MegaDownloadStream extends NodeJS.EventEmitter {
  pipe<T extends NodeJS.WritableStream>(destination: T): T;
  destroy(error?: Error): void;
}

export interface MegaFileLike {
  size?: number;
  loadAttributes(): Promise<unknown>;
  download(options: {
    start: number;
    maxConnections: number;
    initialChunkSize: number;
    maxChunkSize: number;
  }): MegaDownloadStream;
}

export type MegaFileFactory = (url: string) => MegaFileLike;

export function megaResumeFiles(cacheDir: string, fileName: string): { partial: string; sidecar: string } {
  const partial = path.join(cacheDir, `${fileName}.mega.part`);
  return { partial, sidecar: path.join(cacheDir, `${fileName}.mega.json`) };
}

export interface MegaResumeState {
  url: string;
  size: number;
  savedAt: number;
}

export function parseMegaResumeState(raw: unknown): MegaResumeState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.url !== 'string' || !record.url) return null;
  if (typeof record.size !== 'number' || !Number.isFinite(record.size) || record.size <= 0) return null;
  return {
    url: record.url,
    size: Math.floor(record.size),
    savedAt: typeof record.savedAt === 'number' && Number.isFinite(record.savedAt) ? record.savedAt : 0,
  };
}

export type MegaFailureKind = 'permanent' | 'quota' | 'transient';

export function classifyMegaError(error: unknown): MegaFailureKind {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'number' && Number.isInteger(code) && code < 0) return 'permanent';
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/Bandwidth limit|EOVERQUOTA|timeLimit/i.test(message)) return 'quota';
  if (
    /key isn't defined|Attributes could not be decrypted|Invalid URL|too few arguments|too many arguments|past the end of the file|folder download|EACCESS|EARGS/i.test(
      message,
    )
  ) {
    return 'permanent';
  }
  return 'transient';
}

const MAX_MEGA_ATTEMPTS = 3;

export interface AttemptProbe {
  onRetry?: () => void;
  onFirstByte?: () => void;
  onProgress?: (fraction01: number, totalBytes?: number) => void;
}

export type FfmpegRuntimeTools = {
  ffmpegDir?: string;
};

export class DownloadService {
  private activeControllers = new Set<AbortController>();
  private readonly logger: ScopedLogger;
  constructor(options?: { logger?: ScopedLogger }) {
    this.logger = options?.logger ?? noopScopedLogger;
  }

  abort() {
    for (const controller of Array.from(this.activeControllers)) {
      try {
        controller.abort();
      } catch {}
    }
    this.activeControllers.clear();
  }

  private trackController(controller: AbortController): void {
    this.activeControllers.add(controller);
  }

  private untrackController(controller: AbortController): void {
    this.activeControllers.delete(controller);
  }

  async downloadMediafire(
    url: string,
    dest: string,
    onProgress: (p: number) => void,
    signal?: AbortSignal,
    referer?: string,
    connections?: number,
  ): Promise<boolean> {
    const MAX_EXTRACT_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_EXTRACT_ATTEMPTS; attempt += 1) {
      if (signal?.aborted) return false;
      try {
        const { data } = await axios.get(url, {
          headers: {
            'User-Agent': DIRECT_USER_AGENT,
          },
          timeout: 10000,
          signal: signal as any,
        });
        const match =
          data.match(/href="((?:https?:\/\/)?download\d+\.mediafire\.com\/[^"]+)"/i) ||
          data.match(/id="downloadButton" href="([^"]+)"/i);

        if (!match || !match[1]) {
          this.logger.warn('mediafire: direct link not found');
          return false;
        }
        const directUrl = match[1];

        const pageReferer = typeof referer === 'string' && referer ? referer : DEFAULT_DOWNLOAD_REFERER;
        const ok = await this.downloadDirectAxios(directUrl, dest, onProgress, signal, pageReferer, connections);
        if (ok || signal?.aborted) return ok;
      } catch (e: any) {
        if (signal?.aborted || e?.name === 'AbortError' || axios.isCancel(e)) return false;
        this.logger.warn(`mediafire extract (intento ${attempt}/${MAX_EXTRACT_ATTEMPTS}): ${e.message}`);
      }
      if (attempt < MAX_EXTRACT_ATTEMPTS && !signal?.aborted) {
        await this.sleepAbortable(1000 * attempt, signal);
      }
    }
    return false;
  }

  private sleepAbortable(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.resolve();
    if (!signal) return new Promise((resolve) => setTimeout(resolve, ms));
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(timer);
        resolve();
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  async downloadDirectAxios(
    url: string,
    dest: string,
    onProgress: (p: number) => void,
    signal?: AbortSignal,
    referer?: string,
    connections?: number,
  ): Promise<boolean> {
    const directReferer = typeof referer === 'string' && referer ? referer : DEFAULT_DOWNLOAD_REFERER;
    if (clampDirectConnections(connections) > 1 && !signal?.aborted) {
      const rangedOk = await this.downloadDirectRangedOnce(url, dest, onProgress, signal, directReferer, connections);
      if (rangedOk || signal?.aborted) return rangedOk;
    }
    const MAX_DIRECT_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_DIRECT_ATTEMPTS; attempt += 1) {
      if (signal?.aborted) return false;
      const ok = await this.downloadDirectAxiosOnce(url, dest, onProgress, signal, directReferer);
      if (ok || signal?.aborted) return ok;
      if (attempt < MAX_DIRECT_ATTEMPTS) {
        await this.sleepAbortable(1000 * attempt, signal);
      }
    }
    return false;
  }

  // Rama multihilo opt-in (ajuste Conexiones por archivo 1-8): exige 206 real y
  // tamaño exacto; cualquier fallo cae al axios de 1 conexión en fresco.
  private async downloadDirectRangedOnce(
    url: string,
    dest: string,
    onProgress: (p: number) => void,
    signal?: AbortSignal,
    referer?: string,
    connections?: number,
  ): Promise<boolean> {
    const wanted = clampDirectConnections(connections);
    if (wanted <= 1 || signal?.aborted) return false;
    const destDir = path.dirname(dest);
    const cacheDir = path.join(destDir, '.cache');
    try {
      await fsp.mkdir(cacheDir, { recursive: true });
      if (process.platform === 'win32') {
        execFile('attrib', ['+h', cacheDir], { windowsHide: true }, () => {});
      }
    } catch {
      return false;
    }
    const tempPath = path.join(cacheDir, path.basename(dest));
    const probe = await probeDirectRangeSupport(url, {
      userAgent: DIRECT_USER_AGENT,
      referer: typeof referer === 'string' && referer ? referer : DEFAULT_DOWNLOAD_REFERER,
      signal,
    });
    if (!probe.supported || !probe.totalBytes || signal?.aborted) {
      await fsp.rm(tempPath, { force: true }).catch(() => undefined);
      return false;
    }
    const ok = await downloadDirectRanged(url, tempPath, probe.totalBytes, wanted, {
      userAgent: DIRECT_USER_AGENT,
      referer: typeof referer === 'string' && referer ? referer : DEFAULT_DOWNLOAD_REFERER,
      signal,
      onProgress,
    });
    if (!ok || signal?.aborted) {
      await fsp.rm(tempPath, { force: true }).catch(() => undefined);
      return false;
    }
    try {
      await fsp.unlink(dest).catch(() => {});
      await fsp.rename(tempPath, dest);
      const st = await fsp.stat(dest);
      if (st.isFile() && st.size === probe.totalBytes) return true;
    } catch {
      /* cae al axios de 1 conexión */
    }
    await fsp.rm(tempPath, { force: true }).catch(() => undefined);
    return false;
  }

  private async downloadDirectAxiosOnce(
    url: string,
    dest: string,
    onProgress: (p: number) => void,
    signal?: AbortSignal,
    referer?: string,
  ): Promise<boolean> {
    let writer: fs.WriteStream | null = null;
    let responseData: any = null;
    const internalController = new AbortController();
    this.trackController(internalController);

    const destDir = path.dirname(dest);
    const cacheDir = path.join(destDir, '.cache');
    try {
      await fsp.mkdir(cacheDir, { recursive: true });
      if (process.platform === 'win32') {
        execFile('attrib', ['+h', cacheDir], { windowsHide: true }, () => {});
      }
    } catch {}
    const tempDest = path.join(cacheDir, path.basename(dest));
    const sidecarDest = `${tempDest}.direct.json`;

    const freezeAndKill = () => {
      internalController.abort();

      if (responseData) {
        try {
          responseData.pause();
          responseData.unpipe();
          responseData.destroy();
        } catch {}
      }

      if (writer) {
        // end() sin destroy: vacía el buffer al temporal para retomar;
        // el finish ya resuelve false si hubo abort.
        try {
          writer.end();
        } catch {}
      }
    };

    if (signal?.aborted) {
      this.untrackController(internalController);
      return false;
    }

    const onExternalAbort = () => freezeAndKill();
    if (signal) signal.addEventListener('abort', onExternalAbort);

    const readResumeOffset = async (): Promise<number> => {
      try {
        const raw = await fsp.readFile(sidecarDest, 'utf8');
        const parsed = JSON.parse(raw) as { url?: unknown };
        if (!parsed || parsed.url !== url) return -1;
        const st = await fsp.stat(tempDest);
        return st.isFile() ? st.size : -1;
      } catch {
        return -1;
      }
    };
    const discardResume = async (): Promise<void> => {
      await fsp.rm(tempDest, { force: true }).catch(() => undefined);
      await fsp.rm(sidecarDest, { force: true }).catch(() => undefined);
    };

    try {
      // Resume por Range ligado a URL exacta: otra URL o temporal ajeno
      // arranca en fresco; el parcial se conserva al abortar para retomar.
      let offset = await readResumeOffset();
      if (offset < 0) {
        await discardResume();
        offset = 0;
      }
      if (offset === 0) {
        await fsp.writeFile(sidecarDest, JSON.stringify({ url })).catch(() => undefined);
      }
      const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
        httpAgent,
        httpsAgent,
        headers: {
          Referer: typeof referer === 'string' && referer ? referer : DEFAULT_DOWNLOAD_REFERER,
          'User-Agent': DIRECT_USER_AGENT,
          'Accept-Encoding': 'identity',
          Connection: 'keep-alive',
          ...(offset > 0 ? { Range: `bytes=${offset}-` } : {}),
        },
        timeout: 60000,
        signal: internalController.signal as any,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        maxRedirects: 5,
        validateStatus: () => true,
      });

      if (signal?.aborted) {
        freezeAndKill();
        if (signal) signal.removeEventListener('abort', onExternalAbort);
        this.untrackController(internalController);
        return false;
      }

      const destroyResponse = () => {
        try {
          responseData = response.data;
          responseData?.destroy?.();
        } catch {}
      };
      if (offset > 0 && response.status !== 206) {
        // Sin Range (200) o rango no satisfacible (416): fresco en el
        // siguiente intento del bucle externo.
        destroyResponse();
        await discardResume();
        if (signal) signal.removeEventListener('abort', onExternalAbort);
        this.untrackController(internalController);
        return false;
      }
      if (response.status < 200 || response.status >= 300) {
        destroyResponse();
        if (signal) signal.removeEventListener('abort', onExternalAbort);
        this.untrackController(internalController);
        return false;
      }

      let totalLength = 0;
      if (response.status === 206) {
        const rangeMatch = String(response.headers['content-range'] || '').match(/\/(\d+)\s*$/);
        totalLength = rangeMatch ? parseInt(rangeMatch[1], 10) : 0;
      } else {
        const totalHeader = response.headers['content-length'];
        totalLength = totalHeader ? parseInt(totalHeader as string, 10) : 0;
      }
      if (!Number.isFinite(totalLength) || totalLength < 0) totalLength = 0;
      if (totalLength > 0 && offset > totalLength) {
        await discardResume();
        if (signal) signal.removeEventListener('abort', onExternalAbort);
        this.untrackController(internalController);
        return false;
      }

      responseData = response.data;
      let streamTimeout: NodeJS.Timeout | null = null;
      const resetStreamTimeout = () => {
        if (streamTimeout) clearTimeout(streamTimeout);
        streamTimeout = setTimeout(() => {
          this.logger.warn('pixeldrain stream stalled. Aborting.');
          freezeAndKill();
        }, 30000);
      };
      resetStreamTimeout();

      writer = fs.createWriteStream(tempDest, {
        flags: offset > 0 ? 'a' : 'w',
        highWaterMark: 1024 * 1024,
      });
      let downloadedLength = 0;

      // pipe() antes del listener propio: cada chunk se encola en el writer
      // antes de que el progreso pueda abortar; asi el end() de freezeAndKill
      // vacia todo lo contado y nunca hay write-after-end.
      responseData.pipe(writer!);

      responseData.on('data', (chunk: Buffer) => {
        resetStreamTimeout();
        if (signal?.aborted) {
          freezeAndKill();
          return;
        }
        downloadedLength += chunk.length;
        if (totalLength > 0) onProgress((offset + downloadedLength) / totalLength);
      });

      return new Promise((resolve) => {
        const finishCleanup = () => {
          if (streamTimeout) clearTimeout(streamTimeout);
          if (signal) signal.removeEventListener('abort', onExternalAbort);
          this.untrackController(internalController);
        };

        writer!.on('finish', async () => {
          finishCleanup();
          if (signal?.aborted) {
            resolve(false);
            return;
          }
          try {
            const finalStat = await fsp.stat(tempDest);
            if (totalLength > 0 && (!finalStat.isFile() || finalStat.size !== totalLength)) {
              resolve(false);
              return;
            }
            await fsp.unlink(dest).catch(() => {});
            await fsp.rename(tempDest, dest);
            const dst = await fsp.stat(dest);
            if (!dst.isFile() || dst.size <= 0) {
              resolve(false);
              return;
            }
            await fsp.rm(sidecarDest, { force: true }).catch(() => undefined);
            resolve(true);
          } catch (e) {
            this.logger.error(`pixeldrain rename: ${e}`);
            resolve(false);
          }
        });

        writer!.on('error', (err) => {
          finishCleanup();
          this.logger.error(`pixeldrain writer: ${err}`);
          resolve(false);
        });

        if (signal) {
          signal.addEventListener('abort', () => {
            finishCleanup();
            resolve(false);
          });
        }
      });
    } catch (e: any) {
      if (signal?.aborted || e.name === 'AbortError' || axios.isCancel(e)) {
        // Ya manejado por onExternalAbort
      } else {
        this.logger.error(`pixeldrain crítico: ${e.message}`);
      }
      if (signal) signal.removeEventListener('abort', onExternalAbort);
      this.untrackController(internalController);
      return false;
    }
  }

  async downloadMega(
    url: string,
    dest: string,
    onProgress?: (p: number) => void,
    signal?: AbortSignal,
    probe?: AttemptProbe,
    megaFileFactory?: MegaFileFactory,
  ): Promise<boolean> {
    const factory = megaFileFactory ?? ((u: string) => megajs.File.fromURL(u) as unknown as MegaFileLike);
    const normalizedUrl = normalizeMegaUrl(String(url || '').trim());

    const destDir = path.dirname(dest);
    const cacheDir = path.join(destDir, '.cache');
    try {
      await fsp.mkdir(cacheDir, { recursive: true });
      if (process.platform === 'win32') {
        execFile('attrib', ['+h', cacheDir], { windowsHide: true }, () => {});
      }
    } catch {}
    const { partial: tempDest, sidecar: sidecarPath } = megaResumeFiles(cacheDir, path.basename(dest));

    if (signal?.aborted) return false;

    const readResumeState = async (): Promise<{ partialSize: number; state: MegaResumeState | null }> => {
      let partialSize = 0;
      try {
        const st = await fsp.stat(tempDest);
        if (st.isFile()) partialSize = st.size;
      } catch {
        /* sin parcial */
      }
      let state: MegaResumeState | null = null;
      try {
        state = parseMegaResumeState(JSON.parse(await fsp.readFile(sidecarPath, 'utf8')));
      } catch {
        /* sin sidecar válido */
      }
      return { partialSize, state };
    };
    const purgeResume = async (): Promise<void> => {
      await Promise.all([fsp.rm(tempDest, { force: true }), fsp.rm(sidecarPath, { force: true })]).catch(
        () => undefined,
      );
    };

    for (let attempt = 1; attempt <= MAX_MEGA_ATTEMPTS; attempt += 1) {
      if (signal?.aborted) return false;
      if (attempt > 1) probe?.onRetry?.();
      try {
        let file: MegaFileLike;
        try {
          file = factory(normalizedUrl);
        } catch {
          return false;
        }
        const loadPromise = file.loadAttributes();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Mega load timeout')), 10_000),
        );
        const abortPromise = signal
          ? new Promise<never>((_, reject) => {
              if (signal.aborted) reject(new Error('Aborted'));
              else signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
            })
          : null;
        const racePromises: Promise<unknown>[] = [loadPromise, timeoutPromise];
        if (abortPromise) racePromises.push(abortPromise);
        await Promise.race(racePromises);
        if (signal?.aborted) return false;

        const totalLength = typeof file.size === 'number' && Number.isFinite(file.size) ? Math.floor(file.size) : 0;
        if (totalLength <= 0) return false;

        const { partialSize, state } = await readResumeState();
        const coherent =
          state !== null && state.url === normalizedUrl && state.size === totalLength && partialSize <= totalLength;
        if (coherent && partialSize === totalLength) {
          try {
            await fsp.unlink(dest).catch(() => {});
            await fsp.rename(tempDest, dest);
            await fsp.rm(sidecarPath, { force: true }).catch(() => undefined);
            return !signal?.aborted;
          } catch {
            await purgeResume();
          }
        } else {
          const startOffset = coherent && partialSize > 0 ? partialSize : 0;
          if (startOffset === 0) {
            await purgeResume();
            await fsp
              .writeFile(sidecarPath, JSON.stringify({ url: normalizedUrl, size: totalLength, savedAt: Date.now() }))
              .catch(() => undefined);
          }
          const outcome = await this.downloadMegaSlice(
            file,
            tempDest,
            dest,
            sidecarPath,
            startOffset,
            totalLength,
            onProgress,
            signal,
            probe,
          );
          if (outcome === 'completed') return !signal?.aborted;
          if (outcome === 'fatal' || signal?.aborted) return false;
        }
      } catch (e) {
        if (signal?.aborted) return false;
        const kind = classifyMegaError(e);
        if (kind === 'quota') {
          this.logger.warn('mega: cuota agotada (509); se prueba el siguiente servidor sin reintentos.');
          return false;
        }
        if (kind === 'permanent') {
          this.logger.warn(`mega permanente, sin reintento: ${(e as Error)?.message || e}`);
          return false;
        }
        this.logger.debug(`mega transitorio (intento ${attempt}/${MAX_MEGA_ATTEMPTS}): ${(e as Error)?.message || e}`);
      }
      if (attempt < MAX_MEGA_ATTEMPTS && !signal?.aborted) {
        await this.sleepAbortable(1000 * attempt, signal);
      }
    }
    return false;
  }

  private async downloadMegaSlice(
    file: MegaFileLike,
    tempDest: string,
    dest: string,
    sidecarPath: string,
    startOffset: number,
    totalLength: number,
    onProgress?: (p: number) => void,
    signal?: AbortSignal,
    probe?: AttemptProbe,
  ): Promise<'completed' | 'retry' | 'fatal'> {
    const internalController = new AbortController();
    this.trackController(internalController);
    let writer: fs.WriteStream | null = null;
    let readable: MegaDownloadStream | null = null;

    return await new Promise((resolve) => {
      let settled = false;
      const finish = (outcome: 'completed' | 'retry' | 'fatal') => {
        if (settled) return;
        settled = true;
        if (signal) signal.removeEventListener('abort', onExternalAbort);
        internalController.signal.removeEventListener('abort', onGlobalAbort);
        this.untrackController(internalController);
        resolve(outcome);
      };
      const onExternalAbort = () => {
        try {
          internalController.abort();
        } catch {
          /* abort is idempotent */
        }
        try {
          readable?.destroy();
        } catch {}
        try {
          writer?.destroy();
        } catch {}
        finish('retry');
      };
      const onGlobalAbort = () => {
        try {
          readable?.destroy();
        } catch {}
        try {
          writer?.destroy();
        } catch {}
        finish('retry');
      };
      if (signal) {
        if (signal.aborted) {
          this.untrackController(internalController);
          resolve('retry');
          return;
        }
        signal.addEventListener('abort', onExternalAbort, { once: true });
      }
      internalController.signal.addEventListener('abort', onGlobalAbort, { once: true });

      const fail = (error: unknown): void => {
        const kind = classifyMegaError(error);
        finish(kind === 'transient' ? 'retry' : 'fatal');
      };

      let activeWriter: fs.WriteStream;
      try {
        activeWriter = fs.createWriteStream(tempDest, { flags: 'a', highWaterMark: 1024 * 1024 });
      } catch {
        finish('retry');
        return;
      }
      writer = activeWriter;
      activeWriter.once('open', () => {
        void (async () => {
          const fdRaw = (activeWriter as unknown as { fd?: unknown }).fd;
          const fdStat =
            typeof fdRaw === 'number'
              ? await new Promise<fs.Stats | null>((resolveStat) =>
                  fs.fstat(fdRaw, (err, stats) => resolveStat(err ? null : stats)),
                )
              : null;
          if (!fdStat || !fdStat.isFile() || fdStat.size !== startOffset) {
            try {
              activeWriter.destroy();
            } catch {}
            finish('retry');
            return;
          }
          let readableInstance: MegaDownloadStream;
          try {
            readableInstance = file.download({
              start: startOffset,
              maxConnections: 6,
              initialChunkSize: 512 * 1024,
              maxChunkSize: 1024 * 1024,
            });
          } catch (e) {
            fail(e);
            return;
          }
          readable = readableInstance;
          let downloadedLength = 0;
          readable.on('data', (chunk: Buffer) => {
            downloadedLength += chunk.length;
            probe?.onFirstByte?.();
            const fraction = Math.min(1, (startOffset + downloadedLength) / totalLength);
            if (onProgress) onProgress(fraction);
            probe?.onProgress?.(fraction, totalLength);
          });
          readable.pipe(activeWriter);
          activeWriter.on('finish', () => {
            void (async () => {
              try {
                const st = await fsp.stat(tempDest);
                if (!st.isFile() || st.size !== totalLength) {
                  if (st.isFile() && st.size > totalLength) {
                    await Promise.all([fsp.rm(tempDest, { force: true }), fsp.rm(sidecarPath, { force: true })]).catch(
                      () => undefined,
                    );
                  }
                  finish('retry');
                  return;
                }
                await fsp.unlink(dest).catch(() => {});
                await fsp.rename(tempDest, dest);
                await fsp.rm(sidecarPath, { force: true }).catch(() => undefined);
              } catch {
                finish('retry');
                return;
              }
              finish('completed');
            })();
          });
          activeWriter.on('error', () => finish('retry'));
          readable.on('error', (error: unknown) => fail(error));
        })();
      });
      activeWriter.once('error', (error: unknown) => fail(error));
    });
  }
}
