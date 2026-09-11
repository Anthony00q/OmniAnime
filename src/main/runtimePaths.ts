import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { FfmpegRuntimeTools } from '../services/DownloadService';

export function getSplashHtmlPath(): string {
  if (app.isPackaged) {
    return path.join(app.getAppPath(), 'dist', 'renderer', 'splash.html');
  }
  return path.join(app.getAppPath(), 'src', 'renderer', 'splash.html');
}

export function getAppHtmlPath(): string {
  if (app.isPackaged) {
    return path.join(app.getAppPath(), 'dist', 'renderer', 'index.html');
  }
  return path.join(app.getAppPath(), 'src', 'renderer', 'index.html');
}

export function getAppIconPath(): string {
  return path.join(app.getAppPath(), 'assets', 'icon.ico');
}

export function getToolsDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'tools', 'win');
  }
  return path.join(app.getAppPath(), 'tools', 'win');
}

export function getFfmpegExecutablePath(): string {
  return path.join(getToolsDir(), 'ffmpeg.exe');
}

export function getFfmpegTools(): FfmpegRuntimeTools {
  const toolsDir = getToolsDir();
  const bundledFfmpeg = getFfmpegExecutablePath();
  return {
    ffmpegDir: fs.existsSync(bundledFfmpeg) ? toolsDir : undefined,
  };
}
