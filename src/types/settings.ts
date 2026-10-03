import type { LogLevel } from '../services/logging/AppLogger';
import type { SoundPackId, NotificationSoundType } from '../utils/sounds/soundPacks';
import type { CustomSoundFileMeta } from '../utils/sounds/soundCatalog';
import type { FolderNameSource } from '../utils/downloads/folderNaming';

export type ThemeId = 'dark' | 'quantum' | 'oled' | 'tinta';

export interface LoggingSettingsInput {
  level?: LogLevel;
  verbose?: boolean;
}

// Identidad de servidores Adaptive (minúsculas, como `connectionLevelForServer`).
// `mega` solo es clave legacy de lectura: Mega es single-stream fijo, nunca Adaptive.
export type AdaptiveServerId = 'mediafire' | 'mp4upload' | 'voe' | 'mega';

// Conexiones adaptativas: interruptor global + elección por servidor.
export interface AdaptiveConnectionsSettings {
  enabled: boolean;
  servers: Record<AdaptiveServerId, boolean>;
}

export interface DownloadSettings {
  maxParallelEpisodes: number;
  retries: number;
  startTimeoutSec: number;
  allowContinue: boolean;
  cleanCacheOnComplete: boolean;
  // Ajusta las conexiones internas del episodio según rendimiento (global + por servidor).
  adaptiveConnections: AdaptiveConnectionsSettings;
  mediafireConnections: number;
  mp4uploadConnections: number;
  voeConnections: number;
  // Mega: single-stream fijo de 1 conexión (los valores legacy 2/4/6/8 se
  // normalizan a 1; el camino chunked es legacy interno, no opción pública).
  megaConnections: number;
  hlsConnections: number;
  serverOrderAnimeav1: string[];
  serverOrderJkanime: string[];
  folderNameSource: FolderNameSource;
}

export interface AppSettings {
  defaultOutputDir: string;
  outputDirs: string[];
  notifyOnComplete: boolean;
  minimizeToTrayOnClose: boolean;
  namingStyle?: 'minimal' | 'descriptive';
  // Apariencia
  theme: ThemeId;
  accentColor: string;
  // Accesibilidad
  // UI Elements
  toastPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center';
  // UX
  notificationsSound: boolean;
  soundVolume: number;
  soundPack: SoundPackId;
  soundCustom?: Partial<Record<NotificationSoundType, string>>;
  customSoundFiles?: CustomSoundFileMeta[];
  soundEnabled: {
    download: boolean;
    success: boolean;
    error: boolean;
    info: boolean;
  };
  soundProfiles: {
    download: number;
    success: number;
    error: number;
    info: number;
  };
  notificationSettings: {
    showDownloadStarted: boolean;
    showDownloadFinished: boolean;
    showDownloadError: boolean;
    showSystemMessages: boolean;
  };
  shortcuts: {
    search: string;
    close: string;
    prevView: string;
    nextView: string;
  };
  defaultProvider?: 'animeav1' | 'jkanime';
  hardwareAcceleration?: boolean;
  download?: DownloadSettings;
  logging?: LoggingSettingsInput;
}
