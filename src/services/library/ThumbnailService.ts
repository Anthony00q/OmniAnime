import { spawn, type ChildProcess } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { terminateChildProcessTree } from '../../utils/processUtils';
import { withStartupTimeout } from '../../utils/splashBoot';
import { ThumbnailTaskQueue } from './ThumbnailTaskQueue';
import type { ThumbnailPriority, ThumbnailRequest } from '../../types/thumbnails';

export interface ThumbnailServiceOptions {
  toolsDir: string;
  userDataDir: string;
  registerProcess: (child: ChildProcess) => void;
  unregisterProcess: (child: ChildProcess) => void;
  log: (error: unknown) => void;
}

export const THUMBNAIL_DIR_NAME = 'thumbnails_v4';
export const THUMBNAIL_CACHE_DIR_NAMES = [THUMBNAIL_DIR_NAME, 'thumbnails_v3'] as const;
const THUMBNAIL_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const THUMBNAIL_BATCH_SIZE = 16;
const THUMBNAIL_MAX_WIDTH = 960;
const THUMBNAIL_JPEG_QUALITY = 4;
const DURATION_PARSE_TIMEOUT_MS = 2_000;
const CAPTURE_TIMEOUT_MS = 5000;

export function computeThumbnailAttemptPoints(duration: number | null): string[] {
  if (duration && duration > 0) {
    const pct18 = Math.floor(duration * 0.18);
    const pct35 = Math.floor(duration * 0.35);
    const pct55 = Math.floor(duration * 0.55);
    const rawAttempts = [
      pct18.toString(),
      pct35.toString(),
      pct55.toString(),
      '90', // 1:30
      '45', // 0:45
      '12', // 0:12
      '2', // 0:02
    ];
    const attempts = rawAttempts.filter((point) => parseInt(point, 10) < duration);
    if (attempts.length === 0) attempts.push('0');
    return [...new Set(attempts)];
  }
  return ['120', '240', '60', '15', '2', '0'];
}

export function parseMediaDuration(seconds: unknown): number | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.floor(seconds);
}

// Duración solo con cabeceras (music-metadata, sin binarios). Cualquier
// formato no soportado o fichero roto/inexistente devuelve null y el
// llamador usa los puntos de intento genéricos.
export async function getMediaDuration(videoPath: string): Promise<number | null> {
  try {
    const { parseFile } = await import('music-metadata');
    const { value } = await withStartupTimeout(
      parseFile(videoPath, { duration: true, skipCovers: true }),
      DURATION_PARSE_TIMEOUT_MS,
    );
    return parseMediaDuration(value?.format?.duration);
  } catch {
    return null;
  }
}

export class ThumbnailService {
  private readonly queue = new ThumbnailTaskQueue();
  private readonly requests = new Map<() => void, string>();
  private readonly mutations = new Set<{ key: string; recursive: boolean }>();
  private readonly invalidated = new Set<string>();
  private closed = false;
  private cachedFfmpegPath: string | null = null;

  constructor(private readonly options: ThumbnailServiceOptions) {}

  resolveFfmpegPath(): string {
    if (this.cachedFfmpegPath) return this.cachedFfmpegPath;
    const localFfmpeg = path.join(this.options.toolsDir, 'ffmpeg.exe');
    const resolved = fs.existsSync(localFfmpeg) ? localFfmpeg : 'ffmpeg';
    this.cachedFfmpegPath = resolved;
    return resolved;
  }

  async cleanupThumbnails(): Promise<void> {
    for (const dirName of THUMBNAIL_CACHE_DIR_NAMES) {
      try {
        const thumbDir = path.join(this.options.userDataDir, dirName);
        try {
          await fsp.stat(thumbDir);
        } catch {
          continue;
        }

        const files = await fsp.readdir(thumbDir);
        const now = Date.now();
        for (let batchStart = 0; batchStart < files.length; batchStart += THUMBNAIL_BATCH_SIZE) {
          const chunk = files.slice(batchStart, batchStart + THUMBNAIL_BATCH_SIZE);
          await Promise.all(
            chunk.map(async (file) => {
              if (!file.endsWith('.jpg')) return;
              const filePath = path.join(thumbDir, file);
              try {
                const stats = await fsp.stat(filePath);
                if (stats.isFile() && (dirName !== THUMBNAIL_DIR_NAME || now - stats.mtimeMs > THUMBNAIL_MAX_AGE_MS)) {
                  await fsp.unlink(filePath);
                }
              } catch (error) {
                this.options.log(error);
              }
            }),
          );
        }
      } catch (error) {
        this.options.log(error);
      }
    }
  }

