import type { ProviderDownloadLink, QueueItem } from '../../types/queue';
import type { EpisodeAttemptCallbacks, EpisodeAttemptResult } from '../EpisodeDownloadAttemptService';
import { categorizeAttemptFailure, type ServerAttemptOutcome } from '../ServerStatsStore';

// Alcance episodio: ordenar + fallback. Sin cola, workers, pausa, gates, slots,
// historial, SQLite, tray, IPC ni persistencia; los efectos llegan inyectados.

export interface ServerFallbackResult {
  success: boolean;
  failureReason: string;
}

// Resultado de un intento con bandera de ejecución: `attempted: false`
// significa que ni siquiera se pudo intentar (p. ej. slot no adquirido por
// abort/pausa) y el fallback debe detenerse en silencio, como hacía el
// `break` original tras acquireServerSlot fallido.
export type PortAttemptResult = EpisodeAttemptResult & { attempted: boolean };

export interface FallbackAttemptPort {
  attempt(link: ProviderDownloadLink, callbacks: EpisodeAttemptCallbacks): Promise<PortAttemptResult>;
  // Libera recursos retenidos entre intentos (slot del servidor en uso).
  release(): void;
}

export interface DownloadCoordinatorDeps {
  getServerSpeed: (server: string) => string;
  sendLog: (message: string, type?: 'info' | 'success' | 'error' | 'warn') => void;
  sendStatus: (message: string, isBatch?: boolean) => void;
  updateTray: (text?: string) => void;
  scheduleQueueUpdate?: () => void;
  sendQueueUpdate: () => void;
  // Observabilidad por servidor (opcional, best-effort, sin URLs).
  recordServerOutcome?: (outcome: ServerAttemptOutcome) => void;
  cleanEpisodeTemps: (dest: string) => Promise<void>;
  cleanEpisodeCache: (dest: string) => Promise<void>;
  getStartTimeoutSec: () => number;
}

export class DownloadCoordinator {
  constructor(private readonly deps: DownloadCoordinatorDeps) {}

  sortLinksForEpisode(
    links: ProviderDownloadLink[],
    order: string[],
    preferredServer?: string,
  ): ProviderDownloadLink[] {
    const sorted = links.filter((link) => order.includes(link.canonicalServer));
    sorted.sort((a, b) => order.indexOf(a.canonicalServer) - order.indexOf(b.canonicalServer));
    if (preferredServer) {
      sorted.sort((a, b) => {
        const aIsPrevious = a.canonicalServer === preferredServer ? 0 : 1;
        const bIsPrevious = b.canonicalServer === preferredServer ? 0 : 1;
        if (aIsPrevious !== bIsPrevious) return aIsPrevious - bIsPrevious;
        return order.indexOf(a.canonicalServer) - order.indexOf(b.canonicalServer);
      });
    }
    return sorted;
  }

  async attemptServersSequentially(
    item: QueueItem,
    episode: number,
    dest: string,
    episodeAbort: AbortController,
    sortedLinks: ProviderDownloadLink[],
    onProgress: EpisodeAttemptCallbacks['onProgress'],
    onServerChange: ((server: string) => void) | undefined,
    port: FallbackAttemptPort,
  ): Promise<ServerFallbackResult> {
    let success = false;
    let failureReason = 'Todos los servidores disponibles fallaron';
    try {
      for (const link of sortedLinks) {
        if (episodeAbort.signal.aborted) break;
        const speed = this.deps.getServerSpeed(link.server) || '–';
        const resolvedLabel = link.sourceEpisode !== episode ? ` (fuente EP ${link.sourceEpisode})` : '';
        this.deps.sendLog(`▶ Intentando "${link.server}" desde ${link.provider}${resolvedLabel} (${speed})...`, 'info');
        item.currentServer = link.server;
        onServerChange?.(link.server);
        // Aviso liviano y throttled: el progreso en vuelo ya viaja por delta
        // 250ms, no hace falta un full sync por cada salto de servidor.
        if (this.deps.scheduleQueueUpdate) this.deps.scheduleQueueUpdate();
        else this.deps.sendQueueUpdate();
        const startedAt = Date.now();
        const result = await port.attempt(link, {
          onProgress,
          updateTray: (text) => this.deps.updateTray(text),
        });
        // Sin intento (slot/abort): detener en silencio, como el break original.
        if (!result.attempted) break;
        success = result.success;
        try {
          this.deps.recordServerOutcome?.({
            provider: String(link.provider || ''),
            server: String(link.canonicalServer || link.server || ''),
            resolveSuccess: result.started || result.success,
            downloadStart: result.started || result.success,
            downloadSuccess: result.success,
            failureCategory: categorizeAttemptFailure({
              success: result.success,
              parentAborted: result.parentAborted,
              skipRequested: result.skipRequested,
              attemptTimedOut: result.attemptTimedOut,
              invalidMp4: result.invalidMp4,
              toolFailureMessage: result.toolFailureMessage,
            }),
          });
        } catch {
          // La observabilidad nunca rompe descargas.
        }

        if (success) {
          const elapsedMs = Date.now() - startedAt;
          this.deps.sendLog(
            `✓ EP ${episode} descargado desde "${link.server}"${resolvedLabel} en ${(elapsedMs / 1000).toFixed(1)}s`,
            'success',
          );
          this.deps.sendStatus(`EP ${episode} Completado ✓`, item.episodes.length > 1);
          break;
        }
        if (result.invalidMp4) continue;
        if (result.attemptTimedOut && !result.parentAborted) {
          failureReason = `El servidor "${link.server}" no inició la descarga a tiempo`;
          const timeoutSec = this.deps.getStartTimeoutSec();
          this.deps.sendLog(`⌛ "${link.server}" no inició descarga en ${timeoutSec}s. Probando siguiente...`, 'warn');
          await this.deps.cleanEpisodeTemps(dest);
          await this.deps.cleanEpisodeCache(dest);
        } else if (result.toolFailureMessage && !result.parentAborted) {
          failureReason = result.toolFailureMessage;
          this.deps.sendLog(`✗ ${result.toolFailureMessage}`, 'error');
          await this.deps.cleanEpisodeCache(dest);
        } else if (!result.parentAborted) {
          await this.deps.cleanEpisodeCache(dest);
          const isLast = sortedLinks.indexOf(link) === sortedLinks.length - 1;
          if (result.skipRequested) {
            this.deps.sendLog(
              `⏭️ "${link.server}" cancelado, probando siguiente...${isLast ? ' (Último servidor)' : ''}`,
              'warn',
            );
          } else {
            this.deps.sendLog(
              `✗ "${link.server}" falló.${isLast ? ' Sin más servidores.' : ' Probando siguiente...'}`,
              'error',
            );
          }
        }
      }
    } finally {
      port.release();
    }
    return { success, failureReason };
  }
}
