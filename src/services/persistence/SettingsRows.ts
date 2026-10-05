import type Database from 'better-sqlite3';
import type { AppSettings } from '../../types/settings';
import { normalizeSoundPack } from '../../utils/sounds/soundPacks';
import { sanitizeSoundCustomMap, sanitizeCustomSoundFiles } from '../../utils/sounds/soundCatalog';
import { ensureDownloadSettingsColumn, ensureSoundPackColumn } from './schema';
import { measure } from './dbMetrics';

export class SettingsRows {
  constructor(private readonly db: Database.Database) {}

  getSettings(): AppSettings | null {
    return measure('SELECT settings', () => {
      try {
        const row = this.db.prepare('SELECT * FROM settings WHERE id = 1').get() as Record<string, unknown> | undefined;
        if (!row) return null;
        return this.rowToSettings(row);
      } catch {
        return null;
      }
    });
  }

  saveSettings(settings: AppSettings): void {
    measure('INSERT settings', () => {
      ensureDownloadSettingsColumn(this.db);
      ensureSoundPackColumn(this.db);
      this.db
        .prepare(
          `INSERT OR REPLACE INTO settings
               (id, default_output_dir, output_dirs, notify_on_complete, minimize_to_tray_on_close,
                naming_style, theme, accent_color, toast_position,
                notifications_sound, sound_volume, sound_pack, sound_custom, custom_sound_files,
                sound_enabled, sound_profiles,
                notification_settings, shortcuts, default_provider, hardware_acceleration,
                download_settings)
               VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          settings.defaultOutputDir,
          JSON.stringify(settings.outputDirs || []),
          settings.notifyOnComplete ? 1 : 0,
          settings.minimizeToTrayOnClose ? 1 : 0,
          settings.namingStyle || 'descriptive',
          settings.theme || 'dark',
          settings.accentColor || 'hsl(35 78% 57%)',
          settings.toastPosition || 'top-center',
          settings.notificationsSound ? 1 : 0,
          settings.soundVolume ?? 0.5,
          normalizeSoundPack(settings.soundPack),
          JSON.stringify(sanitizeSoundCustomMap(settings.soundCustom)),
          JSON.stringify(sanitizeCustomSoundFiles(settings.customSoundFiles)),
          JSON.stringify(settings.soundEnabled || {}),
          JSON.stringify(settings.soundProfiles || {}),
          JSON.stringify(settings.notificationSettings || {}),
          JSON.stringify(settings.shortcuts || {}),
          settings.defaultProvider || 'animeav1',
          settings.hardwareAcceleration === false ? 0 : 1,
          JSON.stringify(settings.download || {}),
        );
    });
  }

  settingsExist(): boolean {
    return measure('SELECT settingsExist', () => {
      const row = this.db.prepare('SELECT COUNT(*) as c FROM settings WHERE id = 1').get() as { c: number } | undefined;
      return (row?.c ?? 0) > 0;
    });
  }

  private rowToSettings(row: Record<string, unknown>): AppSettings {
    const parseJson = (val: unknown, fallback: any = undefined) => {
      try {
        if (typeof val === 'string') return JSON.parse(val);
        if (fallback !== undefined) return fallback;
        return {};
      } catch {
        return fallback !== undefined ? fallback : {};
      }
    };

    return {
      defaultOutputDir: String(row.default_output_dir || ''),
      outputDirs: (() => {
        const parsed = parseJson(row.output_dirs, []);
        return Array.isArray(parsed) ? parsed : [];
      })(),
      notifyOnComplete: Boolean(row.notify_on_complete),
      minimizeToTrayOnClose: Boolean(row.minimize_to_tray_on_close),
      namingStyle: String(row.naming_style || 'descriptive') as 'minimal' | 'descriptive',
      theme: String(row.theme || 'dark') as 'dark' | 'quantum' | 'oled',
      accentColor: String(row.accent_color || 'hsl(35 78% 57%)'),
      toastPosition: String(row.toast_position || 'top-center') as AppSettings['toastPosition'],
      notificationsSound: Boolean(row.notifications_sound),
      soundVolume: Number(row.sound_volume ?? 0.5),
      soundPack: normalizeSoundPack((row as Record<string, unknown>).sound_pack),
      soundCustom: sanitizeSoundCustomMap(
        parseJson((row as Record<string, unknown>).sound_custom, {}),
      ) as AppSettings['soundCustom'],
      customSoundFiles: sanitizeCustomSoundFiles(parseJson((row as Record<string, unknown>).custom_sound_files, [])),
      soundEnabled: parseJson(row.sound_enabled, {
        download: true,
        success: true,
        error: true,
        info: true,
      }) as AppSettings['soundEnabled'],
      soundProfiles: parseJson(row.sound_profiles, {
        download: 0.55,
        success: 0.5,
        error: 0.6,
        info: 0.45,
      }) as AppSettings['soundProfiles'],
      notificationSettings: parseJson(row.notification_settings, {
        showDownloadStarted: true,
        showDownloadFinished: true,
        showDownloadError: true,
        showSystemMessages: true,
      }) as AppSettings['notificationSettings'],
      shortcuts: parseJson(row.shortcuts, {
        search: 'F',
        close: 'Escape',
        prevView: 'ArrowLeft',
        nextView: 'ArrowRight',
      }) as AppSettings['shortcuts'],
      defaultProvider: String(row.default_provider || 'animeav1') as 'animeav1' | 'jkanime',
      hardwareAcceleration: (row as Record<string, unknown>).hardware_acceleration !== 0,
      download: (() => {
        const parsed = parseJson((row as Record<string, unknown>).download_settings, undefined);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as AppSettings['download'])
          : undefined;
      })(),
    };
  }
}