  // Staging en 2 fases contra cadenas/ciclos; best-effort, nunca lanza.
  async moveThumbnailsStaged(pairs: Array<{ from: string; to: string }>): Promise<void> {
    try {
      await Promise.all(
        (pairs || []).flatMap((pair) => [pair?.from, pair?.to].filter(Boolean).map((value) => this.cancel(value))),
      );
      const moves: Array<{ srcHash: string; destHash: string }> = [];
      for (const pair of pairs || []) {
        const from = String(pair?.from || '');
        const to = String(pair?.to || '');
        if (!from || !to || from === to) continue;
        const srcHash = crypto.createHash('md5').update(from).digest('hex');
        const destHash = crypto.createHash('md5').update(to).digest('hex');
        if (srcHash === destHash) continue;
        if (moves.some((m) => m.srcHash === srcHash && m.destHash === destHash)) continue;
        moves.push({ srcHash, destHash });
      }
      if (moves.length === 0) return;
      const thumbDir = path.join(this.options.userDataDir, THUMBNAIL_DIR_NAME);
      const stamp = `${Date.now()}_${Math.floor(Math.random() * 0xffffffff).toString(16)}`;
      const staged: Array<{ tempPath: string; srcHash: string; destHash: string }> = [];
      const affectedThumbnails = new Set(
        moves.flatMap((move) => [
          path.join(thumbDir, `${move.srcHash}.jpg`),
          path.join(thumbDir, `${move.destHash}.jpg`),
        ]),
      );
      const unavailableSources = new Set<string>();
      try {
        await fsp.mkdir(thumbDir, { recursive: true });
        for (const move of moves) {
          const source = path.join(thumbDir, `${move.srcHash}.jpg`);
          if (this.invalidated.has(source)) unavailableSources.add(move.srcHash);
          try {
            await fsp.stat(`${source}.invalid`);
            unavailableSources.add(move.srcHash);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') unavailableSources.add(move.srcHash);
          }
        }
        for (const filePath of affectedThumbnails) {
          this.invalidated.add(filePath);
          await fsp.writeFile(`${filePath}.invalid`, '');
        }
        for (let i = 0; i < moves.length; i += 1) {
          const tempPath = path.join(thumbDir, `_thumb_mv_${stamp}_${i}.jpg`);
          try {
            const source = path.join(thumbDir, `${moves[i].srcHash}.jpg`);
            if (unavailableSources.has(moves[i].srcHash)) continue;
            await fsp.stat(source);
          } catch {
            continue;
          }
          await fsp.rename(path.join(thumbDir, `${moves[i].srcHash}.jpg`), tempPath);
          staged.push({ tempPath, srcHash: moves[i].srcHash, destHash: moves[i].destHash });
        }
        for (const move of moves) {
          const destPath = path.join(thumbDir, `${move.destHash}.jpg`);
          await fsp.rm(destPath, { force: true });
          const item = staged.find((candidate) => candidate.srcHash === move.srcHash);
          if (item) await fsp.rename(item.tempPath, destPath);
        }
        for (const filePath of affectedThumbnails) {
          await fsp.rm(`${filePath}.invalid`, { force: true });
          this.invalidated.delete(filePath);
        }
      } catch (error) {
        this.options.log(error);
        const affected = new Set([...affectedThumbnails, ...staged.map((item) => item.tempPath)]);
        for (const filePath of affected) {
          this.invalidated.add(filePath);
          try {
            await fsp.rm(filePath, { force: true });
            await fsp.rm(`${filePath}.invalid`, { force: true });
            this.invalidated.delete(filePath);
          } catch {}
        }
      }
    } catch (error) {
      this.options.log(error);
    }
  }

