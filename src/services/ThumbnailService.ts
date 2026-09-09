import { spawn, type ChildProcess } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { terminateChildProcessTree } from '../utils/processUtils';

export interface ThumbnailServiceOptions {
  toolsDir: string;
  userDataDir: string;
  registerProcess: (child: ChildProcess) => void;
  unregisterProcess: (child: ChildProcess) => void;
  log: (error: unknown) => void;
}

const THUMBNAIL_DIR_NAME = 'thumbnails_v3';
const THUMBNAIL_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const THUMBNAIL_BATCH_SIZE = 16;
const DURATION_TIMEOUT_MS = 2000;
const CAPTURE_TIMEOUT_MS = 5000;
// Duration sale en los primeros KB: tope anti-bloat de stderr.
const DURATION_OUTPUT_LIMIT = 64 * 1024;

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
    return attempts;
  }
  return ['120', '240', '60', '15', '2', '0'];
}

export class ThumbnailService {
  private readonly MAX_FFMPEG_CONCURRENT = 2;
  private runningFfmpeg = 0;
  private ffmpegQueue: Array<() => void> = [];

  constructor(private readonly options: ThumbnailServiceOptions) {}

  private async acquireFfmpegSlot(): Promise<void> {
    if (this.runningFfmpeg < this.MAX_FFMPEG_CONCURRENT) {
      this.runningFfmpeg++;
      return;
    }
    await new Promise<void>((resolve) => this.ffmpegQueue.push(resolve));
    this.runningFfmpeg++;
  }

  private releaseFfmpegSlot(): void {
    this.runningFfmpeg = Math.max(0, this.runningFfmpeg - 1);
    const next = this.ffmpegQueue.shift();
    if (next) next();
  }

  resolveFfmpegPath(): string {
    const localFfmpeg = path.join(this.options.toolsDir, 'ffmpeg.exe');
    return fs.existsSync(localFfmpeg) ? localFfmpeg : 'ffmpeg';
  }

