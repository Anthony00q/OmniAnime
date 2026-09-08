import { ipcMain } from 'electron';
import { SettingsManager } from '../../../services/SettingsManager';
import { normalizeDownloadSettings } from '../../../utils/downloadSettings';
import { resolveDefaultOutputDir, sanitizeOutputDirs } from '../../../utils/outputDirs';
import type { AppSettings } from '../../../types/settings';
import type { IpcRegistryDependencies } from '../../IpcRegistry';

export function registerSettingsHandlers({ queueStore, createTray, destroyTray }: IpcRegistryDependencies): void {
  ipcMain.handle('get-settings', () => SettingsManager.get());
  ipcMain.handle('get-default-settings', () => SettingsManager.getDefaults());
  ipcMain.handle('save-settings', (_, settings: AppSettings) => {
    const defaults = SettingsManager.getDefaults();
    settings.outputDirs = sanitizeOutputDirs(settings.outputDirs, settings.defaultOutputDir);
    if (settings.outputDirs.length === 0) {
      settings.outputDirs = sanitizeOutputDirs([defaults.defaultOutputDir], defaults.defaultOutputDir);
    }
    settings.defaultOutputDir = resolveDefaultOutputDir(
      settings.defaultOutputDir,
      settings.outputDirs,
      defaults.defaultOutputDir,
    );
    settings.download = normalizeDownloadSettings((settings as AppSettings).download);
    const saved = SettingsManager.save(settings);
    if (!saved) return false;
    queueStore.invalidateDirLabelCache();
    if (settings.minimizeToTrayOnClose === true) createTray();
    else destroyTray();
    return true;
  });
}
