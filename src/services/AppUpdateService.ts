import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import type {
  AppUpdateCheckResult,
  AppUpdateDownloadResult,
  AppUpdateInstallResult,
  AppUpdateState,
} from '../types/appUpdate';
import { isNewerVersion, normalizeReleaseNotes } from '../utils/appUpdateNotes';

interface AppUpdateServiceOptions {
  hasActiveDownloads: () => boolean;
  sendStatus: (state: AppUpdateState) => void;
  log: (error: unknown) => void;
  checkDelayMs?: number;
  checkIntervalMs?: number;
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Actualizacion de la app via GitHub Releases (electron-updater).
// Solo actua empaquetada; en dev responde DEV sin red.
export class AppUpdateService {
  private checking = false;
  private scheduled = false;
  private readonly checkDelayMs: number;
  private readonly checkIntervalMs: number;

  constructor(private readonly options: AppUpdateServiceOptions) {
    this.checkDelayMs = options.checkDelayMs ?? 60_000;
    this.checkIntervalMs = options.checkIntervalMs ?? 6 * 3_600_000;
    autoUpdater.autoDownload = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.logger = {
      info: () => {},
      warn: () => {},
      debug: () => {},
      error: (message: unknown) => options.log(message),
    };
    autoUpdater.on('download-progress', (progress) => {
      this.emit({ kind: 'downloading', percent: progress?.percent });
    });
    autoUpdater.on('update-downloaded', (info) => {
      this.emit({ kind: 'downloaded', version: info?.version });
    });
    autoUpdater.on('error', (error) => {
      this.emit({ kind: 'error', message: toMessage(error) });
    });
  }

  scheduleInitialCheck(): void {
    if (this.scheduled || !app.isPackaged) return;
    this.scheduled = true;
    const run = () => {
      this.check().catch(this.options.log);
    };
    setTimeout(run, this.checkDelayMs).unref?.();
    setInterval(run, this.checkIntervalMs).unref?.();
  }

  async check(): Promise<AppUpdateCheckResult> {
    if (!app.isPackaged) return { ok: false, code: 'DEV' };
    if (this.checking) return { ok: false, code: 'IN_PROGRESS' };
    this.checking = true;
    this.emit({ kind: 'checking' });
    try {
      const result = await autoUpdater.checkForUpdates();
      const info = result?.updateInfo;
      const version = info?.version;
      const currentVersion = app.getVersion();
      const available = isNewerVersion(version, currentVersion);
      const notes = available ? normalizeReleaseNotes(info?.releaseNotes) : undefined;
      this.emit(available ? { kind: 'available', version, notes } : { kind: 'not-available' });
      return { ok: true, available, version, currentVersion, notes };
    } catch (error: unknown) {
      const message = toMessage(error) || 'No se pudo comprobar actualizaciones.';
      this.emit({ kind: 'error', message });
      return { ok: false, code: 'FAILED', message };
    } finally {
      this.checking = false;
    }
  }

  async download(): Promise<AppUpdateDownloadResult> {
    if (!app.isPackaged) return { ok: false, code: 'DEV' };
    try {
      this.emit({ kind: 'downloading', percent: 0 });
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (error: unknown) {
      const message = toMessage(error) || 'No se pudo descargar la actualizacion.';
      this.emit({ kind: 'error', message });
      return { ok: false, code: 'FAILED', message };
    }
  }

  install(): AppUpdateInstallResult {
    if (!app.isPackaged) return { ok: false, code: 'DEV' };
    if (this.options.hasActiveDownloads()) {
      return {
        ok: false,
        code: 'ACTIVE_DOWNLOADS',
        message:
          'No se puede instalar la actualización mientras hay una descarga en curso. Quedó descargada y se instalará al salir de la app.',
      };
    }
    try {
      autoUpdater.quitAndInstall(false, true);
      return { ok: true };
    } catch (error: unknown) {
      return { ok: false, code: 'FAILED', message: toMessage(error) || 'No se pudo instalar la actualizacion.' };
    }
  }

  private emit(state: AppUpdateState): void {
    try {
      this.options.sendStatus(state);
    } catch (error: unknown) {
      this.options.log(error);
    }
  }
}
