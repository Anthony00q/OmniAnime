export type YtdlpUpdateCode =
  | 'UPDATED'
  | 'UP_TO_DATE'
  | 'ACTIVE_DOWNLOADS'
  | 'UPDATE_IN_PROGRESS'
  | 'MISSING_LOCAL'
  | 'PERMISSION_DENIED'
  | 'VERIFY_FAILED'
  | 'FAILED'
  | 'CANCELLED';

export interface YtdlpUpdateResult {
  success: boolean;
  updated: boolean;
  code: YtdlpUpdateCode;
  previousVersion?: string;
  currentVersion?: string;
  message?: string;
  warning?: string;
}
