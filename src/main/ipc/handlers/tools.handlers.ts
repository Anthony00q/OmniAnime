import { ipcMain } from 'electron';
import type { IpcRegistryDependencies } from '../../IpcRegistry';

export function registerToolHandlers(dependencies: IpcRegistryDependencies): void {
  const {
    downloadQueue,
    ytdlpUpdateService,
    getYtdlpUpdatePromise,
    setYtdlpUpdatePromise,
    processQueue,
    writeGlobalLog,
  } = dependencies;

  ipcMain.handle('get-ytdlp-version', async (): Promise<string | null> => {
    if (!ytdlpUpdateService) return null;
    try {
      const { execFile } = await import('child_process');
      const { getYtdlpExecutablePath } = await import('../../runtimePaths');
      const exe = getYtdlpExecutablePath();
      const version: string | null = await new Promise((resolve) => {
        execFile(exe, ['--version'], { timeout: 8000, windowsHide: true }, (err, stdout) => {
          if (err) return resolve(null);
          const v = String(stdout || '')
            .split(/\r?\n/)
            .map((s) => s.trim())
            .find(Boolean);
          resolve(v || null);
        });
      });
      return version;
    } catch {
      return null;
    }
  });

  ipcMain.handle('update-ytdlp', async (): Promise<import('../../../types/ytdlp').YtdlpUpdateResult> => {
    const currentPromise = getYtdlpUpdatePromise();
    if (currentPromise) return currentPromise;

    if (downloadQueue.some((item) => item.status === 'downloading')) {
      return {
        success: false,
        updated: false,
        code: 'ACTIVE_DOWNLOADS',
        message: 'No se puede actualizar yt-dlp mientras hay una descarga en curso.',
      };
    }

    if (!ytdlpUpdateService) {
      return {
        success: false,
        updated: false,
        code: 'MISSING_LOCAL',
        message: 'El servicio de actualizacion de yt-dlp no esta disponible.',
      };
    }

    let operation: Promise<import('../../../types/ytdlp').YtdlpUpdateResult>;
    try {
      operation = ytdlpUpdateService.update();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        updated: false,
        code: 'FAILED',
        message: message || 'No se pudo iniciar la actualizacion de yt-dlp.',
      };
    }

    const trackedOperation = operation.finally(() => {
      if (getYtdlpUpdatePromise() !== trackedOperation) return;
      setYtdlpUpdatePromise(null);
      setImmediate(() => processQueue().catch(writeGlobalLog));
    });
    setYtdlpUpdatePromise(trackedOperation);
    return trackedOperation;
  });
}
