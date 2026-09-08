import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { YtdlpRuntimeTools } from '../services/DownloadService';

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

export function getYtdlpExecutablePath(): string {
  return path.join(getToolsDir(), 'yt-dlp.exe');
}

export function getYtdlpRuntimeTools(): YtdlpRuntimeTools {
  const toolsDir = getToolsDir();
  const bundledYtdlp = getYtdlpExecutablePath();
  const bundledFfmpeg = path.join(toolsDir, 'ffmpeg.exe');
  return {
    ytdlpPath: bundledYtdlp,
    ffmpegDir: fs.existsSync(bundledFfmpeg) ? toolsDir : undefined,
  };
}
