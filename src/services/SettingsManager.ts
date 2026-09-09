import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { AppSettings } from '../types/settings';
import { DEFAULT_DOWNLOAD_SETTINGS, normalizeDownloadSettings } from '../utils/downloadSettings';
import { DatabaseManager } from './DatabaseManager';

const LEGACY_SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');
const BOOT_CONFIG_FILE = path.join(app.getPath('userData'), 'omnianime_boot.json');

export const DEFAULT_SETTINGS: AppSettings = {
  defaultOutputDir: path.join(app.getPath('downloads'), 'OmniAnime'),
  outputDirs: [path.join(app.getPath('downloads'), 'OmniAnime')],
  notifyOnComplete: true,
  minimizeToTrayOnClose: false,
  namingStyle: 'descriptive',
  autoRenameRetroactive: false,
  theme: 'dark',
  accentColor: 'hsl(217.2 91.2% 59.8%)',
  toastPosition: 'top-center',
  defaultProvider: 'animeav1',
  notificationsSound: true,
  soundVolume: 0.5,
  hardwareAcceleration: true,
  soundEnabled: {
    download: true,
    success: true,
    error: true,
    info: true,
  },
  soundProfiles: {
    download: 0.55,
    success: 0.5,
    error: 0.6,
    info: 0.45,
  },
  notificationSettings: {
    showDownloadStarted: true,
    showDownloadFinished: true,
    showDownloadError: true,
    showSystemMessages: true,
  },
  shortcuts: {
    search: 'F',
    close: 'Escape',
    prevView: 'ArrowLeft',
    nextView: 'ArrowRight',
  },
  download: { ...DEFAULT_DOWNLOAD_SETTINGS },
};

function updateBootConfig(settings: AppSettings): void {
  try {
    const dir = path.dirname(BOOT_CONFIG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const boot = { hardwareAcceleration: settings.hardwareAcceleration !== false };
    const tempPath = BOOT_CONFIG_FILE + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(boot), 'utf-8');
    fs.renameSync(tempPath, BOOT_CONFIG_FILE);
  } catch {}
}

export class SettingsManager {
  static getDefaults(): AppSettings {
    return { ...DEFAULT_SETTINGS };
  }

  // Memo sin TTL: save()/clearAutoRenameRetroactiveOnce() invalidan.
  private static cachedSettings: AppSettings | null = null;

  static get(): AppSettings {
    if (SettingsManager.cachedSettings) return SettingsManager.cachedSettings;
    const db = DatabaseManager.getInstance();

    if (!db.isReady()) {
      return SettingsManager.readFromLegacyJson();
    }

    const fromDb = db.getSettings();
    if (fromDb) {
      const merged = SettingsManager.mergeWithDefaults(fromDb);
      SettingsManager.cachedSettings = merged;
      return merged;
    }

    return SettingsManager.readFromLegacyJson();
  }

  static save(settings: AppSettings): boolean {
    SettingsManager.cachedSettings = null;
    try {
      settings.download = normalizeDownloadSettings((settings as AppSettings).download);
      const db = DatabaseManager.getInstance();
      if (db.isReady()) {
        db.saveSettings(settings);
        updateBootConfig(settings);
      }

      try {
        const dir = path.dirname(LEGACY_SETTINGS_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const tempPath = LEGACY_SETTINGS_FILE + '.tmp';
        fs.writeFileSync(tempPath, JSON.stringify(settings, null, 4), 'utf-8');
        fs.renameSync(tempPath, LEGACY_SETTINGS_FILE);
      } catch {}

      return true;
    } catch (e) {
      console.error('Error saving settings:', e);
      return false;
    }
  }

  static clearAutoRenameRetroactiveOnce(): void {
    SettingsManager.cachedSettings = null;
    try {
      DatabaseManager.getInstance().clearAutoRenameRetroactiveOnce();
    } catch {}
    try {
      if (fs.existsSync(LEGACY_SETTINGS_FILE)) {
        const raw = fs.readFileSync(LEGACY_SETTINGS_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && (parsed as any).autoRenameRetroactive === true) {
          (parsed as any).autoRenameRetroactive = false;
          const tempPath = LEGACY_SETTINGS_FILE + '.tmp';
          fs.writeFileSync(tempPath, JSON.stringify(parsed, null, 4), 'utf-8');
          fs.renameSync(tempPath, LEGACY_SETTINGS_FILE);
        }
      }
    } catch {}
  }

  private static readFromLegacyJson(): AppSettings {
    try {
      if (fs.existsSync(LEGACY_SETTINGS_FILE)) {
        const data = fs.readFileSync(LEGACY_SETTINGS_FILE, 'utf-8');
        const settings = { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
        return SettingsManager.mergeWithDefaults(settings);
      }
    } catch (e) {
      console.error('Error reading legacy settings:', e);
    }
    return { ...DEFAULT_SETTINGS };
  }

  private static mergeWithDefaults(settings: AppSettings): AppSettings {
    settings.soundEnabled = {
      ...DEFAULT_SETTINGS.soundEnabled,
      ...(settings as any).soundEnabled,
    };
    settings.soundProfiles = {
      ...DEFAULT_SETTINGS.soundProfiles,
      ...(settings as any).soundProfiles,
    };
    settings.notificationSettings = {
      ...DEFAULT_SETTINGS.notificationSettings,
      ...(settings as any).notificationSettings,
    };
    settings.shortcuts = {
      ...DEFAULT_SETTINGS.shortcuts,
      ...(settings as any).shortcuts,
    };
    settings.download = normalizeDownloadSettings((settings as any).download ?? (DEFAULT_SETTINGS.download as unknown));

    if (!settings.outputDirs || !Array.isArray(settings.outputDirs) || settings.outputDirs.length === 0) {
      settings.outputDirs = [settings.defaultOutputDir || DEFAULT_SETTINGS.defaultOutputDir];
    }

    return settings;
  }
}

export function readBootHardwareAcceleration(): boolean {
  try {
    if (fs.existsSync(BOOT_CONFIG_FILE)) {
      const data = fs.readFileSync(BOOT_CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      return parsed.hardwareAcceleration !== false;
    }
    if (fs.existsSync(LEGACY_SETTINGS_FILE)) {
      const data = fs.readFileSync(LEGACY_SETTINGS_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      return parsed.hardwareAcceleration !== false;
    }
  } catch {}
  return true;
}
