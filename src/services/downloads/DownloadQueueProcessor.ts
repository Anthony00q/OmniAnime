import type { HistoryWriteRecord } from '../../types/history';
import type { ProviderDownloadLink, QueueItem } from '../../types/queue';
import { EpisodeDownloadAttemptService } from './EpisodeDownloadAttemptService';
import type { DownloadCoordinator } from './DownloadCoordinator';
import { SlotScheduler } from './SlotScheduler';
import { ensureEpArrays, PauseController, type PausedProgressSink } from './PauseController';
import { RetryPolicy } from './RetryPolicy';
import type { EpisodeDownloadSummary, ServerAttemptOutcome } from '../persistence/ServerStatsStore';
import { noopScopedLogger, type ScopedLogger } from '../logging/AppLogger';
import { QueueStore } from '../persistence/QueueStore';

export type { EpisodeGateReason, PausedProgressSink } from './PauseController';

export type DownloadNotificationType =
  'showDownloadStarted' | 'showDownloadFinished' | 'showDownloadError' | 'showSystemMessages';

export interface DownloadQueueProcessorOptions {
  queueStore: QueueStore;
  attemptService: EpisodeDownloadAttemptService;
  abortDownloadService: () => void;
  getDownloadSettings?: () =>
    | {
        maxParallelEpisodes?: number;
        allowContinue?: boolean;
        startTimeoutSec?: number;
      }
    | undefined;
  pausedProgress?: PausedProgressSink;
  getEpisodeLinks: (item: QueueItem, episode: number, signal: AbortSignal) => Promise<ProviderDownloadLink[]>;
  getServerPriorityOrder: (providerId?: string) => string[];
  getServerSpeed: (server: string) => string;
  buildEpisodePath: (item: QueueItem, episode: number) => string;
  writeHistory: (record: HistoryWriteRecord) => boolean;
  sendLog: (message: string, type?: 'info' | 'success' | 'error' | 'warn') => void;
  sendProgressLog: (logId: string, message: string) => void;
  sendStatus: (message: string, isBatch?: boolean) => void;
  updateTray: (text?: string) => void;
  scheduleQueueUpdate: () => void;
  scheduleQueueProgress?: (
    item: QueueItem,
    activeEps?: import('../persistence/QueueStore').ActiveEpisodeProgress[],
  ) => void;
  sendQueueUpdate: () => void;
  // Observabilidad por servidor (opcional, best-effort, sin URLs).
  recordServerOutcome?: (outcome: ServerAttemptOutcome) => void;
  recordEpisodeOutcome?: (summary: EpisodeDownloadSummary) => void;
  sendDownloadStarted: (item: QueueItem) => void;
  sendEpisodeDownloaded: (item: QueueItem, episode: number, success: boolean) => void;
  sendNotification: (title: string, body: string, type: DownloadNotificationType) => void;
  isMainWindowFocused: () => boolean;
  shouldNotifyCompletion: () => boolean;
  logError: (error: unknown) => void;
  logger?: ScopedLogger;
  // Coordinador de fallback por episodio (opcional): por defecto se construye
  // desde el resto de opciones, así los constructores existentes no cambian.
  coordinator?: DownloadCoordinator;
}

export class DownloadQueueProcessor {
  private isProcessingQueue = false;
  private readonly slots: SlotScheduler;
  private readonly pauseController: PauseController;
  private readonly retry: RetryPolicy;

  constructor(private readonly options: DownloadQueueProcessorOptions) {
    this.pauseController = new PauseController({
      queueStore: options.queueStore,
      attemptService: options.attemptService,
      pausedProgress: options.pausedProgress,
      getDownloadSettings: () => options.getDownloadSettings?.(),
      buildEpisodePath: (item, episode) => options.buildEpisodePath(item, episode),
      writeHistory: (record) => options.writeHistory(record),
      sendQueueUpdate: () => options.sendQueueUpdate(),
      updateTray: (text) => options.updateTray(text),
      abortDownloadService: () => options.abortDownloadService(),
      logger: options.logger,
    });
    this.retry = new RetryPolicy({
      queueStore: options.queueStore,
      attemptService: options.attemptService,
      getServerSpeed: (server) => options.getServerSpeed(server),
      sendLog: (message, type) => options.sendLog(message, type),
      sendStatus: (message, isBatch) => options.sendStatus(message, isBatch),
      updateTray: (text) => options.updateTray(text),
      scheduleQueueUpdate: options.scheduleQueueUpdate ? () => options.scheduleQueueUpdate() : undefined,
      sendQueueUpdate: () => options.sendQueueUpdate(),
      recordServerOutcome: (outcome) => options.recordServerOutcome?.(outcome),
      recordEpisodeOutcome: (summary) => options.recordEpisodeOutcome?.(summary),
      getDownloadSettings: () => options.getDownloadSettings?.(),
      logger: options.logger,
      pause: this.pauseController,
      coordinator: options.coordinator,
    });
    this.slots = new SlotScheduler({
      options,
      pause: this.pauseController,
      retry: this.retry,
    });
  }

