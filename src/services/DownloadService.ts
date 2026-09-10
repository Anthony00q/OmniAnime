import { spawn, ChildProcess, execFile } from 'child_process';
import axios from 'axios';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import * as megajs from 'megajs';
import { normalizeMegaUrl } from '../utils/serverUtils';
import { terminateChildProcessTree } from '../utils/processUtils';
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

export type YtdlpRuntimeTools = {
  ytdlpPath: string;
  ffmpegDir?: string;
};

export type YtdlpDownloadResult = {
  ok: boolean;
  toolMissing?: boolean;
  error?: string;
  stderr?: string;
};

export class DownloadService {
  private activeControllers = new Set<AbortController>();
  private activeChildren = new Set<ChildProcess>();
  private cleanupTokens = new Map<string, number>();

  private forceKillProcess(child: ChildProcess) {
    terminateChildProcessTree(child);
  }

  abort() {
    for (const controller of Array.from(this.activeControllers)) {
      try {
        controller.abort();
      } catch {}
    }
    this.activeControllers.clear();
    for (const child of Array.from(this.activeChildren)) {
      this.forceKillProcess(child);
    }
    this.activeChildren.clear();
  }

  private trackController(controller: AbortController): void {
    this.activeControllers.add(controller);
  }

  private untrackController(controller: AbortController): void {
    this.activeControllers.delete(controller);
  }

  private trackChild(child: ChildProcess): void {
    this.activeChildren.add(child);
  }

  private untrackChild(child: ChildProcess): void {
    this.activeChildren.delete(child);
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
          console.error('Mediafire direct link not found');
          return false;
        }
        const directUrl = match[1];

