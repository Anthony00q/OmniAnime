export type AppUpdateStatusKind = 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';

export interface AppUpdateState {
  kind: AppUpdateStatusKind;
  version?: string;
  notes?: string;
  percent?: number;
  message?: string;
}

export interface AppUpdateCheckResult {
  ok: boolean;
  available?: boolean;
  version?: string;
  currentVersion?: string;
  notes?: string;
  code?: 'DEV' | 'IN_PROGRESS' | 'FAILED';
  message?: string;
}

export interface AppUpdateDownloadResult {
  ok: boolean;
  code?: 'DEV' | 'FAILED';
  message?: string;
}

export interface AppUpdateInstallResult {
  ok: boolean;
  code?: 'DEV' | 'ACTIVE_DOWNLOADS' | 'FAILED';
  message?: string;
}