  async getThumbnail(videoPath: string): Promise<string | null> {
    return this.requestThumbnail(videoPath).promise;
  }

  requestThumbnail(videoPath: string, priority: ThumbnailPriority = 'visible', refresh = false): ThumbnailRequest {
    const key = this.taskKey(videoPath);
    let released =
      this.closed ||
      [...this.mutations].some(
        (mutation) => key === mutation.key || (mutation.recursive && key.startsWith(`${mutation.key}${path.sep}`)),
      );
    let queued: ThumbnailRequest | undefined;
    let resolve!: (result: string | null) => void;
    const promise = new Promise<string | null>((done) => {
      resolve = done;
    });
    const release = () => {
      released = true;
      queued?.release();
      resolve(null);
      this.requests.delete(release);
    };
    const handle: ThumbnailRequest = {
      promise,
      release,
      setPriority: (value) => {
        priority = value;
        queued?.setPriority(value);
      },
    };
    if (released) {
      resolve(null);
      return handle;
    }
    this.requests.set(release, key);
    void (async () => {
      try {
        const cached = refresh ? null : await this.readThumbnail(this.thumbnailPath(videoPath));
        if (released) return;
        if (cached) {
          resolve(cached);
          return;
        }
        queued = this.queue.request(
          this.taskKey(videoPath),
          (signal) => this.generateThumbnail(videoPath, signal, refresh),
          priority,
        );
        const result = await queued.promise;
        if (!released) resolve(result);
      } catch (error) {
        this.options.log(error);
        resolve(null);
      } finally {
        this.requests.delete(release);
      }
    })();
    return handle;
  }

  async cancel(videoPath: string, recursive = false): Promise<void> {
    const key = this.taskKey(videoPath);
    const matches = (candidate: string) =>
      candidate === key || (recursive && candidate.startsWith(`${key}${path.sep}`));
    for (const [release, candidate] of this.requests) {
      if (matches(candidate)) release();
    }
    await this.queue.cancel(matches);
  }

  async withFileMutation<T>(videoPath: string, recursive: boolean, mutate: () => T | Promise<T>): Promise<T> {
    const mutation = { key: this.taskKey(videoPath), recursive };
    this.mutations.add(mutation);
    try {
      await this.cancel(videoPath, recursive);
      return await mutate();
    } finally {
      this.mutations.delete(mutation);
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const release of this.requests.keys()) release();
    await this.queue.close();
  }

  private taskKey(videoPath: string): string {
    const key = path.resolve(videoPath);
    return process.platform === 'win32' ? key.toLowerCase() : key;
  }

  private thumbnailPath(videoPath: string): string {
    const hash = crypto.createHash('md5').update(videoPath).digest('hex');
    return path.join(this.options.userDataDir, THUMBNAIL_DIR_NAME, `${hash}.jpg`);
  }

  private async readThumbnail(thumbPath: string): Promise<string | null> {
    try {
      if (this.invalidated.has(thumbPath)) return null;
      try {
        await fsp.stat(`${thumbPath}.invalid`);
        return null;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return null;
      }
      if (!(await this.isUsableThumbnail(thumbPath))) return null;
      const data = await fsp.readFile(thumbPath);
      return data.length ? `data:image/jpeg;base64,${data.toString('base64')}` : null;
    } catch {
      return null;
    }
  }

