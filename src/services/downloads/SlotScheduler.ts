import type { HistoryStatus, HistoryWriteRecord } from '../../types/history';
import type { ProviderDownloadLink, QueueItem } from '../../types/queue';
import type { EpisodeAttemptProgress, EpisodeDownloadAttemptService } from './EpisodeDownloadAttemptService';
import type { FallbackAttemptPort } from './DownloadCoordinator';
import type { DownloadNotificationType } from './DownloadQueueProcessor';
import {
  ensureEpArrays,
  type PauseController,
  pushUniqueEpisode,
  removeEpisode,
  removeFailureReason,
} from './PauseController';
import type { RetryPolicy } from './RetryPolicy';
import type { ActiveEpisodeProgress } from '../persistence/QueueStore';

// Tope de EPs-INTENTO simultáneos contra el mismo servidor (NO de conexiones):
// con 3 EPs en paralelo, como mucho 2 descargan del mismo host a la vez y el
// tercero espera un hueco en vez de saturarlo. La concurrencia de streams por
// intento es otro nivel (AttemptConcurrencyHandle) y aquí no se contabiliza.
export const MAX_CONCURRENT_PER_SERVER = 2;
export const SERVER_SLOT_POLL_MS = 200;

// Efectos de la cola que emite la ejecución de EPs.
export interface SlotRunOptions {
  attemptService: EpisodeDownloadAttemptService;
  getEpisodeLinks: (item: QueueItem, episode: number, signal: AbortSignal) => Promise<ProviderDownloadLink[]>;
  getServerPriorityOrder: (providerId?: string) => string[];
  buildEpisodePath: (item: QueueItem, episode: number) => string;
  writeHistory: (record: HistoryWriteRecord) => boolean;
  sendLog: (message: string, type?: 'info' | 'success' | 'error' | 'warn') => void;
  sendProgressLog: (logId: string, message: string) => void;
  sendStatus: (message: string, isBatch?: boolean) => void;
  updateTray: (text?: string) => void;
  scheduleQueueUpdate: () => void;
  scheduleQueueProgress?: (item: QueueItem, activeEps?: ActiveEpisodeProgress[]) => void;
  sendQueueUpdate: () => void;
  sendEpisodeDownloaded: (item: QueueItem, episode: number, success: boolean) => void;
  sendNotification: (title: string, body: string, type: DownloadNotificationType) => void;
  shouldNotifyCompletion: () => boolean;
}

export interface SlotSchedulerDeps {
  options: SlotRunOptions;
  pause: PauseController;
  retry: RetryPolicy;
}

// Asignación de slots por servidor y lanzamiento de los intentos: ejecuta los
// EPs de un item (secuencial o en paralelo), con su progreso y su finalización.
export class SlotScheduler {
  // Slots vivos por servidor (itemId|server). Cuenta EPs, no conexiones.
  private readonly activeServerCounts = new Map<string, number>();
  // Época por item-run: los workers zombis (run ya terminado) deben salir, no reintentar
  private readonly runEpoch = new Map<string, number>();

  constructor(private readonly deps: SlotSchedulerDeps) {}

  private get options(): SlotRunOptions {
    return this.deps.options;
  }

  private get pause(): PauseController {
    return this.deps.pause;
  }

  private get retry(): RetryPolicy {
    return this.deps.retry;
  }

  serverSlotKey(id: string, server: string): string {
    return `${id}|${server}`;
  }

  beginRun(id: string): number {
    const next = (this.runEpoch.get(id) || 0) + 1;
    this.runEpoch.set(id, next);
    return next;
  }

  async acquireServerSlot(item: QueueItem, episode: number, server: string, signal: AbortSignal): Promise<boolean> {
    const key = this.serverSlotKey(item.id, server);
    for (;;) {
      const used = this.activeServerCounts.get(key) ?? 0;
      if (used < MAX_CONCURRENT_PER_SERVER) {
        this.activeServerCounts.set(key, used + 1);
        return true;
      }
      if (signal.aborted || this.pause.episodeInterrupted(item, episode)) return false;
      await new Promise((resolve) => setTimeout(resolve, SERVER_SLOT_POLL_MS));
    }
  }

  releaseServerSlot(id: string, server: string): void {
    const key = this.serverSlotKey(id, server);
    const left = (this.activeServerCounts.get(key) ?? 1) - 1;
    if (left <= 0) this.activeServerCounts.delete(key);
    else this.activeServerCounts.set(key, left);
  }

