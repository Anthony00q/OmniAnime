import type { ProviderDownloadLink, QueueItem } from '../../types/queue';
import type { EpisodeAttemptProgress, EpisodeDownloadAttemptService } from './EpisodeDownloadAttemptService';
import { DownloadCoordinator, type FallbackAttemptPort } from './DownloadCoordinator';
import type { EpisodeDownloadSummary, ServerAttemptOutcome } from '../persistence/ServerStatsStore';
import { noopScopedLogger, type ScopedLogger } from '../logging/AppLogger';
import type { QueueStore } from '../persistence/QueueStore';
import type { PauseController } from './PauseController';
import { queueFileContext } from './PauseController';

export interface RetryPolicyDeps {
  queueStore: QueueStore;
  attemptService: EpisodeDownloadAttemptService;
  getServerSpeed: (server: string) => string;
  sendLog: (message: string, type?: 'info' | 'success' | 'error' | 'warn') => void;
  sendStatus: (message: string, isBatch?: boolean) => void;
  updateTray: (text?: string) => void;
  scheduleQueueUpdate?: () => void;
  sendQueueUpdate: () => void;
  // Observabilidad por servidor (opcional, best-effort, sin URLs).
  recordServerOutcome?: (outcome: ServerAttemptOutcome) => void;
  recordEpisodeOutcome?: (summary: EpisodeDownloadSummary) => void;
  getDownloadSettings?: () => { startTimeoutSec?: number } | undefined;
  logger?: ScopedLogger;
  pause: PauseController;
  // Coordinador de fallback (opcional): por defecto se construye desde las deps.
  coordinator?: DownloadCoordinator;
}

// Reintentos y fallback de servidores: único punto que habla con el
// DownloadCoordinator y dueño del reintento manual y del skip-server.
export class RetryPolicy {
  private readonly retryOnlyIds = new Set<string>();
  private readonly coordinator: DownloadCoordinator;

  constructor(private readonly deps: RetryPolicyDeps) {
    const schedule = deps.scheduleQueueUpdate;
    this.coordinator =
      deps.coordinator ??
      new DownloadCoordinator({
        getServerSpeed: (server) => this.deps.getServerSpeed(server),
        sendLog: (message, type) => this.deps.sendLog(message, type),
        sendStatus: (message, isBatch) => this.deps.sendStatus(message, isBatch),
        updateTray: (text) => this.deps.updateTray(text),
        // scheduleQueueUpdate es opcional (los tests lo omiten a veces):
        // se propaga tal cual para conservar la rama condicional original.
        scheduleQueueUpdate: schedule ? () => schedule() : undefined,
        sendQueueUpdate: () => this.deps.sendQueueUpdate(),
        fileLog: this.deps.logger,
        recordServerOutcome: (outcome) => this.deps.recordServerOutcome?.(outcome),
        recordEpisodeOutcome: (summary) => this.deps.recordEpisodeOutcome?.(summary),
        cleanEpisodeTemps: (dest) => this.deps.attemptService.cleanEpisodeTemps(dest),
        cleanEpisodeCache: (dest) => this.deps.attemptService.cleanEpisodeCacheForEpisode(dest),
        getStartTimeoutSec: () => this.getStartTimeoutSec(),
      });
  }

  private get fileLog(): ScopedLogger {
    return this.deps.logger ?? noopScopedLogger;
  }

  isRetryOnly(id: string): boolean {
    return this.retryOnlyIds.has(id);
  }

  clearRetryOnly(id: string): void {
    this.retryOnlyIds.delete(id);
  }

  retryFailed(id: string): boolean {
    const item = this.deps.queueStore.items.find((queueItem) => queueItem.id === id);
    if (!item || item.failedEps.length === 0 || (item.status !== 'failed' && item.status !== 'done')) return false;

    item.status = 'pending';
    item.currentEp = null;
    item.currentServer = undefined;
    item.progress = 0;
    this.deps.pause.clearCancelled(id);
    this.retryOnlyIds.add(id);

    if (item.failureReasons) {
      const nextReasons = { ...item.failureReasons };
      for (const episode of item.failedEps) delete nextReasons[String(episode)];
      item.failureReasons = Object.keys(nextReasons).length > 0 ? nextReasons : undefined;
    }

    this.fileLog.info(
      `Reintento manual de fallidos: ${item.animeTitle} (${item.failedEps.length} ep)`,
      queueFileContext(item),
    );
    return true;
  }

