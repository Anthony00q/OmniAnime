import type { DownloadLink } from './anime';

export type DownloadProvider = 'animeav1' | 'jkanime';

export type QueueStatus = 'pending' | 'downloading' | 'done' | 'failed' | 'cancelled' | 'paused';

export interface QueueItem {
  id: string;
  slug: string;
  downloadSlug?: string;
  animeTitle: string;
  poster?: string | null;
  preferredServer?: string;
  episodes: number[];
  // DUB desactivado: solo SUB
  lang?: 'SUB' | 'DUB';
  status: QueueStatus;
  currentEp: number | null;
  providerId?: DownloadProvider;
  progress: number;
  completedEps: number[];
  failedEps: number[];
  failureReasons?: Record<string, string>;
  // Control fino por episodio: transitorio en memoria, persistido en SQLite v4
  pausedEps?: number[];
  cancelledEps?: number[];
  // Foto del % congelado al pausar ({ep: {progress 0..1, server?}}).
  // Transitoria en memoria; la persistencia entre reinicios vive en
  // PausedProgressStore (paused-progress.json), nunca en SQLite.
  pausedEpSnapshot?: Record<string, { progress: number; server?: string }>;
  targetPath: string;
  outputDirIndex?: number;
  currentServer?: string;
}

export interface ProviderDownloadLink extends DownloadLink {
  provider: DownloadProvider;
  canonicalServer: string;
  sourceSlug: string;
  sourceEpisode: number;
}

export interface QueueDatabaseRow {
  id: string;
  slug: string;
  download_slug: string | null;
  anime_title: string;
  poster: string | null;
  preferred_server: string | null;
  episodes: string;
  lang: string;
  status: string;
  current_ep: number | null;
  provider_id: string | null;
  progress: number;
  completed_eps: string;
  failed_eps: string;
  paused_eps?: string;
  cancelled_eps?: string;
  target_path: string;
  output_dir_index: number;
  current_server: string | null;
}

export type QueueDatabaseWriteRow = QueueDatabaseRow;
