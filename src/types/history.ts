export type HistoryStatus = 'ok' | 'fail' | 'cancelled';

export type HistoryScope = 'episode' | 'queue';

export interface HistoryWriteRecord {
  date: string;
  anime: string;
  slug: string;
  episode?: number | null;
  status: HistoryStatus;
  path: string;
  providerId?: string;
  scope?: HistoryScope;
  queueId?: string;
  reason?: string;
  episodeList?: number[];
}

export interface HistoryDatabaseRow {
  id: number;
  date: string;
  anime: string;
  slug: string;
  episode: number | null;
  status: HistoryStatus;
  path: string;
  provider_id: string | null;
  scope: HistoryScope;
  queue_id: string | null;
  reason: string | null;
  episode_list: string;
}

export interface HistoryViewRecord {
  date: string;
  anime: string;
  slug: string;
  episode: number | null;
  status: HistoryStatus;
  path: string;
  providerId?: string;
  _dbId: number;
  scope: HistoryScope;
  queueId?: string;
  reason?: string;
  episodeList: number[];
  dirLabel: string;
  dirFullPath: string;
}
