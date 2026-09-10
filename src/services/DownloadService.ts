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

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 32 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 32 });

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
  ): Promise<boolean> {
    const MAX_EXTRACT_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_EXTRACT_ATTEMPTS; attempt += 1) {
      if (signal?.aborted) return false;
      try {
        const { data } = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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

        const ok = await this.downloadDirectAxios(directUrl, dest, onProgress, signal);
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

  private async downloadDirectAxios(
    url: string,
    dest: string,
    onProgress: (p: number) => void,
    signal?: AbortSignal,
  ): Promise<boolean> {
    const MAX_DIRECT_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_DIRECT_ATTEMPTS; attempt += 1) {
      if (signal?.aborted) return false;
      const ok = await this.downloadDirectAxiosOnce(url, dest, onProgress, signal);
      if (ok || signal?.aborted) return ok;
      if (attempt < MAX_DIRECT_ATTEMPTS) {
        await this.sleepAbortable(1000 * attempt, signal);
      }
    }
    return false;
  }

  private async downloadDirectAxiosOnce(
    url: string,
    dest: string,
    onProgress: (p: number) => void,
    signal?: AbortSignal,
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
        try {
          await fsp.unlink(dest);
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
          Referer: 'https://animeav1.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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
  ): Promise<boolean> {
    let writer: fs.WriteStream | null = null;
    let readable: any = null;

    const destDir = path.dirname(dest);
    const cacheDir = path.join(destDir, '.cache');
    try {
      await fsp.mkdir(cacheDir, { recursive: true });
      if (process.platform === 'win32') {
        execFile('attrib', ['+h', cacheDir], { windowsHide: true }, () => {});
      }
    } catch {}
    const tempDest = path.join(cacheDir, path.basename(dest) + '.part');

    const internalController = new AbortController();
    this.trackController(internalController);
    let settled = false;
    let resolveResult: ((ok: boolean) => void) | null = null;

    const finalize = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (signal) signal.removeEventListener('abort', onExternalAbort);
      this.untrackController(internalController);
      resolveResult?.(ok);
    };

    const cleanup = () => {
      try {
        if (writer) writer.destroy();
      } catch {}
      fsp.unlink(tempDest).catch(() => {});
      fsp.unlink(dest).catch(() => {});
    };

    if (signal?.aborted) {
      this.untrackController(internalController);
      return false;
    }

    const onExternalAbort = () => {
      try {
        internalController.abort();
      } catch {
        /* abort is idempotent */
      }
      try {
        if (readable) readable.destroy();
      } catch {}
      try {
        if (writer) writer.destroy();
      } catch {}
      cleanup();
      finalize(false);
    };
    if (signal) signal.addEventListener('abort', onExternalAbort);

    try {
      const normalizedUrl = normalizeMegaUrl(String(url || '').trim());
      const file = megajs.File.fromURL(normalizedUrl);
      // Timeout + abort for loadAttributes (10s, consistent with providers)
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
      if (signal?.aborted) {
        cleanup();
        if (signal) signal.removeEventListener('abort', onExternalAbort);
        this.untrackController(internalController);
        return false;
      }

      const totalLength = Number(file.size) || 0;
      let downloadedLength = 0;

      writer = fs.createWriteStream(tempDest, { highWaterMark: 1024 * 1024 });
      readable = file.download({
        maxConnections: 6,
        initialChunkSize: 512 * 1024,
        maxChunkSize: 1024 * 1024,
      });

      readable.on('data', (chunk: Buffer) => {
        downloadedLength += chunk.length;
        if (onProgress && totalLength > 0) {
          onProgress(downloadedLength / totalLength);
        }
      });

      return await new Promise((resolve) => {
        resolveResult = resolve;

        readable!.pipe(writer!);

        writer!.on('finish', async () => {
          try {
            await fsp.unlink(dest).catch(() => {});
            await fsp.rename(tempDest, dest);
          } catch {
            cleanup();
            finalize(false);
            return;
          }
          finalize(!signal?.aborted);
        });

        writer!.on('error', () => {
          cleanup();
          finalize(false);
        });

        readable!.on('error', () => {
          cleanup();
          finalize(false);
        });
      });
    } catch {
      if (signal) signal.removeEventListener('abort', onExternalAbort);
      this.untrackController(internalController);
      cleanup();
      return false;
    }
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
