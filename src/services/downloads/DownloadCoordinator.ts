import type { ProviderDownloadLink, QueueItem } from '../../types/queue';
import type { EpisodeAttemptCallbacks, EpisodeAttemptResult } from '../EpisodeDownloadAttemptService';
import {
  categorizeAttemptFailure,
  type EpisodeDownloadSummary,
  type ServerAttemptOutcome,
  type ServerFailureCategory,
} from '../ServerStatsStore';
import { noopScopedLogger, type ScopedLogger } from '../AppLogger';

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
  // Fichero de sesión con contexto (provider/queue/ep/server), sin URLs ni rutas.
  fileLog?: ScopedLogger;
  // Observabilidad por servidor (opcional, best-effort, sin URLs).
  recordServerOutcome?: (outcome: ServerAttemptOutcome) => void;
  // Agregado por episodio (opcional, best-effort): se emite una vez por EP.
  recordEpisodeOutcome?: (summary: EpisodeDownloadSummary) => void;
  cleanEpisodeTemps: (dest: string) => Promise<void>;
  cleanEpisodeCache: (dest: string) => Promise<void>;
  getStartTimeoutSec: () => number;
}

export class DownloadCoordinator {
  constructor(private readonly deps: DownloadCoordinatorDeps) {}

  private get fileLog(): ScopedLogger {
    return this.deps.fileLog ?? noopScopedLogger;
  }

