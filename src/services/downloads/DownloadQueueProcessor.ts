import type { HistoryStatus, HistoryWriteRecord } from '../../types/history';
import type { ProviderDownloadLink, QueueItem } from '../../types/queue';
import type { EpisodeAttemptProgress } from './EpisodeDownloadAttemptService';
import { EpisodeDownloadAttemptService } from './EpisodeDownloadAttemptService';
import { DownloadCoordinator } from './DownloadCoordinator';
import { SlotScheduler } from './SlotScheduler';
import {
  ensureEpArrays,
  PauseController,
  type PausedProgressSink,
  pushUniqueEpisode,
  queueFileContext,
  removeEpisode,
  removeFailureReason,
} from './PauseController';
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
  private readonly retryOnlyIds = new Set<string>();
  // Época por item-run: los workers zombis (run ya terminado) deben salir, no reintentar
  private readonly runEpoch = new Map<string, number>();
  private isProcessingQueue = false;
  private readonly coordinator: DownloadCoordinator;
  private readonly slots: SlotScheduler;
  private readonly pauseController: PauseController;

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
    this.slots = new SlotScheduler({
      attemptService: options.attemptService,
      isEpisodeInterrupted: (item, episode) => this.pauseController.episodeInterrupted(item, episode),
    });
    this.coordinator =
      options.coordinator ??
      new DownloadCoordinator({
        getServerSpeed: (server) => this.options.getServerSpeed(server),
        sendLog: (message, type) => this.options.sendLog(message, type),
        sendStatus: (message, isBatch) => this.options.sendStatus(message, isBatch),
        updateTray: (text) => this.options.updateTray(text),
        // scheduleQueueUpdate es opcional (los tests lo omiten a veces):
        // se propaga tal cual para conservar la rama condicional original.
        scheduleQueueUpdate: this.options.scheduleQueueUpdate ? () => this.options.scheduleQueueUpdate() : undefined,
        sendQueueUpdate: () => this.options.sendQueueUpdate(),
        fileLog: this.options.logger,
        recordServerOutcome: (outcome) => this.options.recordServerOutcome?.(outcome),
        recordEpisodeOutcome: (summary) => this.options.recordEpisodeOutcome?.(summary),
        cleanEpisodeTemps: (dest) => this.options.attemptService.cleanEpisodeTemps(dest),
        cleanEpisodeCache: (dest) => this.options.attemptService.cleanEpisodeCacheForEpisode(dest),
        getStartTimeoutSec: () => this.getStartTimeoutSec(),
      });
  }

  private get fileLog(): ScopedLogger {
    return this.options.logger ?? noopScopedLogger;
  }

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
    const item = this.options.queueStore.items.find((queueItem) => queueItem.id === id);
    if (episode !== undefined) {
      if (!Number.isInteger(episode)) return false;
      if (id !== this.pauseController.activeItemId) return false;
      // Alcance EP: nunca caer al skip global (abortaría todos los EPs/items).
      try {
        const svc = this.options.attemptService as unknown as {
          skipEpisode?: (itemId: string, ep: number) => boolean;
        };
        const ok =
          typeof svc.skipEpisode === 'function'
            ? svc.skipEpisode.call(this.options.attemptService, id, episode)
            : false;
        if (ok && item) this.fileLog.info(`EP ${episode} salto manual de servidor`, queueFileContext(item, episode));
        // Avisar ya para que la UI muestre el cambio sin esperar progreso.
        if (ok) {
          try {
            this.options.sendQueueUpdate();
          } catch {
            /* aviso best-effort, nunca rompe el salto */
          }
        }
        return ok;
      } catch {
        return false;
      }
    }
    if (id !== this.pauseController.activeItemId) return false;
    // Alcance item: solo EPs de este item, sin contaminar otros items en vuelo.
    // Sin fallback al skip global: abortaría todos los EPs/items.
    try {
      const svc = this.options.attemptService as unknown as {
        skipItem?: (itemId: string) => boolean;
      };
      if (typeof svc.skipItem !== 'function') return false;
      const ok = svc.skipItem.call(this.options.attemptService, id);
      if (ok && item) this.fileLog.info(`Salto manual de servidor: ${item.animeTitle}`, queueFileContext(item));
      // Avisar ya para que la UI muestre el cambio sin esperar progreso.
      if (ok) {
        try {
          this.options.sendQueueUpdate();
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

  retryFailed(id: string): boolean {
    const item = this.options.queueStore.items.find((queueItem) => queueItem.id === id);
    if (!item || item.failedEps.length === 0 || (item.status !== 'failed' && item.status !== 'done')) return false;

    item.status = 'pending';
    item.currentEp = null;
    item.currentServer = undefined;
    item.progress = 0;
    this.pauseController.clearCancelled(id);
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

  /** Cleanup stale ids for items that no longer exist or are terminal */
  private cleanupStaleIds(): void {
    const forget = (id: string): void => {
      try {
        (this.options.attemptService as unknown as { forgetItem?: (itemId: string) => void }).forgetItem?.(id);
      } catch {
        /* limpieza best-effort */
      }
    };
    for (const id of Array.from(this.retryOnlyIds)) {
      const exists = this.options.queueStore.items.some((i) => i.id === id);
      if (!exists) {
        this.retryOnlyIds.delete(id);
        forget(id);
      }
    }
    this.pauseController.cleanupStaleIds();
  }

  /** Called when queue items are removed externally (clear/remove) */
  notifyItemsRemoved(removedIds: string[]): void {
    for (const id of removedIds) this.retryOnlyIds.delete(id);
    this.pauseController.notifyItemsRemoved(removedIds);
    this.cleanupStaleIds();
  }

  private bumpRunEpoch(id: string): number {
    const next = (this.runEpoch.get(id) || 0) + 1;
    this.runEpoch.set(id, next);
    return next;
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
        const runEpoch = this.bumpRunEpoch(item.id);
        const rawList = this.retryOnlyIds.has(item.id) ? [...item.failedEps] : item.episodes;
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
          for (let cursor = 0; cursor < episodesToProcess.length; cursor += 1) {
            const episode = episodesToProcess[cursor];
            if (this.pauseController.isCancelled(item.id)) {
              item.status = 'cancelled';
              this.options.updateTray();
              this.options.sendQueueUpdate();
              this.options.sendLog(`Descarga de "${item.animeTitle}" cancelada por el usuario`, 'warn');
              this.options.sendStatus(`Cancelado: ${item.animeTitle}`, episodesToProcess.length > 1);
              break;
            }
            if (this.pauseController.isItemPaused(item.id) || (item.status as string) === 'paused') {
              item.status = 'paused';
              this.options.updateTray();
              this.options.sendQueueUpdate();
              this.options.sendLog(`Descarga de "${item.animeTitle}" pausada por el usuario`, 'warn');
              break;
            }
            if ((item.cancelledEps || []).includes(episode)) continue;
            if ((item.pausedEps || []).includes(episode)) continue;

            item.currentEp = episode;
            // Siembra anti-flash con el % congelado solo si retoma Mega
            // (único resume real); el resto arranca de cero honesto.
            item.progress = this.pauseController.frozenBaseline(
              item,
              episode,
              item.pausedEpSnapshot?.[String(episode)]?.server,
            );
            this.options.updateTray(`Preparando ${item.animeTitle} - EP ${episode}...`);
            this.options.sendQueueUpdate();
            this.options.sendLog(`Buscando servidores para EP ${episode}...`, 'info');
            this.options.sendLog(`Ruta activa: ${item.downloadSlug || item.slug}`, 'info');
            this.options.sendStatus(`Buscando EP ${episode}...`, episodesToProcess.length > 1);

            const dest = this.options.buildEpisodePath(item, episode);
            if (this.options.attemptService.hasCompletedFile(dest)) {
              this.options.sendLog(`EP ${episode} ya existe en disco. Omitiendo.`, 'info');
              removeEpisode(item.failedEps, episode);
              pushUniqueEpisode(item.completedEps, episode);
              removeFailureReason(item, episode);
              continue;
            }

            this.removeEpisode(item.completedEps, episode);
            removeEpisode(item.failedEps, episode);

            const episodeAbort = this.pauseController.beginEpisode(item.id, episode);
            const links = await this.options.getEpisodeLinks(item, episode, episodeAbort.signal);

            if (episodeAbort.signal.aborted || this.pauseController.isCancelled(item.id)) {
              if ((item.cancelledEps || []).includes(episode)) {
                this.finalizeEpisodeResult(item, episode, dest, 'cancelled');
                this.pauseController.endEpisode(item.id, episode);
                this.pauseController.clearActiveItemIfIdle();
                this.options.sendQueueUpdate();
                this.options.sendLog(`EP ${episode}: cancelado por el usuario (sigue el resto)`, 'warn');
                continue;
              }
              if (this.pauseController.isItemPaused(item.id)) {
                item.status = 'paused';
                this.pauseController.endEpisode(item.id, episode);
                this.pauseController.clearActiveItemIfIdle();
                this.options.sendQueueUpdate();
                this.options.sendLog(`EP ${episode}: pausado por el usuario`, 'warn');
                break;
              }
              if ((item.pausedEps || []).includes(episode)) {
                this.pauseController.endEpisode(item.id, episode);
                this.pauseController.clearActiveItemIfIdle();
                this.options.sendQueueUpdate();
                this.options.sendLog(`EP ${episode}: pausado (slot liberado, en espera de resume/cancel)`, 'warn');
                const reason = await this.pauseController.parkEpisode(item.id, episode);
                if (this.runEpoch.get(item.id) !== runEpoch) break;
                if (reason === 'resume') {
                  cursor -= 1;
                  continue;
                }
                if (reason === 'cancel') {
                  this.finalizeEpisodeResult(item, episode, dest, 'cancelled');
                  this.options.sendQueueUpdate();
                  continue;
                }
                break;
              }
              if (this.pauseController.consumeSettledResume(item.id, episode)) {
                // Pausa+reanudar durante el aborto: reintentar el mismo EP
                this.pauseController.endEpisode(item.id, episode);
                this.pauseController.clearActiveItemIfIdle();
                this.options.sendQueueUpdate();
                cursor -= 1;
                continue;
              }
              if ((item.status as string) === 'pending') {
                // Reanudado mientras el aborto seguía en vuelo: no finalizar,
                // el EP queda sin contabilizar y la finalización lo reencola
                this.pauseController.endEpisode(item.id, episode);
                this.pauseController.clearActiveItemIfIdle();
                this.options.sendQueueUpdate();
                continue;
              }
              item.status = 'cancelled';
              this.finalizeEpisodeResult(item, episode, dest, 'cancelled');
              this.pauseController.endEpisode(item.id, episode);
              this.pauseController.clearActiveItemIfIdle();
              this.options.sendQueueUpdate();
              this.options.sendLog(`EP ${episode}: descarga cancelada por el usuario`, 'warn');
              break;
            }

            if (!links || links.length === 0) {
              this.options.sendLog(`EP ${episode}: No se encontraron servidores disponibles`, 'error');
              this.finalizeEpisodeResult(item, episode, dest, 'fail', 'No se encontraron servidores disponibles');
              this.pauseController.endEpisode(item.id, episode);
              this.pauseController.clearActiveItemIfIdle();
              continue;
            }

            this.options.sendLog(`Analizando servidores disponibles para EP ${episode}...`, 'info');
            const order = this.options.getServerPriorityOrder(item.providerId);
            const sortedLinks = this.sortLinksForEpisode(links, order, item.currentServer);

            if (sortedLinks.length === 0) {
              this.options.sendLog(
                `EP ${episode}: Ninguno de los servidores disponibles está en tu lista de prioridad`,
                'error',
              );
              this.finalizeEpisodeResult(
                item,
                episode,
                dest,
                'fail',
                'Ninguno de los servidores disponibles está soportado',
              );
              this.pauseController.endEpisode(item.id, episode);
              this.pauseController.clearActiveItemIfIdle();
              continue;
            }

            this.options.sendLog(
              `${sortedLinks.length} candidato(s): ${sortedLinks.map((link) => link.server).join(' → ')}`,
              'info',
            );

            const logId = `dl-progress-${item.id}-${episode}`;
            const { success, failureReason } = await this.attemptServersSequentially(
              item,
              episode,
              dest,
              episodeAbort,
              sortedLinks,
              (update) => this.handleProgress(item, episode, logId, update),
            );

            this.pauseController.endEpisode(item.id, episode);
            this.pauseController.clearActiveItemIfIdle();
            if (episodeAbort.signal.aborted) {
              if ((item.cancelledEps || []).includes(episode)) {
                this.finalizeEpisodeResult(item, episode, dest, 'cancelled');
                this.options.sendQueueUpdate();
                this.options.sendLog(`EP ${episode}: cancelado por el usuario (sigue el resto)`, 'warn');
                continue;
              }
              if (this.pauseController.isItemPaused(item.id)) {
                item.status = 'paused';
                this.options.sendQueueUpdate();
                this.options.sendLog(`EP ${episode}: pausado por el usuario`, 'warn');
                break;
              }
              if ((item.pausedEps || []).includes(episode)) {
                this.options.sendQueueUpdate();
                this.options.sendLog(`EP ${episode}: pausado (slot liberado, en espera de resume/cancel)`, 'warn');
                const reason = await this.pauseController.parkEpisode(item.id, episode);
                if (this.runEpoch.get(item.id) !== runEpoch) break;
                if (reason === 'resume') {
                  cursor -= 1;
                  continue;
                }
                if (reason === 'cancel') {
                  this.finalizeEpisodeResult(item, episode, dest, 'cancelled');
                  this.options.sendQueueUpdate();
                  continue;
                }
                break;
              }
              if (this.pauseController.consumeSettledResume(item.id, episode)) {
                // Pausa+reanudar durante el aborto: reintentar el mismo EP
                this.options.sendQueueUpdate();
                cursor -= 1;
                continue;
              }
              if ((item.status as string) === 'pending') {
                // Reanudado mientras el aborto seguía en vuelo: no finalizar
                this.options.sendQueueUpdate();
                continue;
              }
              item.status = 'cancelled';
              this.finalizeEpisodeResult(item, episode, dest, 'cancelled');
              this.options.sendQueueUpdate();
              this.options.sendLog(`EP ${episode}: descarga cancelada por el usuario`, 'warn');
              break;
            } else if (success) {
              this.finalizeEpisodeResult(item, episode, dest, 'ok');
            } else {
              this.finalizeEpisodeResult(item, episode, dest, 'fail', failureReason);
              this.options.sendLog(`EP ${episode}: falló en todos los servidores disponibles`, 'warn');
            }
          }
        } else {
          await this.processEpisodesParallel(item, episodesToProcess, maxParallel);
        }

        if ((item.status as string) === 'paused' || this.pauseController.isItemPaused(item.id)) {
          item.status = 'paused';
          this.options.sendStatus(`Pausado: ${item.animeTitle}`, item.episodes.length > 1);
        } else if (item.status !== 'cancelled') {
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
                this.retryOnlyIds.delete(item.id);
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
        this.retryOnlyIds.delete(item.id);
        if ((item.status as string) !== 'paused') {
          this.pauseController.clearItemPaused(item.id);
          // Pausados individuales que quedaron sin procesar se conservan para resume;
          // cancelados se conservan como parcial.
        }
        if (item.status === 'done' || item.status === 'failed' || item.status === 'cancelled') {
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
        this.retryOnlyIds.delete(failedItem.id);
        this.pauseController.clearCancelled(failedItem.id);
        if (!wasCancelled && failedItem.currentEp !== null) {
          const failedEpisode = failedItem.currentEp;
          const failedPath = this.options.buildEpisodePath(failedItem, failedEpisode);
          await this.options.attemptService.cleanEpisodeCacheForEpisode(failedPath);
          this.finalizeEpisodeResult(
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

  private finalizeEpisodeResult(
    item: QueueItem,
    episode: number,
    dest: string,
    status: HistoryStatus,
    reason?: string,
  ): void {
    ensureEpArrays(item);
    try {
      (this.options.attemptService as unknown as { forgetEpisode?: (id: string, ep: number) => void }).forgetEpisode?.(
        item.id,
        episode,
      );
    } catch {
      /* limpieza best-effort */
    }
    if (item.pausedEpSnapshot) {
      delete item.pausedEpSnapshot[String(episode)];
      if (Object.keys(item.pausedEpSnapshot).length === 0) delete item.pausedEpSnapshot;
    }
    if (status === 'ok') {
      removeEpisode(item.failedEps, episode);
      this.removeEpisode(item.pausedEps!, episode);
      this.pauseController.clearEpisodePaused(item.id, episode);
      pushUniqueEpisode(item.completedEps, episode);
      removeFailureReason(item, episode);
    } else if (status === 'fail') {
      this.removeEpisode(item.completedEps, episode);
      this.removeEpisode(item.pausedEps!, episode);
      this.pauseController.clearEpisodePaused(item.id, episode);
      this.pushUniqueEpisode(item.failedEps, episode);
      if (!item.failureReasons) item.failureReasons = {};
      item.failureReasons[String(episode)] = reason || 'No se pudo completar la descarga';
    } else if (status === 'cancelled') {
      // Cancel individual ya registrado en cancelledEps por cancelEpisode();
      // aquí solo asegurar limpieza de pausa/fallo.
      removeEpisode(item.failedEps, episode);
      this.removeEpisode(item.pausedEps!, episode);
      this.pauseController.clearEpisodePaused(item.id, episode);
      removeFailureReason(item, episode);
    }
    if ((item.pausedEps || []).length > 0) this.pauseController.syncPersistedPause(item);

    this.options.writeHistory({
      date: new Date().toLocaleString(),
      anime: item.animeTitle,
      slug: item.slug,
      episode,
      status,
      path: dest,
      providerId: item.providerId,
      scope: 'episode',
      queueId: item.id,
      reason: status === 'fail' ? reason || 'No se pudo completar la descarga' : undefined,
    });
    if (status !== 'cancelled') {
      this.options.sendEpisodeDownloaded(item, episode, status === 'ok');
    }
    if (status === 'fail') {
      this.options.sendNotification(
        'Error de Descarga',
        `Fallo al descargar EP ${episode} de ${item.animeTitle}`,
        'showDownloadError',
      );
    } else if (status === 'ok' && this.options.shouldNotifyCompletion()) {
      this.options.sendNotification(
        'Episodio Descargado',
        `Se completó la descarga del EP ${episode} de ${item.animeTitle}`,
        'showDownloadFinished',
      );
    }
  }

  private handleProgress(item: QueueItem, episode: number, logId: string, update: EpisodeAttemptProgress): void {
    const live = Math.max(0, Math.min(1, update.progress));
    const server = typeof item.currentServer === 'string' && item.currentServer ? item.currentServer : undefined;
    const display = Math.max(this.pauseController.frozenBaseline(item, episode, server), live);
    item.progress = display;
    if (this.options.scheduleQueueProgress) {
      // Secuencial también emite foto de 1 EP: sin ella el Detalle
      // degrada el EP en vuelo a 'queued 0%' aunque el Total avance.
      this.options.scheduleQueueProgress(item, [
        {
          episode,
          progress: display,
          ...(server ? { server } : {}),
          ...(update.phase ? { phase: update.phase } : {}),
          ...(update.speedBps !== undefined ? { speedBps: update.speedBps } : {}),
          ...(update.at !== undefined ? { at: update.at } : {}),
        },
      ]);
    } else {
      this.options.scheduleQueueUpdate();
    }
    const pct = Math.round(update.progress * 100);
    const statusText = update.status ? update.status : `${pct}%`;
    this.options.updateTray(`Descargando ${item.animeTitle} - EP ${episode} (${statusText})`);
    if (update.progressLog) {
      this.options.sendProgressLog(logId, update.progressLog);
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

  private getStartTimeoutSec(): number {
    try {
      const raw = this.options.getDownloadSettings?.()?.startTimeoutSec;
      const n = typeof raw === 'number' ? Math.round(raw) : 90;
      if (!Number.isFinite(n)) return 90;
      return Math.max(30, Math.min(120, n));
    } catch {
      return 90;
    }
  }

  // Orden de servidores: delega en el coordinador (los tests acceden por
  // cast a este nombre/firma, se conserva como wrapper).
  private sortLinksForEpisode(
    links: ProviderDownloadLink[],
    order: string[],
    preferredServer?: string,
  ): ProviderDownloadLink[] {
    return this.coordinator.sortLinksForEpisode(links, order, preferredServer);
  }

  // Fallback secuencial por episodio: delega en el coordinador. El tope de EPs
  // por servidor lo gestiona SlotScheduler y viaja en el puerto de intento.
  private async attemptServersSequentially(
    item: QueueItem,
    episode: number,
    dest: string,
    episodeAbort: AbortController,
    sortedLinks: ProviderDownloadLink[],
    onProgress: (update: EpisodeAttemptProgress) => void,
    onServerChange?: (server: string) => void,
  ): Promise<{ success: boolean; failureReason: string }> {
    return this.coordinator.attemptServersSequentially(
      item,
      episode,
      dest,
      episodeAbort,
      sortedLinks,
      onProgress,
      onServerChange,
      this.slots.createAttemptPort(item, episode, dest, episodeAbort),
    );
  }

  private handleParallelProgress(
    item: QueueItem,
    episodesToProcess: number[],
    episodeProgress: Map<number, number>,
    episodeServer: Map<number, string>,
    episodePhase: Map<number, 'downloading' | 'assembling'>,
    episodeSpeed: Map<number, { speedBps: number; at: number }>,
    episode: number,
    logId: string,
    update: EpisodeAttemptProgress,
  ): void {
    const live = Math.max(0, Math.min(1, update.progress));
    episodeProgress.set(
      episode,
      Math.max(this.pauseController.frozenBaseline(item, episode, episodeServer.get(episode)), live),
    );
    // Fase HLS transitoria para 'Ensamblando'; nunca se persiste.
    if (update.phase) episodePhase.set(episode, update.phase);
    else episodePhase.delete(episode);
    if (update.speedBps !== undefined && update.at !== undefined) {
      episodeSpeed.set(episode, { speedBps: update.speedBps, at: update.at });
    }
    const total = Math.max(1, episodesToProcess.length);
    // Pausados no cuentan como finalizados: su % congelado suma en activeSum
    const isFinal = (ep: number): boolean =>
      item.completedEps.includes(ep) || item.failedEps.includes(ep) || (item.cancelledEps || []).includes(ep);
    const finalized = episodesToProcess.filter(isFinal).length;
    const activeEps: import('../persistence/QueueStore').ActiveEpisodeProgress[] = [];
    const pausedSet = new Set<number>(item.pausedEps || []);
    let activeSum = 0;
    for (const ep of episodesToProcess) {
      if (isFinal(ep)) continue;
      activeSum += episodeProgress.get(ep) ?? 0;
      // Pausados suman su % congelado pero no listan como activos
      if (pausedSet.has(ep)) continue;
      // Veraz: solo lista EPs con worker vivo; los en cola sin arrancar no existen visualmente
      if (!this.pauseController.hasEpisodeController(item.id, ep)) continue;
      if (activeEps.length < 3) {
        activeEps.push({
          episode: ep,
          progress: Math.max(0, Math.min(1, episodeProgress.get(ep) ?? 0)),
          ...(episodeServer.get(ep) ? { server: episodeServer.get(ep) as string } : {}),
          ...(episodePhase.get(ep) ? { phase: episodePhase.get(ep) as 'downloading' | 'assembling' } : {}),
          ...(episodeSpeed.get(ep) ? { speedBps: (episodeSpeed.get(ep) as { speedBps: number }).speedBps } : {}),
          ...(episodeSpeed.get(ep) ? { at: (episodeSpeed.get(ep) as { at: number }).at } : {}),
        });
      }
    }
    item.progress = Math.max(0, Math.min(1, (finalized + activeSum) / total));
    item.currentEp = episode;
    if (this.options.scheduleQueueProgress) {
      this.options.scheduleQueueProgress(item, activeEps);
    } else {
      this.options.scheduleQueueUpdate();
    }
    const pct = Math.round(update.progress * 100);
    const statusText = update.status ? update.status : `${pct}%`;
    this.options.updateTray(`Descargando ${item.animeTitle} - EP ${episode} (${statusText})`);
    if (update.progressLog) {
      this.options.sendProgressLog(logId, update.progressLog);
    }
  }

  private async processEpisodesParallel(
    item: QueueItem,
    episodesToProcess: number[],
    maxParallel: number,
  ): Promise<void> {
    const episodeProgress = new Map<number, number>();
    const episodeServer = new Map<number, string>();
    const episodePhase = new Map<number, 'downloading' | 'assembling'>();
    const episodeSpeed = new Map<number, { speedBps: number; at: number }>();
    // Siembra anti-flash: al reanudar, los mapas arrancan del % congelado
    // solo si retoman Mega (único resume real); el resto publica ceros
    // honestos hasta que llega el progreso vivo.
    if (item.pausedEpSnapshot && typeof item.pausedEpSnapshot === 'object') {
      const doneSet = new Set<number>([...item.completedEps, ...item.failedEps, ...(item.cancelledEps || [])]);
      for (const ep of episodesToProcess) {
        if (doneSet.has(ep)) continue;
        const server = item.pausedEpSnapshot[String(ep)]?.server;
        const frozen = this.pauseController.frozenBaseline(item, ep, server);
        if (frozen > 0) episodeProgress.set(ep, frozen);
        if (typeof server === 'string' && server) episodeServer.set(ep, server);
      }
    }
    const runCtx = this.pauseController.registerRunContext(item.id, {
      progress: episodeProgress,
      server: episodeServer,
    });
    let nextIndex = 0;
    const workerCount = Math.max(1, Math.min(maxParallel, episodesToProcess.length));

    const processOne = async (episode: number): Promise<void> => {
      for (;;) {
        if (this.pauseController.runContext(item.id) !== runCtx) return;
        if (this.pauseController.isCancelled(item.id)) return;
        if (this.pauseController.isItemPaused(item.id) || item.status === 'paused') return;
        if ((item.cancelledEps || []).includes(episode)) return;
        if ((item.pausedEps || []).includes(episode)) {
          // Aparcado antes de arrancar: espera sin consumir slot ajeno
          const reason = await this.pauseController.parkEpisode(item.id, episode);
          if (this.pauseController.runContext(item.id) !== runCtx) return;
          if (reason === 'resume') continue;
          if (reason === 'cancel') {
            this.finalizeEpisodeResult(item, episode, this.options.buildEpisodePath(item, episode), 'cancelled');
            this.options.sendQueueUpdate();
          }
          return;
        }
        this.options.sendLog(`Buscando servidores para EP ${episode}...`, 'info');
        const dest = this.options.buildEpisodePath(item, episode);
        if (this.options.attemptService.hasCompletedFile(dest)) {
          this.options.sendLog(`EP ${episode} ya existe en disco. Omitiendo.`, 'info');
          removeEpisode(item.failedEps, episode);
          pushUniqueEpisode(item.completedEps, episode);
          removeFailureReason(item, episode);
          return;
        }

        this.removeEpisode(item.completedEps, episode);
        removeEpisode(item.failedEps, episode);

        const episodeAbort = this.pauseController.beginEpisode(item.id, episode);
        try {
          const links = await this.options.getEpisodeLinks(item, episode, episodeAbort.signal);
          if (episodeAbort.signal.aborted || this.pauseController.isCancelled(item.id)) {
            if ((item.cancelledEps || []).includes(episode)) {
              this.finalizeEpisodeResult(item, episode, dest, 'cancelled');
              this.options.sendQueueUpdate();
              this.options.sendLog(`EP ${episode}: cancelado por el usuario (sigue el resto)`, 'warn');
              return;
            }
            if (this.pauseController.isItemPaused(item.id)) {
              if ((item.status as string) !== 'paused') item.status = 'paused';
              this.options.sendQueueUpdate();
              this.options.sendLog(`EP ${episode}: pausado por el usuario`, 'warn');
              return;
            }
            if ((item.pausedEps || []).includes(episode)) {
              this.options.sendQueueUpdate();
              this.options.sendLog(`EP ${episode}: pausado (slot liberado, en espera de resume/cancel)`, 'warn');
              const reason = await this.pauseController.parkEpisode(item.id, episode);
              if (this.pauseController.runContext(item.id) !== runCtx) return;
              if (reason === 'resume') continue;
              if (reason === 'cancel') {
                this.finalizeEpisodeResult(item, episode, dest, 'cancelled');
                this.options.sendQueueUpdate();
              }
              return;
            }
            if (this.pauseController.consumeSettledResume(item.id, episode)) {
              // Pausa+reanudar durante el aborto: reintentar el mismo EP
              this.options.sendQueueUpdate();
              continue;
            }
            if ((item.status as string) === 'pending') {
              // Reanudado mientras el aborto seguía en vuelo: no finalizar
              this.options.sendQueueUpdate();
              return;
            }
            item.status = 'cancelled';
            this.finalizeEpisodeResult(item, episode, dest, 'cancelled');
            this.options.sendQueueUpdate();
            this.options.sendLog(`EP ${episode}: descarga cancelada por el usuario`, 'warn');
            return;
          }
          if (!links || links.length === 0) {
            this.options.sendLog(`EP ${episode}: No se encontraron servidores disponibles`, 'error');
            this.finalizeEpisodeResult(item, episode, dest, 'fail', 'No se encontraron servidores disponibles');
            return;
          }
          const order = this.options.getServerPriorityOrder(item.providerId);
          // Afinidad por episodio: prefiere el último servidor que funcionó
          // para ESTE EP antes que el global del item (los workers en paralelo
          // se lo pisan entre sí y la etiqueta parpadea).
          const affinity = episodeServer.get(episode) ?? item.currentServer;
          const sortedLinks = this.sortLinksForEpisode(links, order, affinity);
          if (sortedLinks.length === 0) {
            this.finalizeEpisodeResult(
              item,
              episode,
              dest,
              'fail',
              'Ninguno de los servidores disponibles está soportado',
            );
            return;
          }
          const logId = `dl-progress-${item.id}-${episode}`;
          const { success, failureReason } = await this.attemptServersSequentially(
            item,
            episode,
            dest,
            episodeAbort,
            sortedLinks,
            (update) =>
              this.handleParallelProgress(
                item,
                episodesToProcess,
                episodeProgress,
                episodeServer,
                episodePhase,
                episodeSpeed,
                episode,
                logId,
                update,
              ),
            (server) => episodeServer.set(episode, server),
          );
          if (episodeAbort.signal.aborted || this.pauseController.isCancelled(item.id)) {
            if ((item.cancelledEps || []).includes(episode)) {
              this.finalizeEpisodeResult(item, episode, dest, 'cancelled');
              this.options.sendQueueUpdate();
              return;
            }
            if (this.pauseController.isItemPaused(item.id)) {
              if ((item.status as string) !== 'paused') item.status = 'paused';
              this.options.sendQueueUpdate();
              return;
            }
            if ((item.pausedEps || []).includes(episode)) {
              this.options.sendQueueUpdate();
              const reason = await this.pauseController.parkEpisode(item.id, episode);
              if (this.pauseController.runContext(item.id) !== runCtx) return;
              if (reason === 'resume') continue;
              if (reason === 'cancel') {
                this.finalizeEpisodeResult(item, episode, dest, 'cancelled');
                this.options.sendQueueUpdate();
              }
              return;
            }
            if (this.pauseController.consumeSettledResume(item.id, episode)) {
              // Pausa+reanudar durante el aborto: reintentar el mismo EP
              this.options.sendQueueUpdate();
              continue;
            }
            if ((item.status as string) === 'pending') {
              // Reanudado mientras el aborto seguía en vuelo: no finalizar
              this.options.sendQueueUpdate();
              return;
            }
            if (item.status !== 'cancelled') item.status = 'cancelled';
            this.finalizeEpisodeResult(item, episode, dest, 'cancelled');
            this.options.sendQueueUpdate();
            return;
          }
          if (success) {
            this.finalizeEpisodeResult(item, episode, dest, 'ok');
          } else {
            this.finalizeEpisodeResult(item, episode, dest, 'fail', failureReason);
            this.options.sendLog(`EP ${episode}: falló en todos los servidores disponibles`, 'warn');
          }
          return;
        } finally {
          this.pauseController.endEpisode(item.id, episode);
          // Si el EP queda aparcado, conservar su % congelado en los mapas
          if (!(item.pausedEps || []).includes(episode)) {
            episodeProgress.delete(episode);
            episodeServer.delete(episode);
          }
        }
      }
    };

    const workers = Array.from({ length: workerCount }, async () => {
      // Worker de episodio: procesa EPs de este item.
      while (true) {
        if (this.pauseController.isCancelled(item.id) || item.status === 'cancelled') return;
        if (this.pauseController.isItemPaused(item.id) || item.status === 'paused') return;
        const idx = nextIndex;
        nextIndex += 1;
        if (idx >= episodesToProcess.length) return;
        const ep = episodesToProcess[idx];
        if ((item.cancelledEps || []).includes(ep) || (item.pausedEps || []).includes(ep)) continue;
        await processOne(ep);
      }
    });
    try {
      await Promise.all(workers);
    } finally {
      // Red anti-hang: despierta aparcados si el run termina por error
      this.pauseController.wakeItemGates(item.id, 'total');
      this.slots.purgeServerSlots(item.id);
      if (this.pauseController.runContext(item.id) === runCtx) this.pauseController.clearRunContext(item.id);
    }
    this.pauseController.clearActiveItemIfIdle();
  }

  private formatEpisodeCountLabel(count: number, short = false): string {
    const total = Number(count) || 0;
    if (short) return `${total} ${total === 1 ? 'ep' : 'eps'}`;
    return `${total} ${total === 1 ? 'episodio' : 'episodios'}`;
  }

  private pushUniqueEpisode(episodes: number[], episode: number): void {
    if (!episodes.includes(episode)) episodes.push(episode);
  }

  private removeEpisode(episodes: number[], episode: number): void {
    const index = episodes.indexOf(episode);
    if (index >= 0) episodes.splice(index, 1);
  }
}