  purgeServerSlots(id: string): void {
    for (const key of Array.from(this.activeServerCounts.keys())) {
      if (key === id || key.startsWith(`${id}|`)) this.activeServerCounts.delete(key);
    }
  }

  // Con el slot del servidor retenido mientras el mismo host sigue siendo candidato:
  // sin slot (abort/pausa) no se intenta nada y el fallback se detiene en silencio.
  createAttemptPort(
    item: QueueItem,
    episode: number,
    dest: string,
    episodeAbort: AbortController,
  ): FallbackAttemptPort {
    let heldServer: string | null = null;
    return {
      attempt: async (link, callbacks) => {
        if (heldServer !== link.canonicalServer) {
          if (heldServer) {
            this.releaseServerSlot(item.id, heldServer);
            heldServer = null;
          }
          const acquired = await this.acquireServerSlot(item, episode, link.canonicalServer, episodeAbort.signal);
          if (!acquired) {
            return {
              success: false,
              aborted: episodeAbort.signal.aborted,
              parentAborted: episodeAbort.signal.aborted,
              skipRequested: false,
              attemptTimedOut: false,
              invalidMp4: false,
              toolFailureMessage: null,
              started: false,
              attempted: false,
            };
          }
          heldServer = link.canonicalServer;
        }
        const result = await this.options.attemptService.attempt(
          item,
          episode,
          link,
          dest,
          episodeAbort.signal,
          callbacks,
        );
        return { ...result, attempted: true };
      },
      release: () => {
        if (heldServer) {
          this.releaseServerSlot(item.id, heldServer);
          heldServer = null;
        }
      },
    };
  }

