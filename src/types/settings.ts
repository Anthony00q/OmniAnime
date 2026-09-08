export type ThemeId = 'dark' | 'quantum' | 'oled';

export interface DownloadSettings {
  maxParallelEpisodes: number;
  retries: number;
  socketTimeout: number;
  startTimeoutSec: number;
  allowContinue: boolean;
  cleanCacheOnComplete: boolean;
}

export interface AppSettings {
  defaultOutputDir: string;
  outputDirs: string[];
  notifyOnComplete: boolean;
  minimizeToTrayOnClose: boolean;
  namingStyle?: 'minimal' | 'descriptive';
  autoRenameRetroactive?: boolean;
  // Apariencia
  theme: ThemeId;
  accentColor: string;
  // Accesibilidad
  // UI Elements
  toastPosition: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center';
  // UX
  notificationsSound: boolean;
  soundVolume: number;
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
}