  private attemptFileContext(
    item: QueueItem,
    episode: number,
    provider: string,
    server: string,
  ): { provider?: string; queueId: string; episode: number; server: string } {
    return {
      ...(provider ? { provider } : {}),
      queueId: item.id,
      episode,
      server,
    };
  }

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
    const serversTried: string[] = [];
    let attempts = 0;
    let totalDurationMs = 0;
    let finalServer: string | null = null;
    let lastFailureCategory: ServerFailureCategory | null = null;
    try {
      for (let index = 0; index < sortedLinks.length; index += 1) {
        const link = sortedLinks[index];
        if (episodeAbort.signal.aborted) break;
        const speed = this.deps.getServerSpeed(link.server) || '–';
        const resolvedLabel = link.sourceEpisode !== episode ? ` (fuente EP ${link.sourceEpisode})` : '';
        const totalAttempts = sortedLinks.length;
        const attemptIndex = index + 1;
        this.deps.sendLog(
          `Intentando "${link.server}" desde ${link.provider}${resolvedLabel} (${speed})... (EP ${episode} · intento ${attemptIndex}/${totalAttempts})`,
          'info',
        );
        this.fileLog.info(
          `Intentando "${link.server}" (${speed}) (intento ${attemptIndex}/${totalAttempts})`,
          this.attemptFileContext(
            item,
            episode,
            String(link.provider || ''),
            String(link.canonicalServer || link.server || ''),
          ),
        );
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
        const durationMs = Date.now() - startedAt;
        const canonicalServer = String(link.canonicalServer || link.server || '');
        serversTried.push(canonicalServer);
        attempts += 1;
        totalDurationMs += durationMs;
        const failureCategory = categorizeAttemptFailure({
          success: result.success,
          parentAborted: result.parentAborted,
          skipRequested: result.skipRequested,
          attemptTimedOut: result.attemptTimedOut,
          invalidMp4: result.invalidMp4,
          toolFailureMessage: result.toolFailureMessage,
        });
        lastFailureCategory = failureCategory;
        if (result.success) finalServer = canonicalServer;
        success = result.success;
        // Sufijo diagnóstico del intento (sin URLs ni secretos).
        const isLast = index === sortedLinks.length - 1;
        const nextLabel = isLast ? 'fin' : `fallback → ${sortedLinks[index + 1].server}`;
        const providerLabel = String(link.provider || '');
        const outcomeTag =
          `EP ${episode} · intento ${attemptIndex}/${totalAttempts} · ${providerLabel}` +
          ` · ${canonicalServer} · ${failureCategory ?? 'success'}` +
          ` · ${(durationMs / 1000).toFixed(1)}s · ${success ? 'fin' : nextLabel}`;
        try {
          this.deps.recordServerOutcome?.({
            provider: String(link.provider || ''),
            server: canonicalServer,
            resolveSuccess: result.started || result.success,
            downloadStart: result.started || result.success,
            downloadSuccess: result.success,
            failureCategory,
            durationMs,
            attemptIndex,
          });
        } catch {
          // La observabilidad nunca rompe descargas.
        }

        if (success) {
          const elapsedMs = Date.now() - startedAt;
          this.deps.sendLog(
            `EP ${episode} descargado desde "${link.server}"${resolvedLabel} en ${(elapsedMs / 1000).toFixed(1)}s` +
              ` (intento ${attemptIndex}/${totalAttempts})`,
            'success',
          );
          this.fileLog.info(
            `EP ${episode} descargado desde "${link.server}" en ${(elapsedMs / 1000).toFixed(1)}s (intento ${attemptIndex}/${totalAttempts})`,
            this.attemptFileContext(item, episode, providerLabel, canonicalServer),
          );
          this.deps.sendStatus(`EP ${episode} Completado`, item.episodes.length > 1);
          break;
        }
        if (result.invalidMp4) {
          this.fileLog.warn(
            `"${link.server}" sin archivo válido (intento ${attemptIndex}/${totalAttempts})`,
            this.attemptFileContext(item, episode, providerLabel, canonicalServer),
          );
          continue;
        }
        if (result.attemptTimedOut && !result.parentAborted) {
          failureReason = `El servidor "${link.server}" no inició la descarga a tiempo`;
          const timeoutSec = this.deps.getStartTimeoutSec();
          this.deps.sendLog(
            `"${link.server}" no inició descarga en ${timeoutSec}s. Probando siguiente... (${outcomeTag})`,
            'warn',
          );
          this.fileLog.warn(
            `"${link.server}" sin inicio en ${timeoutSec}s (${outcomeTag})`,
            this.attemptFileContext(item, episode, providerLabel, canonicalServer),
          );
          await this.deps.cleanEpisodeTemps(dest);
          await this.deps.cleanEpisodeCache(dest);
        } else if (result.toolFailureMessage && !result.parentAborted) {
          failureReason = result.toolFailureMessage;
          // Intermedio con fallback: warn; el último servidor es error.
          this.deps.sendLog(`${result.toolFailureMessage} (${outcomeTag})`, isLast ? 'error' : 'warn');
          if (isLast)
            this.fileLog.error(
              `${result.toolFailureMessage} (${outcomeTag})`,
              this.attemptFileContext(item, episode, providerLabel, canonicalServer),
            );
          else
            this.fileLog.warn(
              `${result.toolFailureMessage} (${outcomeTag})`,
              this.attemptFileContext(item, episode, providerLabel, canonicalServer),
            );
          await this.deps.cleanEpisodeCache(dest);
        } else if (!result.parentAborted) {
          await this.deps.cleanEpisodeCache(dest);
          if (result.skipRequested) {
            this.deps.sendLog(
              `"${link.server}" cancelado, probando siguiente...${isLast ? ' (Último servidor)' : ''} (${outcomeTag})`,
              'warn',
            );
            this.fileLog.warn(
              `"${link.server}" salto manual (${outcomeTag})`,
              this.attemptFileContext(item, episode, providerLabel, canonicalServer),
            );
          } else {
            // Intermedio con fallback: warn; sin más servidores es error.
            this.deps.sendLog(
              `"${link.server}" falló.${isLast ? ' Sin más servidores.' : ' Probando siguiente...'} (${outcomeTag})`,
              isLast ? 'error' : 'warn',
            );
            if (isLast)
              this.fileLog.error(
                `"${link.server}" falló sin más servidores (${outcomeTag})`,
                this.attemptFileContext(item, episode, providerLabel, canonicalServer),
              );
            else
              this.fileLog.warn(
                `"${link.server}" falló (${outcomeTag})`,
                this.attemptFileContext(item, episode, providerLabel, canonicalServer),
              );
          }
        }
      }
    } finally {
      port.release();
    }
    // Un resumen por EP; best-effort, sin efecto en la descarga.
    if (attempts > 0) {
      try {
        this.deps.recordEpisodeOutcome?.({
          provider: String(item.providerId || sortedLinks[0]?.provider || ''),
          episode,
          success,
          attempts,
          serversTried: [...serversTried],
          finalServer,
          fallbackTriggered: attempts > 1,
          totalDurationMs,
          failureCategory: success ? null : lastFailureCategory,
        });
      } catch {
        // La observabilidad nunca rompe descargas.
      }
    }
    return { success, failureReason };
  }
}