  sortLinksForEpisode(
    links: ProviderDownloadLink[],
    order: string[],
    preferredServer?: string,
  ): ProviderDownloadLink[] {
    return this.coordinator.sortLinksForEpisode(links, order, preferredServer);
  }

  // Fallback secuencial por episodio: delega en el coordinador con el puerto de SlotScheduler.
  async attemptServersSequentially(
    item: QueueItem,
    episode: number,
    dest: string,
    episodeAbort: AbortController,
    sortedLinks: ProviderDownloadLink[],
    onProgress: (update: EpisodeAttemptProgress) => void,
    onServerChange: ((server: string) => void) | undefined,
    port: FallbackAttemptPort,
  ): Promise<{ success: boolean; failureReason: string }> {
    return this.coordinator.attemptServersSequentially(
      item,
      episode,
      dest,
      episodeAbort,
      sortedLinks,
      onProgress,
      onServerChange,
      port,
    );
  }

  skip(id: string, episode?: number): boolean {
    const item = this.deps.queueStore.items.find((queueItem) => queueItem.id === id);
    if (episode !== undefined) {
      if (!Number.isInteger(episode)) return false;
      if (id !== this.deps.pause.activeItemId) return false;
      // Alcance EP: nunca caer al skip global (abortaría todos los EPs/items).
      try {
        const svc = this.deps.attemptService as unknown as {
          skipEpisode?: (itemId: string, ep: number) => boolean;
        };
        const ok =
          typeof svc.skipEpisode === 'function' ? svc.skipEpisode.call(this.deps.attemptService, id, episode) : false;
        if (ok && item) this.fileLog.info(`EP ${episode} salto manual de servidor`, queueFileContext(item, episode));
        // Avisar ya para que la UI muestre el cambio sin esperar progreso.
        if (ok) {
          try {
            this.deps.sendQueueUpdate();
          } catch {
            /* aviso best-effort, nunca rompe el salto */
          }
        }
        return ok;
      } catch {
        return false;
      }
    }
    if (id !== this.deps.pause.activeItemId) return false;
    // Alcance item: solo EPs de este item, sin contaminar otros items en vuelo.
    // Sin fallback al skip global: abortaría todos los EPs/items.
    try {
      const svc = this.deps.attemptService as unknown as {
        skipItem?: (itemId: string) => boolean;
      };
      if (typeof svc.skipItem !== 'function') return false;
      const ok = svc.skipItem.call(this.deps.attemptService, id);
      if (ok && item) this.fileLog.info(`Salto manual de servidor: ${item.animeTitle}`, queueFileContext(item));
      // Avisar ya para que la UI muestre el cambio sin esperar progreso.
      if (ok) {
        try {
          this.deps.sendQueueUpdate();
        } catch {
          /* aviso best-effort, nunca rompe el salto */
        }
      }
      return ok;
    } catch {
      return false;
    }
  }

  skipEpisode(id: string, episode: number): boolean {
    return this.skip(id, episode);
  }

  cleanupStaleIds(): void {
    for (const id of Array.from(this.retryOnlyIds)) {
      const exists = this.deps.queueStore.items.some((i) => i.id === id);
      if (!exists) {
        this.retryOnlyIds.delete(id);
        try {
          (this.deps.attemptService as unknown as { forgetItem?: (itemId: string) => void }).forgetItem?.(id);
        } catch {
          /* limpieza best-effort */
        }
      }
    }
  }

  getStartTimeoutSec(): number {
    try {
      const raw = this.deps.getDownloadSettings?.()?.startTimeoutSec;
      const n = typeof raw === 'number' ? Math.round(raw) : 90;
      if (!Number.isFinite(n)) return 90;
      return Math.max(30, Math.min(120, n));
    } catch {
      return 90;
    }
  }
}