  private get fileLog(): ScopedLogger {
    return this.options.logger ?? noopScopedLogger;
  }

  // Los tests fijan este campo por cast; se conserva como puente al controlador.
  private get activeQueueItemId(): string | null {
    return this.pauseController.activeItemId;
  }

  private set activeQueueItemId(value: string | null) {
    this.pauseController.setActiveItem(value);
  }

  get activeItemId(): string | null {
    return this.pauseController.activeItemId;
  }

  hasActiveDownloads(): boolean {
    return this.options.queueStore.items.some((item) => item.status === 'downloading');
  }

  cancel(id: string): boolean {
    return this.pauseController.cancel(id);
  }

  pause(id: string): boolean {
    return this.pauseController.pause(id);
  }

  async cancelEpisode(id: string, episode: number): Promise<boolean> {
    return this.pauseController.cancelEpisode(id, episode);
  }

  pauseEpisode(id: string, episode: number): boolean {
    return this.pauseController.pauseEpisode(id, episode);
  }

  resumeEpisode(id: string, episode: number): boolean {
    return this.pauseController.resumeEpisode(id, episode);
  }

  resume(id: string): boolean {
    return this.pauseController.resume(id);
  }

  skip(id: string, episode?: number): boolean {
    return this.retry.skip(id, episode);
  }

  skipEpisode(id: string, episode: number): boolean {
    return this.retry.skipEpisode(id, episode);
  }

  retryFailed(id: string): boolean {
    return this.retry.retryFailed(id);
  }

  /** Limpia ids de items que ya no existen o son terminales */
  private cleanupStaleIds(): void {
    this.retry.cleanupStaleIds();
    this.pauseController.cleanupStaleIds();
  }

  /** Al quitar items por fuera (clear/remove) */
  notifyItemsRemoved(removedIds: string[]): void {
    for (const id of removedIds) this.retry.clearRetryOnly(id);
    this.pauseController.notifyItemsRemoved(removedIds);
    this.cleanupStaleIds();
  }