  async cleanupThumbnails(): Promise<void> {
    try {
      const thumbDir = path.join(this.options.userDataDir, THUMBNAIL_DIR_NAME);
      try {
        await fsp.stat(thumbDir);
      } catch {
        return;
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
              if (now - stats.mtimeMs > THUMBNAIL_MAX_AGE_MS) {
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

  // Staging en 2 fases contra cadenas/ciclos; best-effort, nunca lanza.
  async moveThumbnailsStaged(pairs: Array<{ from: string; to: string }>): Promise<void> {
    try {
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
      try {
        for (let i = 0; i < moves.length; i += 1) {
          const tempPath = path.join(thumbDir, `_thumb_mv_${stamp}_${i}.jpg`);
          try {
            await fsp.stat(path.join(thumbDir, `${moves[i].srcHash}.jpg`));
          } catch {
            continue;
          }
          await fsp.rename(path.join(thumbDir, `${moves[i].srcHash}.jpg`), tempPath);
          staged.push({ tempPath, srcHash: moves[i].srcHash, destHash: moves[i].destHash });
        }
        const appliedOk = new Set<string>();
        for (const item of staged) {
          const destPath = path.join(thumbDir, `${item.destHash}.jpg`);
          try {
            await fsp.rm(destPath, { force: true });
            await fsp.rename(item.tempPath, destPath);
            appliedOk.add(item.tempPath);
          } catch (error) {
            this.options.log(error);
          }
        }
        // Lo no aplicado vuelve a su origen.
        for (const item of staged) {
          if (appliedOk.has(item.tempPath)) continue;
          try {
            await fsp.rename(item.tempPath, path.join(thumbDir, `${item.srcHash}.jpg`));
          } catch (error) {
            this.options.log(error);
          }
        }
      } catch (error) {
        this.options.log(error);
      }
    } catch (error) {
      this.options.log(error);
    }
  }

  async getThumbnail(videoPath: string): Promise<string | null> {
    try {
      const ffmpegPath = this.resolveFfmpegPath();
      const thumbDir = path.join(this.options.userDataDir, THUMBNAIL_DIR_NAME);
      try {
        await fsp.mkdir(thumbDir, { recursive: true });
      } catch {}

      const hash = crypto.createHash('md5').update(videoPath).digest('hex');
      const thumbPath = path.join(thumbDir, `${hash}.jpg`);

      if (await this.isUsableThumbnail(thumbPath)) {
        try {
          const data = await fsp.readFile(thumbPath);
          return `data:image/jpeg;base64,${data.toString('base64')}`;
        } catch {}
      }

      const duration = await this.getVideoDuration(videoPath, ffmpegPath);
      const attempts = computeThumbnailAttemptPoints(duration);

      for (const startPoint of attempts) {
        const ok = await this.captureAt(videoPath, ffmpegPath, thumbDir, hash, startPoint);
        const tempThumbPath = path.join(thumbDir, `temp_${hash}_${startPoint}.jpg`);

        if (ok && (await this.isUsableThumbnail(tempThumbPath))) {
          try {
            await fsp.rename(tempThumbPath, thumbPath);
            const data = await fsp.readFile(thumbPath);
            return `data:image/jpeg;base64,${data.toString('base64')}`;
          } catch (error) {
            this.options.log(error);
          } finally {
            try {
              await fsp.unlink(tempThumbPath);
            } catch {}
          }
        } else {
          try {
            await fsp.unlink(path.join(thumbDir, `temp_${hash}_${startPoint}.jpg`));
          } catch {}
        }
      }

      return null;
    } catch (error) {
      this.options.log(error);
      return null;
    }
  }

  private async getVideoDuration(videoPath: string, ffmpegPath: string): Promise<number | null> {
    await this.acquireFfmpegSlot();
    return new Promise((resolve) => {
      const childProcess = spawn(ffmpegPath, ['-i', videoPath], { windowsHide: true });
      this.options.registerProcess(childProcess);

      let output = '';
      let finished = false;
      let timeout: NodeJS.Timeout | null = null;
      const finish = (duration: number | null) => {
        if (finished) return;
        finished = true;
        if (timeout) clearTimeout(timeout);
        this.options.unregisterProcess(childProcess);
        this.releaseFfmpegSlot();
        resolve(duration);
      };

      childProcess.stderr.on('data', (data) => {
        if (output.length < DURATION_OUTPUT_LIMIT)
          output += data.toString().slice(0, DURATION_OUTPUT_LIMIT - output.length);
      });
      childProcess.stdout.on('data', (data) => {
        if (output.length < DURATION_OUTPUT_LIMIT)
          output += data.toString().slice(0, DURATION_OUTPUT_LIMIT - output.length);
      });

      childProcess.on('close', () => {
        const match = output.match(/Duration:\s*(\d+):(\d+):(\d+)(?:\.(\d+))?/);
        if (match) {
          const hours = parseInt(match[1], 10);
          const minutes = parseInt(match[2], 10);
          const seconds = parseInt(match[3], 10);
          finish(hours * 3600 + minutes * 60 + seconds);
        } else {
          finish(null);
        }
      });

      childProcess.on('error', () => finish(null));

      timeout = setTimeout(() => {
        if (finished) return;
        terminateChildProcessTree(childProcess);
        finish(null);
      }, DURATION_TIMEOUT_MS);
    });
  }

  private async captureAt(
    videoPath: string,
    ffmpegPath: string,
    thumbDir: string,
    hash: string,
    startPoint: string,
  ): Promise<boolean> {
    await this.acquireFfmpegSlot();
    return new Promise((resolve) => {
      const tempThumbPath = path.join(thumbDir, `temp_${hash}_${startPoint}.jpg`);
      fsp.unlink(tempThumbPath).catch(() => {});

      let finished = false;
      const childProcess = spawn(
        ffmpegPath,
        ['-y', '-ss', startPoint, '-i', videoPath, '-vframes', '1', '-q:v', '2', '-f', 'image2', tempThumbPath],
        { windowsHide: true },
      );

      this.options.registerProcess(childProcess);

      let timeout: NodeJS.Timeout | null = null;
      const finalize = (ok: boolean) => {
        if (finished) return;
        finished = true;
        if (timeout) clearTimeout(timeout);
        this.options.unregisterProcess(childProcess);
        this.releaseFfmpegSlot();
        resolve(ok);
      };

      childProcess.on('close', (code) => {
        void (async () => finalize(code === 0 && (await this.isUsableThumbnail(tempThumbPath))))();
      });
      childProcess.on('error', () => finalize(false));

      timeout = setTimeout(() => {
        if (finished) return;
        terminateChildProcessTree(childProcess);
        finalize(false);
      }, CAPTURE_TIMEOUT_MS);
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