  private async generateThumbnail(videoPath: string, signal: AbortSignal, refresh: boolean): Promise<string | null> {
    try {
      if (signal.aborted) return null;
      const thumbPath = this.thumbnailPath(videoPath);
      const cached = refresh ? null : await this.readThumbnail(thumbPath);
      if (signal.aborted || cached) return signal.aborted ? null : cached;
      const original = await fsp.stat(videoPath);
      if (!original.isFile() || signal.aborted) return null;
      const ffmpegPath = this.resolveFfmpegPath();
      const thumbDir = path.join(this.options.userDataDir, THUMBNAIL_DIR_NAME);
      await fsp.mkdir(thumbDir, { recursive: true });
      const hash = crypto.createHash('md5').update(videoPath).digest('hex');
      const duration = await getMediaDuration(videoPath);
      const attempts = computeThumbnailAttemptPoints(duration);
      for (const startPoint of attempts) {
        if (signal.aborted) return null;
        const tempThumbPath = path.join(thumbDir, `temp_${hash}_${crypto.randomUUID()}.jpg`);
        try {
          const captured = await this.captureAt(videoPath, ffmpegPath, tempThumbPath, startPoint, signal);
          if (signal.aborted || captured === 'unavailable') return null;
          if (captured !== 'captured') continue;
          const result = await this.readThumbnail(tempThumbPath);
          if (!result || signal.aborted) return null;
          const current = await fsp.stat(videoPath);
          if (current.size !== original.size || current.mtimeMs !== original.mtimeMs || signal.aborted) return null;
          await fsp.rename(tempThumbPath, thumbPath);
          if (signal.aborted) {
            await fsp.rm(thumbPath, { force: true });
            return null;
          }
          await fsp.rm(`${thumbPath}.invalid`, { force: true });
          this.invalidated.delete(thumbPath);
          return result;
        } finally {
          await fsp.rm(tempThumbPath, { force: true }).catch(() => {});
        }
      }

      return null;
    } catch (error) {
      this.options.log(error);
      return null;
    }
  }

  private async captureAt(
    videoPath: string,
    ffmpegPath: string,
    tempThumbPath: string,
    startPoint: string,
    signal: AbortSignal,
  ): Promise<'captured' | 'failed' | 'unavailable'> {
    if (signal.aborted) return 'failed';
    return new Promise((resolve) => {
      let finished = false;
      let stopping = false;
      let unavailable = false;
      const childProcess = spawn(
        ffmpegPath,
        [
          '-y',
          '-nostdin',
          '-hide_banner',
          '-loglevel',
          'error',
          '-nostats',
          '-ss',
          startPoint,
          '-i',
          videoPath,
          '-vframes',
          '1',
          '-vf',
          `scale=w='min(${THUMBNAIL_MAX_WIDTH},iw)':h=-2`,
          '-q:v',
          String(THUMBNAIL_JPEG_QUALITY),
          '-f',
          'image2',
          tempThumbPath,
        ],
        { windowsHide: true, stdio: 'ignore' },
      );

      this.options.registerProcess(childProcess);

      let timeout: NodeJS.Timeout | null = null;
      let forceKill: NodeJS.Timeout | null = null;
      const finalize = (result: 'captured' | 'failed' | 'unavailable') => {
        if (finished) return;
        finished = true;
        if (timeout) clearTimeout(timeout);
        if (forceKill) clearTimeout(forceKill);
        signal.removeEventListener('abort', stop);
        this.options.unregisterProcess(childProcess);
        resolve(result);
      };
      const stop = () => {
        if (finished || stopping) return;
        stopping = true;
        terminateChildProcessTree(childProcess);
        forceKill = setTimeout(() => {
          if (!finished) {
            try {
              childProcess.kill('SIGKILL');
            } catch {}
          }
        }, 1000);
      };
      childProcess.on('close', (code) => {
        finalize(unavailable ? 'unavailable' : code === 0 && !stopping && !signal.aborted ? 'captured' : 'failed');
      });
      childProcess.on('error', () => {
        unavailable = true;
        if (!childProcess.pid) finalize('unavailable');
        else stop();
      });
      signal.addEventListener('abort', stop, { once: true });
      timeout = setTimeout(stop, CAPTURE_TIMEOUT_MS);
      if (signal.aborted) stop();
    });
  }

  private async isUsableThumbnail(filePath: string): Promise<boolean> {
    try {
      const stats = await fsp.stat(filePath);
      return stats.isFile() && stats.size > 0;
    } catch {
      return false;
    }
  }
}
