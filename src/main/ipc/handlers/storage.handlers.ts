import { app, dialog, ipcMain, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { SettingsManager } from '../../../services/SettingsManager';
import { normalizeDownloadSettings } from '../../../utils/downloadSettings';
import { isPathWithinAnyDirectory } from '../../../utils/pathSecurity';
import type { AppSettings } from '../../../types/settings';
import type { IpcRegistryDependencies } from '../../IpcRegistry';

export function registerStorageHandlers(dependencies: IpcRegistryDependencies): void {
  const { storageService, writeGlobalLog } = dependencies;

  ipcMain.handle('get-storage-stats', async () => {
    try {
      if (!storageService)
        return {
          disks: [],
          db: { db: 0, wal: 0, shm: 0, total: 0 },
          thumbnails: { count: 0, size: 0, expiredCount: 0 },
          cache: { count: 0, size: 0, perDir: [] },
        };
      return await storageService.getStorageStats();
    } catch (error) {
      writeGlobalLog(error);
      throw error;
    }
  });

  ipcMain.handle('clean-cache', async () => {
    try {
      if (!storageService) return { cleaned: 0, freed: 0, errors: ['Servicio no disponible'] };
      return await storageService.cleanCache();
    } catch (error) {
      writeGlobalLog(error);
      return { cleaned: 0, freed: 0, errors: [error instanceof Error ? error.message : String(error)] };
    }
  });

  ipcMain.handle('clean-thumbnails', async (_, mode?: 'expired' | 'all') => {
    try {
      if (!storageService) return { cleaned: 0, freed: 0, errors: ['Servicio no disponible'] };
      const m = mode === 'all' ? 'all' : 'expired';
      return await storageService.cleanThumbnails(m);
    } catch (error) {
      writeGlobalLog(error);
      return { cleaned: 0, freed: 0, errors: [error instanceof Error ? error.message : String(error)] };
    }
  });

  ipcMain.handle('get-app-paths', async () => {
    try {
      if (!storageService) {
        return {
          userData: app.getPath('userData'),
          logs: path.join(app.getPath('userData'), 'logs'),
          toolsDir: '',
          dbPath: '',
        };
      }
      return storageService.getAppPaths();
    } catch (error) {
      writeGlobalLog(error);
      return {
        userData: app.getPath('userData'),
        logs: path.join(app.getPath('userData'), 'logs'),
        toolsDir: '',
        dbPath: '',
      };
    }
  });

  ipcMain.handle('open-app-path', async (_, kind: string) => {
    try {
      const allowedKinds = new Set(['userData', 'logs', 'tools', 'db']);
      if (!allowedKinds.has(kind)) return { success: false, error: 'Tipo no permitido' };
      let target: string | null = null;
      if (storageService) {
        const paths = storageService.getAppPaths();
        if (kind === 'userData') target = paths.userData;
        else if (kind === 'logs') target = paths.logs;
        else if (kind === 'tools') target = paths.toolsDir;
        else if (kind === 'db') target = path.dirname(paths.dbPath);
      } else {
        if (kind === 'userData') target = app.getPath('userData');
        else if (kind === 'logs') target = path.join(app.getPath('userData'), 'logs');
      }
      if (!target) return { success: false, error: 'Ruta no disponible' };
      if (!fs.existsSync(target)) {
        try {
          fs.mkdirSync(target, { recursive: true });
        } catch {}
      }
      if (!fs.existsSync(target)) return { success: false, error: 'La ruta no existe' };
      const error = await shell.openPath(target);
      if (error) return { success: false, error };
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: msg };
    }
  });

  ipcMain.handle('export-settings', async () => {
    try {
      const win = dependencies.getMainWindow();
      const result = await dialog.showSaveDialog(win || (undefined as any), {
        title: 'Exportar ajustes',
        defaultPath: path.join(app.getPath('downloads'), 'omnianime-settings.json'),
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePath) return { success: false, canceled: true };
      const settings = SettingsManager.get();
      const data = JSON.stringify(settings, null, 2);
      const tmp = result.filePath + '.tmp';
      await fs.promises.writeFile(tmp, data, 'utf-8');
      await fs.promises.rename(tmp, result.filePath);
      return { success: true, path: result.filePath };
    } catch (error) {
      writeGlobalLog(error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('import-settings', async () => {
    try {
      const win = dependencies.getMainWindow();
      const result = await dialog.showOpenDialog(win || (undefined as any), {
        title: 'Importar ajustes',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile'],
      });
      if (result.canceled || !result.filePaths[0]) return { success: false, canceled: true };
      const filePath = result.filePaths[0];
      const allowed = filePath.endsWith('.json');
      if (!allowed) return { success: false, error: 'Solo se permiten archivos .json' };
      const raw = await fs.promises.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return { success: false, error: 'Archivo no válido' };
      const defaults = SettingsManager.getDefaults();
      const isValidOutputDir = (dir: unknown): boolean => {
        if (typeof dir !== 'string') return false;
        const t = dir.trim();
        if (!t) return false;
        if (!path.isAbsolute(t)) return false;
        const resolved = path.resolve(t);
        const root = path.parse(resolved).root;
        if (resolved === root) return false;
        if (resolved.includes('\0')) return false;
        const rel = path.relative(root, resolved);
        if (rel.split(path.sep).includes('..')) return false;
        if (/^[A-Za-z]:\\$/.test(resolved)) return false;
        return true;
      };
      const allowedThemes = new Set(['dark', 'quantum', 'oled']);
      const allowedToastPositions = new Set([
        'top-left',
        'top-right',
        'bottom-left',
        'bottom-right',
        'top-center',
        'bottom-center',
      ]);
      const allowedNamingStyles = new Set(['minimal', 'descriptive']);
      const allowedProviders = new Set(['animeav1', 'jkanime']);

      const merged: AppSettings = { ...defaults } as AppSettings;
      let outDirs: string[] = [];
      if (Array.isArray((parsed as any).outputDirs)) {
        outDirs = (parsed as any).outputDirs
          .filter(isValidOutputDir)
          .map((d: string) => path.resolve(String(d).trim()));
        const seen = new Set<string>();
        outDirs = outDirs.filter((d) => {
          const k = d.toLowerCase();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        outDirs = outDirs.slice(0, 3);
      }
      let defOut: string = defaults.defaultOutputDir;
      if (typeof (parsed as any).defaultOutputDir === 'string' && isValidOutputDir((parsed as any).defaultOutputDir)) {
        defOut = path.resolve(String((parsed as any).defaultOutputDir).trim());
      }
      if (outDirs.length > 0) {
        const belongs = isPathWithinAnyDirectory(defOut, outDirs, true);
        if (!belongs) defOut = outDirs[0];
      } else {
        outDirs = [defOut];
      }
      merged.outputDirs = outDirs;
      merged.defaultOutputDir = defOut;

      if (typeof (parsed as any).theme === 'string' && allowedThemes.has((parsed as any).theme)) {
        merged.theme = (parsed as any).theme;
      }
      if (
        typeof (parsed as any).toastPosition === 'string' &&
        allowedToastPositions.has((parsed as any).toastPosition)
      ) {
        merged.toastPosition = (parsed as any).toastPosition;
      }
      if (typeof (parsed as any).namingStyle === 'string' && allowedNamingStyles.has((parsed as any).namingStyle)) {
        merged.namingStyle = (parsed as any).namingStyle;
      }
      if (
        typeof (parsed as any).defaultProvider === 'string' &&
        allowedProviders.has((parsed as any).defaultProvider)
      ) {
        merged.defaultProvider = (parsed as any).defaultProvider;
      }
      if (typeof (parsed as any).minimizeToTrayOnClose === 'boolean')
        merged.minimizeToTrayOnClose = (parsed as any).minimizeToTrayOnClose;
      if (typeof (parsed as any).notifyOnComplete === 'boolean')
        merged.notifyOnComplete = (parsed as any).notifyOnComplete;
      if (typeof (parsed as any).notificationsSound === 'boolean')
        merged.notificationsSound = (parsed as any).notificationsSound;
      if (typeof (parsed as any).hardwareAcceleration === 'boolean')
        merged.hardwareAcceleration = (parsed as any).hardwareAcceleration;
      if (typeof (parsed as any).autoRenameRetroactive === 'boolean')
        merged.autoRenameRetroactive = (parsed as any).autoRenameRetroactive;
      if (
        typeof (parsed as any).soundVolume === 'number' &&
        (parsed as any).soundVolume >= 0 &&
        (parsed as any).soundVolume <= 1
      )
        merged.soundVolume = (parsed as any).soundVolume;
      if (typeof (parsed as any).accentColor === 'string' && (parsed as any).accentColor.trim())
        merged.accentColor = String((parsed as any).accentColor).trim();
      if ((parsed as any).download && typeof (parsed as any).download === 'object') {
        merged.download = normalizeDownloadSettings((parsed as any).download);
      }

      const saved = SettingsManager.save(merged);
      if (!saved) return { success: false, error: 'No se pudo guardar' };
      dependencies.queueStore.invalidateDirLabelCache();
      if (merged.minimizeToTrayOnClose === true) dependencies.createTray();
      else dependencies.destroyTray();
      return { success: true, settings: merged };
    } catch (error) {
      writeGlobalLog(error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('get-system-info', async () => {
    try {
      const settings = SettingsManager.get();
      const dirs = settings.outputDirs || [settings.defaultOutputDir];
      let storage: any = null;
      try {
        if (storageService) storage = await storageService.getStorageStats();
      } catch {}
      const info = {
        appVersion: app.getVersion(),
        electronVersion: process.versions.electron,
        nodeVersion: process.versions.node,
        platform: process.platform,
        arch: process.arch,
        userData: app.getPath('userData'),
        dbPath: storageService ? storageService.getAppPaths().dbPath : '',
        outputDirs: dirs,
        dbSize: storage?.db || null,
        thumbnails: storage?.thumbnails || null,
        cache: storage?.cache || null,
      };
      return info;
    } catch (error) {
      writeGlobalLog(error);
      return null;
    }
  });
}