        const pageReferer = typeof referer === 'string' && referer ? referer : DEFAULT_DOWNLOAD_REFERER;
        const ok = await this.downloadDirectAxios(directUrl, dest, onProgress, signal, pageReferer, connections);
        if (ok || signal?.aborted) return ok;
      } catch (e: any) {
        if (signal?.aborted || e?.name === 'AbortError' || axios.isCancel(e)) return false;
        console.error(`Error Mediafire extract (intento ${attempt}/${MAX_EXTRACT_ATTEMPTS}):`, e.message);
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
    const cleanupKey = path.resolve(dest).toLowerCase();
    const cleanupToken = (this.cleanupTokens.get(cleanupKey) || 0) + 1;
    this.cleanupTokens.set(cleanupKey, cleanupToken);

    const cleanupFiles = () => {
      setTimeout(async () => {
        if (this.cleanupTokens.get(cleanupKey) !== cleanupToken) return;
        try {
          await fsp.unlink(tempDest);
        } catch {}
      }, 300);
    };

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
        try {
          writer.end();
          writer.destroy();
        } catch {}
      }

      cleanupFiles();
    };

    if (signal?.aborted) {
      cleanupFiles();
      this.untrackController(internalController);
      return false;
    }

    const onExternalAbort = () => freezeAndKill();
    if (signal) signal.addEventListener('abort', onExternalAbort);

    try {
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
        },
        timeout: 60000,
        signal: internalController.signal as any,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        maxRedirects: 5,
      });

      if (signal?.aborted) {
        freezeAndKill();
        return false;
      }

      responseData = response.data;
      const totalHeader = response.headers['content-length'];
      const totalLength = totalHeader ? parseInt(totalHeader as string, 10) : 0;
      let downloadedLength = 0;

      let streamTimeout: NodeJS.Timeout | null = null;
      const resetStreamTimeout = () => {
        if (streamTimeout) clearTimeout(streamTimeout);
        streamTimeout = setTimeout(() => {
          console.warn('Pixeldrain stream stalled. Aborting.');
          freezeAndKill();
        }, 30000);
      };
      resetStreamTimeout();

      writer = fs.createWriteStream(tempDest, { highWaterMark: 1024 * 1024 });

      responseData.on('data', (chunk: Buffer) => {
        resetStreamTimeout();
        if (signal?.aborted) {
          freezeAndKill();
          return;
        }
        downloadedLength += chunk.length;
        if (totalLength > 0) onProgress(downloadedLength / totalLength);
      });

      return new Promise((resolve) => {
        const finishCleanup = () => {
          if (streamTimeout) clearTimeout(streamTimeout);
          if (signal) signal.removeEventListener('abort', onExternalAbort);
          this.untrackController(internalController);
        };

        responseData.pipe(writer!);

        writer!.on('finish', async () => {
          finishCleanup();
          if (!signal?.aborted) {
            try {
              await fsp.unlink(dest).catch(() => {});
              await fsp.rename(tempDest, dest);
            } catch (e) {
              console.error('Error renaming PDrain file:', e);
              cleanupFiles();
              resolve(false);
              return;
            }
          }
          resolve(!signal?.aborted);
        });

        writer!.on('error', (err) => {
          finishCleanup();
          console.error('Error en writer Pixeldrain:', err);
          cleanupFiles();
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
        console.error('Error crítico Pixeldrain:', e.message);
      }
      if (signal) signal.removeEventListener('abort', onExternalAbort);
      this.untrackController(internalController);
      cleanupFiles();
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
          console.error('Mega: cuota agotada (509); se prueba el siguiente servidor sin reintentos.');
          return false;
        }
        if (kind === 'permanent') {
          console.error(`Mega permanente, sin reintento: ${(e as Error)?.message || e}`);
          return false;
        }
        console.error(`Mega transitorio (intento ${attempt}/${MAX_MEGA_ATTEMPTS}): ${(e as Error)?.message || e}`);
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

  async downloadYtdlpCustom(
    url: string,
    dest: string,
    threads: number,
    signal?: AbortSignal,
    extraArgs: string[] = [],
    onProgress?: (p: number, status?: string) => void,
    tools?: YtdlpRuntimeTools,
  ): Promise<YtdlpDownloadResult> {
    if (signal?.aborted) {
      return { ok: false };
    }
    if (!tools?.ytdlpPath) {
      return {
        ok: false,
        toolMissing: true,
        error: 'Herramienta yt-dlp local no disponible. Verifica tools/win/yt-dlp.exe.',
      };
    }
    const runtimeTools = tools;

    const destDir = path.dirname(dest);
    const cacheDir = path.join(destDir, '.cache');
    try {
      await fsp.mkdir(cacheDir, { recursive: true });
      if (process.platform === 'win32') {
        execFile('attrib', ['+h', cacheDir], { windowsHide: true }, () => {});
      }
    } catch {}

    return new Promise((resolve) => {
      const tempDest = path.join(cacheDir, path.basename(dest));
      const cleanupTemp = () => {
        fsp.unlink(tempDest).catch(() => {});
        fsp.unlink(dest).catch(() => {});
      };

      const fallbackArgs: string[] = [];
      if (!extraArgs.includes('--buffer-size')) fallbackArgs.push('--buffer-size', '16M');
      if (!extraArgs.includes('--retries')) fallbackArgs.push('--retries', '10');
      if (!extraArgs.includes('--fragment-retries')) fallbackArgs.push('--fragment-retries', '10');
      if (!extraArgs.includes('--socket-timeout')) fallbackArgs.push('--socket-timeout', '30');
      if (!extraArgs.includes('--retry-sleep')) {
        fallbackArgs.push('--retry-sleep', 'linear=1::2', '--retry-sleep', 'fragment:exp=1:20');
      }
      if (!extraArgs.includes('--extractor-retries')) fallbackArgs.push('--extractor-retries', '3');
      const args = [
        '-o',
        tempDest,
        '--no-playlist',
        '--no-check-certificate',
        '--concurrent-fragments',
        threads.toString(),
        '--file-access-retries',
        '3',
        '--merge-output-format',
        'mp4',
        ...(runtimeTools.ffmpegDir ? ['--ffmpeg-location', runtimeTools.ffmpegDir] : []),
        ...fallbackArgs,
        ...extraArgs,
        url,
      ];

      const child = spawn(runtimeTools.ytdlpPath, args, {
        windowsHide: true,
        env: {
          ...process.env,
          PATH: runtimeTools.ffmpegDir
            ? `${runtimeTools.ffmpegDir}${path.delimiter}${process.env.PATH || ''}`
            : process.env.PATH,
        },
      });
      this.trackChild(child);

      let stderr = '';
      const STDERR_LIMIT = 20000;
      child.stderr?.on('data', (data: Buffer) => {
        if (stderr.length < STDERR_LIMIT) stderr += data.toString().slice(0, STDERR_LIMIT - stderr.length);
      });

      if (onProgress && child.stdout) {
        child.stdout.on('data', (data: Buffer) => {
          const text = data.toString();
          const match = text.match(/\[download\]\s+([\d.]+)%/);
          if (match && match[1]) {
            const pct = parseFloat(match[1]);
            if (!isNaN(pct)) {
              onProgress(pct / 100);
            }
          } else if (text.includes('[Merger]') || text.includes('[Fixup') || text.includes('[ffmpeg]')) {
            onProgress(0.999, 'Procesando video...');
          }
        });
      }

      let settled = false;
      let abortRequested = false;
      let abortFallback: NodeJS.Timeout | null = null;
      const finish = (result: YtdlpDownloadResult) => {
        if (settled) return;
        settled = true;
        if (abortFallback) clearTimeout(abortFallback);
        if (signal) signal.removeEventListener('abort', onAbort);
        this.untrackChild(child);
        resolve(result);
      };

      const onAbort = () => {
        if (settled || abortRequested) return;
        abortRequested = true;
        this.forceKillProcess(child);
        this.untrackChild(child);
        abortFallback = setTimeout(() => {
          cleanupTemp();
          finish({ ok: false });
        }, 5000);
      };

      if (signal) {
        signal.addEventListener('abort', onAbort);
      }

      child.on('close', async (code) => {
        if (signal) signal.removeEventListener('abort', onAbort);
        this.untrackChild(child);

        let success = code === 0 && !signal?.aborted;
        if (success) {
          try {
            await fsp.unlink(dest).catch(() => {});
            await fsp.rename(tempDest, dest);
          } catch (e) {
            console.error('Error renaming ytdlp file:', e);
            success = false;
          }
        }

        if (!success && (signal?.aborted || abortRequested)) cleanupTemp();

        const rawError = stderr.trim().replace(/\s+/g, ' ');
        const errorOutput = rawError.length > 400 ? rawError.slice(0, 397) + '...' : rawError;
        finish({
          ok: success,
          error: success ? undefined : errorOutput || `yt-dlp terminó con código ${code ?? 'desconocido'}`,
          stderr: errorOutput || undefined,
        });
      });

      child.on('error', (err) => {
        console.error('Error spawn yt-dlp:', err);
        if (signal) signal.removeEventListener('abort', onAbort);
        this.untrackChild(child);
        const toolMissing = (err as NodeJS.ErrnoException).code === 'ENOENT';
        cleanupTemp();
        const sanitizedMsg = (err.message || '').trim().replace(/\s+/g, ' ').slice(0, 300);
        const sanitizedStderr = stderr.trim().replace(/\s+/g, ' ').slice(0, 400);
        finish({
          ok: false,
          toolMissing,
          error: toolMissing ? 'Herramienta yt-dlp local no encontrada. Verifica tools/win/yt-dlp.exe.' : sanitizedMsg,
          stderr: sanitizedStderr || undefined,
        });
      });
    });
  }
}
