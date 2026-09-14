import type { ProviderDownloadLink, QueueItem } from '../../types/queue';
import type { DownloadSettings } from '../../types/settings';

// Contratos adaptados al modelo real: los motores devuelven boolean | {ok, error};
// `started` lo deriva EpisodeDownloadAttemptService y alimenta las estadísticas.

// Fuente de descarga: se reutiliza el tipo existente, sin duplicar.
export type DownloadSource = ProviderDownloadLink;

// Progreso crudo que emite un engine. `phase` solo la emite HLS.
export interface EngineProgress {
  fraction01: number;
  phase?: 'downloading' | 'assembling';
}

export interface DownloadContext {
  item: QueueItem;
  episode: number;
  dest: string;
  signal: AbortSignal;
  settings: DownloadSettings;
  onProgress: (progress: EngineProgress) => void;
}

// Resultado normalizado de un engine. `error` solo informativo para
// toolFailureMessage; null cuando no hay detalle (p. ej. resolve fallido).
export interface DownloadResult {
  ok: boolean;
  error?: string | null;
}

// Implementación delgada por fuente: sin reintentos ni fallback aquí.
export interface DownloadEngine {
  readonly id: string;
  canHandle(source: DownloadSource): boolean;
  download(source: DownloadSource, ctx: DownloadContext): Promise<DownloadResult>;
}