  async processQueue(): Promise<void> {
    if (this.isProcessingQueue) {
      this.fileLog.debug('processQueue ya está en ejecución.');
      return;
    }

    this.isProcessingQueue = true;
    this.fileLog.debug('Iniciando processQueue...');
    let restartQueueAfterError = false;

    try {
      while (true) {
        const item = this.options.queueStore.items.find((queueItem) => queueItem.status === 'pending');
        if (!item) {
          this.options.updateTray();
          break;
        }

        item.status = 'downloading';
        ensureEpArrays(item);
        const runEpoch = this.slots.beginRun(item.id);
        const rawList = this.retry.isRetryOnly(item.id) ? [...item.failedEps] : item.episodes;
        const episodesToProcess = this.pauseController.getWorkList(item, rawList);
        this.fileLog.info(`Procesando item: ${item.animeTitle}`, { queueId: item.id, provider: item.providerId });
        this.options.updateTray(`Descargando ${item.animeTitle}...`);
        this.options.sendQueueUpdate();
        if (!this.options.isMainWindowFocused()) {
          this.options.sendNotification('Descarga Iniciada', `Iniciando: ${item.animeTitle}`, 'showDownloadStarted');
        }
        this.options.sendDownloadStarted(item);
        this.options.sendLog(
          `Iniciando "${item.animeTitle}" — ${this.formatEpisodeCountLabel(episodesToProcess.length, true)} en cola`,
          'info',
        );
        this.options.sendStatus(`Iniciando "${item.animeTitle}"`, episodesToProcess.length > 1);

        const maxParallel = this.getMaxParallelEpisodes();
        if (maxParallel <= 1) {
          await this.slots.runSequential(item, episodesToProcess, runEpoch);
        } else {
          await this.slots.runParallel(item, episodesToProcess, maxParallel);
        }

        if ((item.status as string) === 'paused' || this.pauseController.isItemPaused(item.id)) {
          item.status = 'paused';
          this.options.sendStatus(`Pausado: ${item.animeTitle}`, item.episodes.length > 1);
        } else if ((item.status as string) !== 'cancelled') {
          const pausedCount = (item.pausedEps || []).length;
          if (pausedCount > 0) {
            item.status = 'paused';
            this.pauseController.setItemPaused(item.id);
            this.options.sendStatus(`Pausado: ${item.animeTitle}`, item.episodes.length > 1);
          } else {
            const cancelledSet = new Set<number>(item.cancelledEps || []);
            const completedSet = new Set<number>(item.completedEps || []);
            const failedSet = new Set<number>(item.failedEps || []);
            const unaccounted = (item.episodes || []).filter(
              (ep) => !completedSet.has(ep) && !failedSet.has(ep) && !cancelledSet.has(ep),
            );
            // Resume en vuelo: un EP pausado que se reanudó mientras el resto seguía
            // queda sin contabilizar; reencolar en vez de marcar done parcial.
            if (unaccounted.length > 0 && item.failedEps.length === 0) {
              const stillActive = this.pauseController.hasEpisodeControllersFor(item.id);
              if (!stillActive) {
                item.status = 'pending';
                this.options.sendStatus(`Reencolado: ${item.animeTitle} (${unaccounted.length} pendiente(s))`, true);
                this.options.sendQueueUpdate();
                item.currentEp = null;
                this.options.updateTray();
                this.pauseController.clearCancelled(item.id);
                this.retry.clearRetryOnly(item.id);
                this.pauseController.clearItemPaused(item.id);
                continue;
              }
            }
            const cancelledCount = cancelledSet.size;
            item.status = item.failedEps.length > 0 ? 'failed' : 'done';
            this.options.sendStatus(
              item.failedEps.length > 0
                ? `Cola de "${item.animeTitle}" finalizada con errores`
                : cancelledCount > 0
                  ? `Cola de "${item.animeTitle}" completada parcial (${cancelledCount} cancelado(s))`
                  : `¡Cola de "${item.animeTitle}" completada!`,
              item.episodes.length > 1,
            );
            if (this.options.shouldNotifyCompletion()) {
              this.options.sendNotification(
                item.failedEps.length > 0 ? 'Descarga con errores' : 'Descarga Completada',
                item.failedEps.length > 0
                  ? `Algunos episodios de ${item.animeTitle} no se pudieron descargar.`
                  : cancelledCount > 0
                    ? `${item.animeTitle}: ${cancelledCount} episodio(s) cancelado(s), resto completado.`
                    : `Todos los episodios de ${item.animeTitle} han finalizado.`,
                item.failedEps.length > 0 ? 'showDownloadError' : 'showDownloadFinished',
              );
            }
          }
        }
        item.currentEp = null;
        this.options.updateTray();
        this.pauseController.clearCancelled(item.id);
        this.retry.clearRetryOnly(item.id);
        if ((item.status as string) !== 'paused') {
          this.pauseController.clearItemPaused(item.id);
          // Pausados individuales que quedaron sin procesar se conservan para resume;
          // cancelados se conservan como parcial.
        }
        if ((item.status as string) === 'done' || item.status === 'failed' || (item.status as string) === 'cancelled') {
          try {
            (this.options.attemptService as unknown as { forgetItem?: (id: string) => void }).forgetItem?.(item.id);
          } catch {
            /* limpieza best-effort */
          }
        }
        this.options.sendQueueUpdate();
      }
    } catch (error) {
      this.options.logError(error);
      const failedItem = this.options.queueStore.items.find((item) => item.status === 'downloading');
      if (failedItem) {
        const wasCancelled = this.pauseController.isCancelled(failedItem.id) || failedItem.status === 'cancelled';
        this.retry.clearRetryOnly(failedItem.id);
        this.pauseController.clearCancelled(failedItem.id);
        if (!wasCancelled && failedItem.currentEp !== null) {
          const failedEpisode = failedItem.currentEp;
          const failedPath = this.options.buildEpisodePath(failedItem, failedEpisode);
          await this.options.attemptService.cleanEpisodeCacheForEpisode(failedPath);
          this.slots.finalizeEpisodeResult(
            failedItem,
            failedEpisode,
            failedPath,
            'fail',
            'La descarga terminó por un error inesperado',
          );
          failedItem.status = 'failed';
          this.options.sendLog(`La descarga de "${failedItem.animeTitle}" terminó por un error inesperado.`, 'error');
        } else if (wasCancelled) {
          failedItem.status = 'cancelled';
        } else {
          failedItem.status = 'failed';
        }
        failedItem.currentEp = null;
        this.options.sendQueueUpdate();
      }
      restartQueueAfterError = this.options.queueStore.items.some((item) => item.status === 'pending');
    } finally {
      this.pauseController.clearControllers();
      this.isProcessingQueue = false;
      this.cleanupStaleIds();
      this.fileLog.debug('processQueue finalizado.');
      if (restartQueueAfterError) {
        setImmediate(() => this.processQueue().catch(this.options.logError));
      }
    }
  }

  private getMaxParallelEpisodes(): number {
    try {
      const raw = this.options.getDownloadSettings?.()?.maxParallelEpisodes;
      const n = typeof raw === 'number' ? Math.round(raw) : 1;
      if (!Number.isFinite(n)) return 1;
      return Math.max(1, Math.min(3, n));
    } catch {
      return 1;
    }
  }

  // Orden de servidores: los tests acceden por cast a este nombre/firma,
  // se conserva como wrapper.
  private sortLinksForEpisode(
    links: ProviderDownloadLink[],
    order: string[],
    preferredServer?: string,
  ): ProviderDownloadLink[] {
    return this.retry.sortLinksForEpisode(links, order, preferredServer);
  }

  private formatEpisodeCountLabel(count: number, short = false): string {
    const total = Number(count) || 0;
    if (short) return `${total} ${total === 1 ? 'ep' : 'eps'}`;
    return `${total} ${total === 1 ? 'episodio' : 'episodios'}`;
  }
}