  async runSequential(item: QueueItem, episodesToProcess: number[], runEpoch: number): Promise<void> {
    for (let cursor = 0; cursor < episodesToProcess.length; cursor += 1) {
      const episode = episodesToProcess[cursor];
      if (this.pause.isCancelled(item.id)) {
        item.status = 'cancelled';
        this.options.updateTray();
        this.options.sendQueueUpdate();
        this.options.sendLog(`Descarga de "${item.animeTitle}" cancelada por el usuario`, 'warn');
        this.options.sendStatus(`Cancelado: ${item.animeTitle}`, episodesToProcess.length > 1);
        break;
      }
      if (this.pause.isItemPaused(item.id) || (item.status as string) === 'paused') {
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
      item.progress = this.pause.frozenBaseline(item, episode, item.pausedEpSnapshot?.[String(episode)]?.server);
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

      removeEpisode(item.completedEps, episode);
      removeEpisode(item.failedEps, episode);

      const episodeAbort = this.pause.beginEpisode(item.id, episode);
      const links = await this.options.getEpisodeLinks(item, episode, episodeAbort.signal);

      if (episodeAbort.signal.aborted || this.pause.isCancelled(item.id)) {
        if ((item.cancelledEps || []).includes(episode)) {
          this.finalizeEpisodeResult(item, episode, dest, 'cancelled');
          this.pause.endEpisode(item.id, episode);
          this.pause.clearActiveItemIfIdle();
          this.options.sendQueueUpdate();
          this.options.sendLog(`EP ${episode}: cancelado por el usuario (sigue el resto)`, 'warn');
          continue;
        }
        if (this.pause.isItemPaused(item.id)) {
          item.status = 'paused';
          this.pause.endEpisode(item.id, episode);
          this.pause.clearActiveItemIfIdle();
          this.options.sendQueueUpdate();
          this.options.sendLog(`EP ${episode}: pausado por el usuario`, 'warn');
          break;
        }
        if ((item.pausedEps || []).includes(episode)) {
          this.pause.endEpisode(item.id, episode);
          this.pause.clearActiveItemIfIdle();
          this.options.sendQueueUpdate();
          this.options.sendLog(`EP ${episode}: pausado (slot liberado, en espera de resume/cancel)`, 'warn');
          const reason = await this.pause.parkEpisode(item.id, episode);
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
        if (this.pause.consumeSettledResume(item.id, episode)) {
          // Pausa+reanudar durante el aborto: reintentar el mismo EP
          this.pause.endEpisode(item.id, episode);
          this.pause.clearActiveItemIfIdle();
          this.options.sendQueueUpdate();
          cursor -= 1;
          continue;
        }
        if ((item.status as string) === 'pending') {
          // Reanudado mientras el aborto seguía en vuelo: no finalizar,
          // el EP queda sin contabilizar y la finalización lo reencola
          this.pause.endEpisode(item.id, episode);
          this.pause.clearActiveItemIfIdle();
          this.options.sendQueueUpdate();
          continue;
        }
        item.status = 'cancelled';
        this.finalizeEpisodeResult(item, episode, dest, 'cancelled');
        this.pause.endEpisode(item.id, episode);
        this.pause.clearActiveItemIfIdle();
        this.options.sendQueueUpdate();
        this.options.sendLog(`EP ${episode}: descarga cancelada por el usuario`, 'warn');
        break;
      }

      if (!links || links.length === 0) {
        this.options.sendLog(`EP ${episode}: No se encontraron servidores disponibles`, 'error');
        this.finalizeEpisodeResult(item, episode, dest, 'fail', 'No se encontraron servidores disponibles');
        this.pause.endEpisode(item.id, episode);
        this.pause.clearActiveItemIfIdle();
        continue;
      }

      this.options.sendLog(`Analizando servidores disponibles para EP ${episode}...`, 'info');
      const order = this.options.getServerPriorityOrder(item.providerId);
      const sortedLinks = this.retry.sortLinksForEpisode(links, order, item.currentServer);

      if (sortedLinks.length === 0) {
        this.options.sendLog(
          `EP ${episode}: Ninguno de los servidores disponibles está en tu lista de prioridad`,
          'error',
        );
        this.finalizeEpisodeResult(item, episode, dest, 'fail', 'Ninguno de los servidores disponibles está soportado');
        this.pause.endEpisode(item.id, episode);
        this.pause.clearActiveItemIfIdle();
        continue;
      }

      this.options.sendLog(
        `${sortedLinks.length} candidato(s): ${sortedLinks.map((link) => link.server).join(' → ')}`,
        'info',
      );

      const logId = `dl-progress-${item.id}-${episode}`;
      const { success, failureReason } = await this.retry.attemptServersSequentially(
        item,
        episode,
        dest,
        episodeAbort,
        sortedLinks,
        (update) => this.handleProgress(item, episode, logId, update),
        undefined,
        this.createAttemptPort(item, episode, dest, episodeAbort),
      );

      this.pause.endEpisode(item.id, episode);
      this.pause.clearActiveItemIfIdle();
      if (episodeAbort.signal.aborted) {
        if ((item.cancelledEps || []).includes(episode)) {
          this.finalizeEpisodeResult(item, episode, dest, 'cancelled');
          this.options.sendQueueUpdate();
          this.options.sendLog(`EP ${episode}: cancelado por el usuario (sigue el resto)`, 'warn');
          continue;
        }
        if (this.pause.isItemPaused(item.id)) {
          item.status = 'paused';
          this.options.sendQueueUpdate();
          this.options.sendLog(`EP ${episode}: pausado por el usuario`, 'warn');
          break;
        }
        if ((item.pausedEps || []).includes(episode)) {
          this.options.sendQueueUpdate();
          this.options.sendLog(`EP ${episode}: pausado (slot liberado, en espera de resume/cancel)`, 'warn');
          const reason = await this.pause.parkEpisode(item.id, episode);
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
        if (this.pause.consumeSettledResume(item.id, episode)) {
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
  }

  finalizeEpisodeResult(item: QueueItem, episode: number, dest: string, status: HistoryStatus, reason?: string): void {
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
      removeEpisode(item.pausedEps!, episode);
      this.pause.clearEpisodePaused(item.id, episode);
      pushUniqueEpisode(item.completedEps, episode);
      removeFailureReason(item, episode);
    } else if (status === 'fail') {
      removeEpisode(item.completedEps, episode);
      removeEpisode(item.pausedEps!, episode);
      this.pause.clearEpisodePaused(item.id, episode);
      pushUniqueEpisode(item.failedEps, episode);
      if (!item.failureReasons) item.failureReasons = {};
      item.failureReasons[String(episode)] = reason || 'No se pudo completar la descarga';
    } else if (status === 'cancelled') {
      // Cancel individual ya registrado en cancelledEps por cancelEpisode();
      // aquí solo asegurar limpieza de pausa/fallo.
      removeEpisode(item.failedEps, episode);
      removeEpisode(item.pausedEps!, episode);
      this.pause.clearEpisodePaused(item.id, episode);
      removeFailureReason(item, episode);
    }
    if ((item.pausedEps || []).length > 0) this.pause.syncPersistedPause(item);

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
    const display = Math.max(this.pause.frozenBaseline(item, episode, server), live);
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
    episodeProgress.set(episode, Math.max(this.pause.frozenBaseline(item, episode, episodeServer.get(episode)), live));
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
      if (!this.pause.hasEpisodeController(item.id, ep)) continue;
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

  async runParallel(item: QueueItem, episodesToProcess: number[], maxParallel: number): Promise<void> {
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
        const frozen = this.pause.frozenBaseline(item, ep, server);
        if (frozen > 0) episodeProgress.set(ep, frozen);
        if (typeof server === 'string' && server) episodeServer.set(ep, server);
      }
    }
    const runCtx = this.pause.registerRunContext(item.id, {
      progress: episodeProgress,
      server: episodeServer,
    });
    let nextIndex = 0;
    const workerCount = Math.max(1, Math.min(maxParallel, episodesToProcess.length));

    const processOne = async (episode: number): Promise<void> => {
      for (;;) {
        if (this.pause.runContext(item.id) !== runCtx) return;
        if (this.pause.isCancelled(item.id)) return;
        if (this.pause.isItemPaused(item.id) || item.status === 'paused') return;
        if ((item.cancelledEps || []).includes(episode)) return;
        if ((item.pausedEps || []).includes(episode)) {
          // Aparcado antes de arrancar: espera sin consumir slot ajeno
          const reason = await this.pause.parkEpisode(item.id, episode);
          if (this.pause.runContext(item.id) !== runCtx) return;
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

        removeEpisode(item.completedEps, episode);
        removeEpisode(item.failedEps, episode);

        const episodeAbort = this.pause.beginEpisode(item.id, episode);
        try {
          const links = await this.options.getEpisodeLinks(item, episode, episodeAbort.signal);
          if (episodeAbort.signal.aborted || this.pause.isCancelled(item.id)) {
            if ((item.cancelledEps || []).includes(episode)) {
              this.finalizeEpisodeResult(item, episode, dest, 'cancelled');
              this.options.sendQueueUpdate();
              this.options.sendLog(`EP ${episode}: cancelado por el usuario (sigue el resto)`, 'warn');
              return;
            }
            if (this.pause.isItemPaused(item.id)) {
              if ((item.status as string) !== 'paused') item.status = 'paused';
              this.options.sendQueueUpdate();
              this.options.sendLog(`EP ${episode}: pausado por el usuario`, 'warn');
              return;
            }
            if ((item.pausedEps || []).includes(episode)) {
              this.options.sendQueueUpdate();
              this.options.sendLog(`EP ${episode}: pausado (slot liberado, en espera de resume/cancel)`, 'warn');
              const reason = await this.pause.parkEpisode(item.id, episode);
              if (this.pause.runContext(item.id) !== runCtx) return;
              if (reason === 'resume') continue;
              if (reason === 'cancel') {
                this.finalizeEpisodeResult(item, episode, dest, 'cancelled');
                this.options.sendQueueUpdate();
              }
              return;
            }
            if (this.pause.consumeSettledResume(item.id, episode)) {
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
          const sortedLinks = this.retry.sortLinksForEpisode(links, order, affinity);
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
          const { success, failureReason } = await this.retry.attemptServersSequentially(
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
            this.createAttemptPort(item, episode, dest, episodeAbort),
          );
          if (episodeAbort.signal.aborted || this.pause.isCancelled(item.id)) {
            if ((item.cancelledEps || []).includes(episode)) {
              this.finalizeEpisodeResult(item, episode, dest, 'cancelled');
              this.options.sendQueueUpdate();
              return;
            }
            if (this.pause.isItemPaused(item.id)) {
              if ((item.status as string) !== 'paused') item.status = 'paused';
              this.options.sendQueueUpdate();
              return;
            }
            if ((item.pausedEps || []).includes(episode)) {
              this.options.sendQueueUpdate();
              const reason = await this.pause.parkEpisode(item.id, episode);
              if (this.pause.runContext(item.id) !== runCtx) return;
              if (reason === 'resume') continue;
              if (reason === 'cancel') {
                this.finalizeEpisodeResult(item, episode, dest, 'cancelled');
                this.options.sendQueueUpdate();
              }
              return;
            }
            if (this.pause.consumeSettledResume(item.id, episode)) {
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
          this.pause.endEpisode(item.id, episode);
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
        if (this.pause.isCancelled(item.id) || item.status === 'cancelled') return;
        if (this.pause.isItemPaused(item.id) || item.status === 'paused') return;
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
      this.pause.wakeItemGates(item.id, 'total');
      this.purgeServerSlots(item.id);
      if (this.pause.runContext(item.id) === runCtx) this.pause.clearRunContext(item.id);
    }
    this.pause.clearActiveItemIfIdle();
  }
}
