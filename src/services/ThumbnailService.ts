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
const DURATION_TIMEOUT_MS = 2000;
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

  cleanupThumbnails(): void {
    try {
      const thumbDir = path.join(this.options.userDataDir, THUMBNAIL_DIR_NAME);
      if (!fs.existsSync(thumbDir)) return;

      const files = fs.readdirSync(thumbDir);
      const now = Date.now();
      for (const file of files) {
        if (!file.endsWith('.jpg')) continue;
        const filePath = path.join(thumbDir, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > THUMBNAIL_MAX_AGE_MS) {
          fs.unlinkSync(filePath);
        }
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

      if (this.isUsableThumbnail(thumbPath)) {
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

        if (ok && this.isUsableThumbnail(tempThumbPath)) {
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
      const childProcess = spawn(ffmpegPath, ['-i', videoPath]);
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
        output += data.toString();
      });
      childProcess.stdout.on('data', (data) => {
        output += data.toString();
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
      const childProcess = spawn(ffmpegPath, [
        '-y',
        '-ss',
        startPoint,
        '-i',
        videoPath,
        '-vframes',
        '1',
        '-q:v',
        '2',
        '-f',
        'image2',
        tempThumbPath,
      ]);

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
        finalize(code === 0 && this.isUsableThumbnail(tempThumbPath));
      });
      childProcess.on('error', () => finalize(false));

      timeout = setTimeout(() => {
        if (finished) return;
        terminateChildProcessTree(childProcess);
        finalize(false);
      }, CAPTURE_TIMEOUT_MS);
    });
  }

  private isUsableThumbnail(filePath: string): boolean {
    try {
      const stats = fs.statSync(filePath);
      return stats.isFile() && stats.size > 0;
    } catch {
      return false;
    }
  }
}
