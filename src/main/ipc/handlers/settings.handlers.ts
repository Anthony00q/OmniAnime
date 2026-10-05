import { app } from 'electron';
import { handleIpc } from '../ipcGuard';
import * as path from 'path';
import { SettingsManager } from '../../../services/persistence/SettingsManager';
import { CustomSoundService } from '../../../services/sounds/CustomSoundService';
import { normalizeDownloadSettings } from '../../../utils/downloads/downloadSettings';
import { normalizeLoggingSettings } from '../../../utils/logging/loggingSettings';
import { resolveDefaultOutputDir, sanitizeOutputDirs } from '../../../utils/outputDirs';
import type { AppSettings } from '../../../types/settings';
import type { IpcRegistryDependencies } from '../../IpcRegistry';

export function registerSettingsHandlers({
  queueStore,
  createTray,
  destroyTray,
  refreshLogging,
}: IpcRegistryDependencies): void {
  handleIpc('get-settings', () => SettingsManager.get());
  handleIpc('get-default-settings', () => SettingsManager.getDefaults());
  handleIpc('save-settings', (_, settings: AppSettings) => {
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
    settings.logging = normalizeLoggingSettings((settings as AppSettings).logging);
    const saved = SettingsManager.save(settings);
    if (!saved) return false;
    try {
      refreshLogging();
    } catch {}
    // Sin referencia en settings.
    try {
      const soundService = new CustomSoundService({
        userDataDir: app.getPath('userData'),
        soundsDir: path.join(app.getAppPath(), 'assets', 'sounds'),
      });
      const keepIds = (settings.customSoundFiles || []).map((f) => f.id);
      void soundService.pruneUnreferenced(keepIds);
    } catch {}
    queueStore.invalidateDirLabelCache();
    if (settings.minimizeToTrayOnClose === true) createTray();
    else destroyTray();
    return true;
  });
}
