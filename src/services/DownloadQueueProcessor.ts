import type { HistoryStatus, HistoryWriteRecord } from '../types/history';
import type { ProviderDownloadLink, QueueItem } from '../types/queue';
import type { EpisodeAttemptProgress } from './EpisodeDownloadAttemptService';
import { EpisodeDownloadAttemptService } from './EpisodeDownloadAttemptService';
import { categorizeAttemptFailure, type ServerAttemptOutcome } from './ServerStatsStore';
import { QueueStore } from './QueueStore';

export type DownloadNotificationType =
  'showDownloadStarted' | 'showDownloadFinished' | 'showDownloadError' | 'showSystemMessages';

export interface PausedProgressSink {
  save(
    queueId: string,
    snapshot: { totalProgress: number; episodes: Record<string, { progress: number; server?: string }> },
  ): void;
  clear(queueId: string): void;
}

export interface DownloadQueueProcessorOptions {
  queueStore: QueueStore;
  attemptService: EpisodeDownloadAttemptService;
  isUpdateInProgress: () => boolean;
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
  scheduleQueueProgress?: (item: QueueItem, activeEps?: import('./QueueStore').ActiveEpisodeProgress[]) => void;
  sendQueueUpdate: () => void;
  // Observabilidad por servidor (opcional, best-effort, sin URLs).
  recordServerOutcome?: (outcome: ServerAttemptOutcome) => void;
  sendDownloadStarted: (item: QueueItem) => void;
  sendEpisodeDownloaded: (item: QueueItem, episode: number, success: boolean) => void;
  sendNotification: (title: string, body: string, type: DownloadNotificationType) => void;
  isMainWindowFocused: () => boolean;
  shouldNotifyCompletion: () => boolean;
  logError: (error: unknown) => void;
}

export type EpisodeGateReason = 'resume' | 'cancel' | 'total';

// Tope de EPs simultáneos contra el mismo servidor: con 3 en paralelo,
// el tercero espera o va por otro servidor en vez de saturar el host.
const MAX_CONCURRENT_PER_SERVER = 2;
const SERVER_SLOT_POLL_MS = 200;

interface EpisodeGate {
  settled: boolean;
  reason: EpisodeGateReason;
  waiters: Array<(reason: EpisodeGateReason) => void>;
}

export class DownloadQueueProcessor {
  private readonly cancelledIds = new Set<string>();
  private readonly retryOnlyIds = new Set<string>();
  private readonly pausedItemIds = new Set<string>();
  private readonly pausedEpisodesByItem = new Map<string, Set<number>>();
  private readonly cancelledEpisodesByItem = new Map<string, Set<number>>();
  private readonly activeEpisodeControllers = new Map<string, AbortController>();
  // Slots vivos por servidor (`itemId|server`): cuántos workers lo usan ahora
  private readonly activeServerCounts = new Map<string, number>();
  // Puertas de aparcamiento: un worker pausado espera aquí sin liberar su slot
  private readonly episodeGates = new Map<string, EpisodeGate>();
  // Contexto vivo del run paralelo (para snapshottear % al pausar)
  private readonly parallelContexts = new Map<string, { progress: Map<number, number>; server: Map<number, string> }>();
  // Época por item-run: los workers zombis (run ya terminado) deben salir, no reintentar
  private readonly runEpoch = new Map<string, number>();
  private activeQueueItemId: string | null = null;
  private isProcessingQueue = false;

  constructor(private readonly options: DownloadQueueProcessorOptions) {}

  get activeItemId(): string | null {
    return this.activeQueueItemId;
  }

  hasActiveDownloads(): boolean {
    return this.options.queueStore.items.some((item) => item.status === 'downloading');
  }

  private epKey(id: string, episode: number): string {
    return `${id}:${episode}`;
  }

  private getPausedSet(id: string): Set<number> {
    let set = this.pausedEpisodesByItem.get(id);
    if (!set) {
      set = new Set<number>();
      this.pausedEpisodesByItem.set(id, set);
    }
    return set;
  }

  private getCancelledSet(id: string): Set<number> {
    let set = this.cancelledEpisodesByItem.get(id);
    if (!set) {
      set = new Set<number>();
      this.cancelledEpisodesByItem.set(id, set);
    }
    return set;
  }

  private ensureEpArrays(item: QueueItem): void {
    if (!Array.isArray(item.pausedEps)) item.pausedEps = [];
    if (!Array.isArray(item.cancelledEps)) item.cancelledEps = [];
  }

  private abortControllersForItem(id: string): void {
    for (const [key, controller] of Array.from(this.activeEpisodeControllers.entries())) {
      if (key === id || key.startsWith(`${id}:`)) {
        try {
          controller.abort();
        } catch {
          /* abort is idempotent */
        }
      }
    }
  }

  private gateKey(id: string, episode: number): string {
    return this.epKey(id, episode);
  }

  private parkEpisode(id: string, episode: number): Promise<EpisodeGateReason> {
    // Si el item ya no existe (quitado de la cola), no aparcar: salir
    const alive = this.options.queueStore.items.some((i) => i.id === id);
    if (!alive) return Promise.resolve('total');
    const key = this.gateKey(id, episode);
    let gate = this.episodeGates.get(key);
    if (!gate) {
      gate = { settled: false, reason: 'total', waiters: [] };
      this.episodeGates.set(key, gate);
    }
    if (gate.settled) return Promise.resolve(gate.reason);
    return new Promise<EpisodeGateReason>((resolve) => {
      gate!.waiters.push(resolve);
    });
  }

  private settleGate(key: string, reason: EpisodeGateReason): void {
    let gate = this.episodeGates.get(key);
    if (!gate) {
      gate = { settled: true, reason, waiters: [] };
      this.episodeGates.set(key, gate);
      return;
    }
    gate.settled = true;
    gate.reason = reason;
    const waiters = gate.waiters.splice(0);
    for (const resolve of waiters) {
      try {
        resolve(reason);
      } catch {
        /* resolver ya consumido */
      }
    }
  }

  private consumeSettledResume(key: string): boolean {
    const gate = this.episodeGates.get(key);
    if (gate?.settled && gate.reason === 'resume') {
      this.episodeGates.delete(key);
      return true;
    }
    return false;
  }

  private wakeItemGates(id: string, reason: EpisodeGateReason): void {
    for (const [key, gate] of Array.from(this.episodeGates.entries())) {
      if (key === id || key.startsWith(`${id}:`)) {
        gate.settled = true;
        gate.reason = reason;
        const waiters = gate.waiters.splice(0);
        for (const resolve of waiters) {
          try {
            resolve(reason);
          } catch {
            /* resolver ya consumido */
          }
        }
        this.episodeGates.delete(key);
      }
    }
  }

  private snapshotPausedProgress(item: QueueItem): void {
    const ctx = this.parallelContexts.get(item.id);
    const doneSet = new Set<number>([...item.completedEps, ...item.failedEps, ...(item.cancelledEps || [])]);
    // Fusión: conserva claves de EPs no finalizados (p. ej. reanudados cuyo run
    // aún no los procesa); poda finalizados para no mostrar fantasmas.
    const keep: Record<string, { progress: number; server?: string }> = {};
    const prev = item.pausedEpSnapshot;
    if (prev && typeof prev === 'object') {
      for (const [key, entry] of Object.entries(prev)) {
        if (!/^\d+$/.test(key) || doneSet.has(Number(key))) continue;
        if (!entry || typeof entry !== 'object') continue;
        const progress =
          typeof entry.progress === 'number' && Number.isFinite(entry.progress)
            ? Math.max(0, Math.min(1, entry.progress))
            : 0;
        keep[key] =
          typeof entry.server === 'string' && entry.server ? { progress, server: entry.server } : { progress };
      }
    }
    for (const ep of item.pausedEps || []) {
      let progress = ctx?.progress.get(ep);
      let server = ctx?.server.get(ep);
      if (progress === undefined && item.currentEp === ep) {
        progress = item.progress;
        server = item.currentServer;
      }
      const clamped =
        typeof progress === 'number' && Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
      keep[String(ep)] = server ? { progress: clamped, server } : { progress: clamped };
    }
    item.pausedEpSnapshot = keep;
  }

  private syncPersistedPause(item: QueueItem): void {
    const sink = this.options.pausedProgress;
    if (!sink) return;
    try {
      if ((item.pausedEps || []).length === 0) {
        sink.clear(item.id);
        return;
      }
      this.snapshotPausedProgress(item);
      const episodes: Record<string, { progress: number; server?: string }> = {};
      for (const [ep, entry] of Object.entries(item.pausedEpSnapshot || {})) episodes[ep] = { ...entry };
      sink.save(item.id, { totalProgress: Math.max(0, Math.min(1, item.progress || 0)), episodes });
    } catch {
      // Best-effort: la pausa nunca falla por persistencia
    }
  }

  cancel(id: string): boolean {
    const item = this.options.queueStore.items.find((queueItem) => queueItem.id === id);
    if (!item) return false;
    if (item.status === 'done' || item.status === 'failed' || item.status === 'cancelled') {
      return item.status === 'cancelled';
    }

    this.cancelledIds.add(id);
    this.pausedItemIds.delete(id);
    this.pausedEpisodesByItem.delete(id);
    this.cancelledEpisodesByItem.delete(id);
    this.wakeItemGates(id, 'total');
    this.parallelContexts.delete(id);
    this.ensureEpArrays(item);
    item.pausedEps = [];
    if (item.pausedEpSnapshot) delete item.pausedEpSnapshot;
    try {
      this.options.pausedProgress?.clear(id);
    } catch {
      /* best-effort */
    }
    this.recordQueueCancellation(item);
    if (item.status === 'pending' || item.status === 'downloading' || item.status === 'paused') {
      item.status = 'cancelled';
      this.ensureEpArrays(item);
      this.options.updateTray();
      this.options.sendQueueUpdate();
    }

    if (id === this.activeQueueItemId) {
      this.abortControllersForItem(id);
      try {
        this.options.attemptService.abortItem?.(id);
      } catch {
        /* compat */
      }
      this.options.abortDownloadService();
    }
    return true;
  }

  pause(id: string): boolean {
    const item = this.options.queueStore.items.find((queueItem) => queueItem.id === id);
    if (!item) return false;
    if (item.status !== 'downloading' && item.status !== 'pending') return false;
    this.ensureEpArrays(item);
    this.pausedItemIds.add(id);
    const remaining = (item.episodes || []).filter(
      (ep) => !item.completedEps.includes(ep) && !item.failedEps.includes(ep),
    );
    const pausedSet = this.getPausedSet(id);
    for (const ep of remaining) {
      if (!item.completedEps.includes(ep) && !item.failedEps.includes(ep)) {
        pausedSet.add(ep);
        if (!item.pausedEps!.includes(ep)) item.pausedEps!.push(ep);
      }
    }
    // Quitar los que ya estaban cancelados del set de pausa
    const cancelledSet = this.cancelledEpisodesByItem.get(id);
    if (cancelledSet) {
      for (const ep of Array.from(pausedSet)) {
        if (cancelledSet.has(ep)) {
          pausedSet.delete(ep);
          const idx = item.pausedEps!.indexOf(ep);
          if (idx >= 0) item.pausedEps!.splice(idx, 1);
        }
      }
    }
    item.status = 'paused';
    this.abortControllersForItem(id);
    try {
      this.options.attemptService.abortItem?.(id);
    } catch {
      /* compat */
    }
    // Los workers aparcados individualmente salen con la pausa total
    this.wakeItemGates(id, 'total');
    this.snapshotPausedProgress(item);
    this.syncPersistedPause(item);
    this.options.updateTray();
    this.options.sendQueueUpdate();
    return true;
  }

  async cancelEpisode(id: string, episode: number): Promise<boolean> {
    const item = this.options.queueStore.items.find((queueItem) => queueItem.id === id);
    if (!item || !Number.isInteger(episode)) return false;
    if (!(item.episodes || []).includes(episode)) return false;
    if (item.completedEps.includes(episode)) return false;
    if (item.status === 'done' || item.status === 'failed' || item.status === 'cancelled') return false;
    this.ensureEpArrays(item);
    if (item.cancelledEps!.includes(episode)) return true;
    this.getCancelledSet(id).add(episode);
    if (!item.cancelledEps!.includes(episode)) item.cancelledEps!.push(episode);
    // Si estaba pausado, desmarcar pausa
    this.pausedEpisodesByItem.get(id)?.delete(episode);
    if (item.pausedEps) {
      const idx = item.pausedEps.indexOf(episode);
      if (idx >= 0) item.pausedEps.splice(idx, 1);
    }
    if (item.pausedEpSnapshot) delete item.pausedEpSnapshot[String(episode)];
    const key = this.epKey(id, episode);
    // Si el worker está aparcado, lo despierta: finaliza cancelled y libera el slot
    this.settleGate(key, 'cancel');
    const controller = this.activeEpisodeControllers.get(key);
    if (controller) {
      try {
        controller.abort();
      } catch {
        /* abort is idempotent */
      }
    }
    try {
      this.options.attemptService.abortEpisode?.(id, episode);
    } catch {
      /* compat */
    }
    // Limpieza solo de este EP (preserva parciales de otros)
    try {
      const dest = this.options.buildEpisodePath(item, episode);
      await this.options.attemptService.cleanEpisodeTemps(dest);
      await this.options.attemptService.cleanYtdlpCacheForEpisode(dest);
    } catch {
      /* limpieza best-effort */
    }
    this.syncPersistedPause(item);
    this.options.sendQueueUpdate();
    return true;
  }

  pauseEpisode(id: string, episode: number): boolean {
    const item = this.options.queueStore.items.find((queueItem) => queueItem.id === id);
    if (!item || !Number.isInteger(episode)) return false;
    if (!(item.episodes || []).includes(episode)) return false;
    if (item.completedEps.includes(episode) || item.failedEps.includes(episode)) return false;
    if (item.status !== 'downloading' && item.status !== 'pending') return false;
    this.ensureEpArrays(item);
    if ((item.cancelledEps || []).includes(episode)) return false;
    if ((item.pausedEps || []).includes(episode)) return true;
    this.getPausedSet(id).add(episode);
    item.pausedEps!.push(episode);
    // Puerta fresca: descarta veredictos rancios de pausas anteriores
    this.episodeGates.delete(this.gateKey(id, episode));
    // Snapshot del % congelado (los mapas aún tienen los últimos valores)
    this.snapshotPausedProgress(item);
    this.syncPersistedPause(item);
    const key = this.epKey(id, episode);
    const controller = this.activeEpisodeControllers.get(key);
    if (controller) {
      try {
        controller.abort();
      } catch {
        /* abort is idempotent */
      }
    }
    try {
      this.options.attemptService.abortEpisode?.(id, episode);
    } catch {
      /* compat */
    }
    // Pausa conserva parciales (.part/.ytdl) para --continue, no limpia
    this.options.sendQueueUpdate();
    return true;
  }

  resumeEpisode(id: string, episode: number): boolean {
    const item = this.options.queueStore.items.find((queueItem) => queueItem.id === id);
    if (!item || !Number.isInteger(episode)) return false;
    this.ensureEpArrays(item);
    const pausedSet = this.pausedEpisodesByItem.get(id);
    const inMemory = pausedSet?.has(episode) || false;
    const inItem = (item.pausedEps || []).includes(episode);
    if (!inMemory && !inItem) return false;
    pausedSet?.delete(episode);
    if (item.pausedEps) {
      const idx = item.pausedEps.indexOf(episode);
      if (idx >= 0) item.pausedEps.splice(idx, 1);
    }
    if ((item.pausedEps || []).length === 0) this.pausedEpisodesByItem.delete(id);
    // Si el item estaba totalmente pausado y queda trabajo (aunque sigan otros
    // EPs pausados), volver a pending para reencolar: el run procesa los
    // despausados, salta los pausados y al final re-pausa si quedan.
    if (item.status === 'paused') {
      const remaining = (item.episodes || []).filter(
        (ep) => !item.completedEps.includes(ep) && !(item.cancelledEps || []).includes(ep),
      );
      if (remaining.length > 0) {
        item.status = 'pending';
        this.pausedItemIds.delete(id);
      }
    }
    // Despierta al worker aparcado: reintenta su EP con --continue
    this.settleGate(this.gateKey(id, episode), 'resume');
    this.syncPersistedPause(item);
    this.options.sendQueueUpdate();
    return true;
  }

  resume(id: string): boolean {
    const item = this.options.queueStore.items.find((queueItem) => queueItem.id === id);
    if (!item || item.status !== 'paused') return false;
    this.ensureEpArrays(item);
    const remaining = (item.episodes || []).filter(
      (ep) => !item.completedEps.includes(ep) && !(item.cancelledEps || []).includes(ep),
    );
    if (remaining.length === 0) return false;
    // Limpieza atómica: sin esto el run reencolado vuelve a ver pausedEps y se re-pausa.
    // El snapshot se conserva a propósito: el run nuevo lo siembra como baseline
    // max() y cada finalize limpia su EP.
    this.pausedItemIds.delete(id);
    this.pausedEpisodesByItem.delete(id);
    item.pausedEps = [];
    try {
      this.options.pausedProgress?.clear(id);
    } catch {
      /* best-effort */
    }
    item.status = 'pending';
    this.options.sendQueueUpdate();
    return true;
  }

  skip(id: string, episode?: number): boolean {
    if (episode !== undefined) {
      if (!Number.isInteger(episode)) return false;
      if (id !== this.activeQueueItemId) return false;
      try {
        const fn = (
          this.options.attemptService as unknown as {
            skipEpisode?: (itemId: string, ep: number) => boolean;
            skip: (itemId?: string, ep?: number) => boolean;
          }
        ).skipEpisode;
        if (typeof fn === 'function') return fn.call(this.options.attemptService, id, episode);
      } catch {
        return false;
      }
      return (this.options.attemptService as unknown as { skip: () => boolean }).skip();
    }
    return id === this.activeQueueItemId && this.options.attemptService.skip();
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
    this.cancelledIds.delete(id);
    this.retryOnlyIds.add(id);

    if (item.failureReasons) {
      const nextReasons = { ...item.failureReasons };
      for (const episode of item.failedEps) delete nextReasons[String(episode)];
      item.failureReasons = Object.keys(nextReasons).length > 0 ? nextReasons : undefined;
    }

    return true;
  }

  /** Cleanup stale ids for items that no longer exist or are terminal */
  private cleanupStaleIds(): void {
    for (const id of Array.from(this.cancelledIds)) {
      const exists = this.options.queueStore.items.some((i) => i.id === id);
      if (!exists) this.cancelledIds.delete(id);
    }
    for (const id of Array.from(this.retryOnlyIds)) {
      const exists = this.options.queueStore.items.some((i) => i.id === id);
      if (!exists) this.retryOnlyIds.delete(id);
    }
    for (const id of Array.from(this.pausedItemIds)) {
      const exists = this.options.queueStore.items.some((i) => i.id === id);
      if (!exists) this.pausedItemIds.delete(id);
    }
    for (const id of Array.from(this.pausedEpisodesByItem.keys())) {
      const exists = this.options.queueStore.items.some((i) => i.id === id);
      if (!exists) this.pausedEpisodesByItem.delete(id);
    }
    for (const id of Array.from(this.cancelledEpisodesByItem.keys())) {
      const exists = this.options.queueStore.items.some((i) => i.id === id);
      if (!exists) this.cancelledEpisodesByItem.delete(id);
    }
  }

  /** Called when queue items are removed externally (clear/remove) */
  notifyItemsRemoved(removedIds: string[]): void {
    for (const id of removedIds) {
      this.cancelledIds.delete(id);
      this.retryOnlyIds.delete(id);
      this.pausedItemIds.delete(id);
      this.pausedEpisodesByItem.delete(id);
      this.cancelledEpisodesByItem.delete(id);
      // Sin esto, un worker aparcado cuelga processQueue para siempre
      this.wakeItemGates(id, 'total');
      this.parallelContexts.delete(id);
      for (const key of Array.from(this.activeEpisodeControllers.keys())) {
        if (key === id || key.startsWith(`${id}:`)) this.activeEpisodeControllers.delete(key);
      }
      try {
        this.options.pausedProgress?.clear(id);
      } catch {
        /* best-effort */
      }
    }
    this.cleanupStaleIds();
  }

  private bumpRunEpoch(id: string): number {
    const next = (this.runEpoch.get(id) || 0) + 1;
    this.runEpoch.set(id, next);
    return next;
  }

  private getWorkList(item: QueueItem, base: number[]): number[] {
    const cancelled = new Set<number>([
      ...(item.cancelledEps || []),
      ...(this.cancelledEpisodesByItem.get(item.id) || []),
    ]);
    const completed = new Set<number>(item.completedEps || []);
    return (base || []).filter((ep) => !completed.has(ep) && !cancelled.has(ep));
  }

  async processQueue(): Promise<void> {
    if (this.options.isUpdateInProgress()) {
      console.log('processQueue pausado mientras se actualiza yt-dlp.');
      this.cleanupStaleIds();
      return;
    }
    if (this.isProcessingQueue) {
      console.log('processQueue ya está en ejecución.');
      return;
    }

    this.isProcessingQueue = true;
    console.log('Iniciando processQueue...');
    let restartQueueAfterError = false;

    try {
      while (true) {
        const item = this.options.queueStore.items.find((queueItem) => queueItem.status === 'pending');
        if (!item) {
          this.options.updateTray();
          break;
        }

        item.status = 'downloading';
        this.ensureEpArrays(item);
        const runEpoch = this.bumpRunEpoch(item.id);
        const rawList = this.retryOnlyIds.has(item.id) ? [...item.failedEps] : item.episodes;
        const episodesToProcess = this.getWorkList(item, rawList);
        console.log(`Procesando item: ${item.animeTitle}`);
        this.options.updateTray(`Descargando ${item.animeTitle}...`);
        this.options.sendQueueUpdate();
        if (!this.options.isMainWindowFocused()) {
          this.options.sendNotification('Descarga Iniciada', `Iniciando: ${item.animeTitle}`, 'showDownloadStarted');
        }
        this.options.sendDownloadStarted(item);
        this.options.sendLog(
          `🎬 Iniciando "${item.animeTitle}" — ${this.formatEpisodeCountLabel(episodesToProcess.length, true)} en cola`,
          'info',
        );
        this.options.sendStatus(`Iniciando "${item.animeTitle}"`, episodesToProcess.length > 1);

        const maxParallel = this.getMaxParallelEpisodes();
        if (maxParallel <= 1) {
          for (let cursor = 0; cursor < episodesToProcess.length; cursor += 1) {
            const episode = episodesToProcess[cursor];
            if (this.cancelledIds.has(item.id)) {
              item.status = 'cancelled';
              this.options.updateTray();
              this.options.sendQueueUpdate();
              this.options.sendLog(`⛔ Descarga de "${item.animeTitle}" cancelada por el usuario`, 'warn');
              this.options.sendStatus(`Cancelado: ${item.animeTitle}`, episodesToProcess.length > 1);
              break;
            }
            if (this.pausedItemIds.has(item.id) || (item.status as string) === 'paused') {
              item.status = 'paused';
              this.options.updateTray();
              this.options.sendQueueUpdate();
              this.options.sendLog(`⏸ Descarga de "${item.animeTitle}" pausada por el usuario`, 'warn');
              break;
            }
            if ((item.cancelledEps || []).includes(episode)) continue;
            if ((item.pausedEps || []).includes(episode)) continue;

            item.currentEp = episode;
            // Siembra anti-flash: arrancar del % congelado si existe baseline
            item.progress = this.frozenBaseline(item, episode);
            this.options.updateTray(`Preparando ${item.animeTitle} - EP ${episode}...`);
            this.options.sendQueueUpdate();
            this.options.sendLog(`🔍 Buscando servidores para EP ${episode}...`, 'info');
            this.options.sendLog(`🧭 Ruta activa: ${item.downloadSlug || item.slug}`, 'info');
            this.options.sendStatus(`Buscando EP ${episode}...`, episodesToProcess.length > 1);

            const dest = this.options.buildEpisodePath(item, episode);
            if (this.options.attemptService.hasCompletedFile(dest)) {
              this.options.sendLog(`💡 EP ${episode} ya existe en disco. Omitiendo.`, 'info');
              this.removeEpisode(item.failedEps, episode);
              this.pushUniqueEpisode(item.completedEps, episode);
              this.removeFailureReason(item, episode);
              continue;
            }

            this.removeEpisode(item.completedEps, episode);
            this.removeEpisode(item.failedEps, episode);

            const episodeAbort = new AbortController();
            const epKey = this.epKey(item.id, episode);
            this.activeEpisodeControllers.set(epKey, episodeAbort);
            this.activeQueueItemId = item.id;
            const links = await this.options.getEpisodeLinks(item, episode, episodeAbort.signal);

            if (episodeAbort.signal.aborted || this.cancelledIds.has(item.id)) {
              if ((item.cancelledEps || []).includes(episode)) {
                this.finalizeEpisodeResult(item, episode, dest, 'cancelled');
                this.activeEpisodeControllers.delete(epKey);
                if (this.activeEpisodeControllers.size === 0) this.activeQueueItemId = null;
                this.options.sendQueueUpdate();
                this.options.sendLog(`⛔ EP ${episode}: cancelado por el usuario (sigue el resto)`, 'warn');
                continue;
              }
              if (this.pausedItemIds.has(item.id)) {
                item.status = 'paused';
                this.activeEpisodeControllers.delete(epKey);
                if (this.activeEpisodeControllers.size === 0) this.activeQueueItemId = null;
                this.options.sendQueueUpdate();
                this.options.sendLog(`⏸ EP ${episode}: pausado por el usuario`, 'warn');
                break;
              }
              if ((item.pausedEps || []).includes(episode)) {
                this.activeEpisodeControllers.delete(epKey);
                if (this.activeEpisodeControllers.size === 0) this.activeQueueItemId = null;
                this.options.sendQueueUpdate();
                this.options.sendLog(`⏸ EP ${episode}: aparcado, conserva su slot`, 'warn');
                const reason = await this.parkEpisode(item.id, episode);
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
              if (this.consumeSettledResume(this.gateKey(item.id, episode))) {
                // Pausa+reanudar durante el aborto: reintentar el mismo EP
                this.activeEpisodeControllers.delete(epKey);
                if (this.activeEpisodeControllers.size === 0) this.activeQueueItemId = null;
                this.options.sendQueueUpdate();
                cursor -= 1;
                continue;
              }
              if ((item.status as string) === 'pending') {
                // Reanudado mientras el aborto seguía en vuelo: no finalizar,
                // el EP queda sin contabilizar y la finalización lo reencola
                this.activeEpisodeControllers.delete(epKey);
                if (this.activeEpisodeControllers.size === 0) this.activeQueueItemId = null;
                this.options.sendQueueUpdate();
                continue;
              }
              item.status = 'cancelled';
              this.finalizeEpisodeResult(item, episode, dest, 'cancelled');
              this.activeEpisodeControllers.delete(epKey);
              if (this.activeEpisodeControllers.size === 0) this.activeQueueItemId = null;
              this.options.sendQueueUpdate();
              this.options.sendLog(`⛔ EP ${episode}: descarga cancelada por el usuario`, 'warn');
              break;
            }

            if (!links || links.length === 0) {
              this.options.sendLog(`✗ EP ${episode}: No se encontraron servidores disponibles`, 'error');
              this.finalizeEpisodeResult(item, episode, dest, 'fail', 'No se encontraron servidores disponibles');
              this.activeEpisodeControllers.delete(epKey);
              if (this.activeEpisodeControllers.size === 0) this.activeQueueItemId = null;
              continue;
            }

            this.options.sendLog(`⏳ Analizando servidores disponibles para EP ${episode}...`, 'info');
            const order = this.options.getServerPriorityOrder(item.providerId);
            const sortedLinks = this.sortLinksForEpisode(links, order, item.currentServer);

            if (sortedLinks.length === 0) {
              this.options.sendLog(
                `✗ EP ${episode}: Ninguno de los servidores disponibles está en tu lista de prioridad`,
                'error',
              );
              this.finalizeEpisodeResult(
                item,
                episode,
                dest,
                'fail',
                'Ninguno de los servidores disponibles está soportado',
              );
              this.activeEpisodeControllers.delete(epKey);
              if (this.activeEpisodeControllers.size === 0) this.activeQueueItemId = null;
              continue;
            }

            this.options.sendLog(
              `📋 ${sortedLinks.length} candidato(s): ${sortedLinks.map((link) => link.server).join(' → ')}`,
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

            this.activeEpisodeControllers.delete(epKey);
            if (this.activeEpisodeControllers.size === 0) this.activeQueueItemId = null;
            if (episodeAbort.signal.aborted) {
              if ((item.cancelledEps || []).includes(episode)) {
                this.finalizeEpisodeResult(item, episode, dest, 'cancelled');
                this.options.sendQueueUpdate();
                this.options.sendLog(`⛔ EP ${episode}: cancelado por el usuario (sigue el resto)`, 'warn');
                continue;
              }
              if (this.pausedItemIds.has(item.id)) {
                item.status = 'paused';
                this.options.sendQueueUpdate();
                this.options.sendLog(`⏸ EP ${episode}: pausado por el usuario`, 'warn');
                break;
              }
              if ((item.pausedEps || []).includes(episode)) {
                this.options.sendQueueUpdate();
                this.options.sendLog(`⏸ EP ${episode}: aparcado, conserva su slot`, 'warn');
                const reason = await this.parkEpisode(item.id, episode);
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
              if (this.consumeSettledResume(this.gateKey(item.id, episode))) {
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
              this.options.sendLog(`⛔ EP ${episode}: descarga cancelada por el usuario`, 'warn');
              break;
            } else if (success) {
              this.finalizeEpisodeResult(item, episode, dest, 'ok');
            } else {
              this.finalizeEpisodeResult(item, episode, dest, 'fail', failureReason);
              this.options.sendLog(`⚠ EP ${episode}: falló en todos los servidores disponibles`, 'warn');
            }
          }
        } else {
          await this.processEpisodesParallel(item, episodesToProcess, maxParallel);
        }

        if ((item.status as string) === 'paused' || this.pausedItemIds.has(item.id)) {
          item.status = 'paused';
          this.options.sendStatus(`Pausado: ${item.animeTitle}`, item.episodes.length > 1);
        } else if (item.status !== 'cancelled') {
          const pausedCount = (item.pausedEps || []).length;
          if (pausedCount > 0) {
            item.status = 'paused';
            this.pausedItemIds.add(item.id);
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
              const stillActive = Array.from(this.activeEpisodeControllers.keys()).some((k) =>
                k.startsWith(`${item.id}:`),
              );
              if (!stillActive) {
                item.status = 'pending';
                this.options.sendStatus(`Reencolado: ${item.animeTitle} (${unaccounted.length} pendiente(s))`, true);
                this.options.sendQueueUpdate();
                item.currentEp = null;
                this.options.updateTray();
                this.cancelledIds.delete(item.id);
                this.retryOnlyIds.delete(item.id);
                this.pausedItemIds.delete(item.id);
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
        this.cancelledIds.delete(item.id);
        this.retryOnlyIds.delete(item.id);
        if ((item.status as string) !== 'paused') {
          this.pausedItemIds.delete(item.id);
          // Pausados individuales que quedaron sin procesar se conservan para resume;
          // cancelados se conservan como parcial.
        }
        this.options.sendQueueUpdate();
      }
    } catch (error) {
      this.options.logError(error);
      const failedItem = this.options.queueStore.items.find((item) => item.status === 'downloading');
      if (failedItem) {
        const wasCancelled = this.cancelledIds.has(failedItem.id) || failedItem.status === 'cancelled';
        this.retryOnlyIds.delete(failedItem.id);
        this.cancelledIds.delete(failedItem.id);
        if (!wasCancelled && failedItem.currentEp !== null) {
          const failedEpisode = failedItem.currentEp;
          const failedPath = this.options.buildEpisodePath(failedItem, failedEpisode);
          await this.options.attemptService.cleanYtdlpCacheForEpisode(failedPath);
          this.finalizeEpisodeResult(
            failedItem,
            failedEpisode,
            failedPath,
            'fail',
            'La descarga terminó por un error inesperado',
          );
          failedItem.status = 'failed';
          this.options.sendLog(`✗ La descarga de "${failedItem.animeTitle}" terminó por un error inesperado.`, 'error');
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
      this.activeEpisodeControllers.clear();
      this.activeQueueItemId = null;
      this.isProcessingQueue = false;
      this.cleanupStaleIds();
      console.log('processQueue finalizado.');
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
    this.ensureEpArrays(item);
    if (item.pausedEpSnapshot) {
      delete item.pausedEpSnapshot[String(episode)];
      if (Object.keys(item.pausedEpSnapshot).length === 0) delete item.pausedEpSnapshot;
    }
    if (status === 'ok') {
      this.removeEpisode(item.failedEps, episode);
      this.removeEpisode(item.pausedEps!, episode);
      this.pausedEpisodesByItem.get(item.id)?.delete(episode);
      this.pushUniqueEpisode(item.completedEps, episode);
      this.removeFailureReason(item, episode);
    } else if (status === 'fail') {
      this.removeEpisode(item.completedEps, episode);
      this.removeEpisode(item.pausedEps!, episode);
      this.pausedEpisodesByItem.get(item.id)?.delete(episode);
      this.pushUniqueEpisode(item.failedEps, episode);
      if (!item.failureReasons) item.failureReasons = {};
      item.failureReasons[String(episode)] = reason || 'No se pudo completar la descarga';
    } else if (status === 'cancelled') {
      // Cancel individual ya registrado en cancelledEps por cancelEpisode();
      // aquí solo asegurar limpieza de pausa/fallo.
      this.removeEpisode(item.failedEps, episode);
      this.removeEpisode(item.pausedEps!, episode);
      this.pausedEpisodesByItem.get(item.id)?.delete(episode);
      this.removeFailureReason(item, episode);
    }
    if ((item.pausedEps || []).length > 0) this.syncPersistedPause(item);

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

  private recordQueueCancellation(item: QueueItem): void {
    this.options.writeHistory({
      date: new Date().toLocaleString(),
      anime: item.animeTitle,
      slug: item.slug,
      status: 'cancelled',
      path: item.targetPath,
      providerId: item.providerId,
      scope: 'queue',
      queueId: item.id,
      reason: 'user',
      episodeList: item.episodes,
    });
  }

  private handleProgress(item: QueueItem, episode: number, logId: string, update: EpisodeAttemptProgress): void {
    const live = Math.max(0, Math.min(1, update.progress));
    const display = Math.max(this.frozenBaseline(item, episode), live);
    item.progress = display;
    if (this.options.scheduleQueueProgress) {
      // Secuencial también emite foto de 1 EP: sin ella el Detalle
      // degrada el EP en vuelo a 'queued 0%' aunque el Total avance.
      const server = typeof item.currentServer === 'string' && item.currentServer ? item.currentServer : undefined;
      this.options.scheduleQueueProgress(item, [{ episode, progress: display, ...(server ? { server } : {}) }]);
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

  private removeFailureReason(item: QueueItem, episode: number): void {
    if (!item.failureReasons) return;
    delete item.failureReasons[String(episode)];
    if (Object.keys(item.failureReasons).length === 0) item.failureReasons = undefined;
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

  private shouldUseFrozenBaseline(): boolean {
    try {
      const raw = this.options.getDownloadSettings?.()?.allowContinue;
      return raw !== false;
    } catch {
      return true;
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

  private sortLinksForEpisode(
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

  private serverSlotKey(id: string, server: string): string {
    return `${id}|${server}`;
  }

  private episodeInterrupted(item: QueueItem, episode: number): boolean {
    if (this.cancelledIds.has(item.id) || this.pausedItemIds.has(item.id)) return true;
    if (item.status === 'cancelled' || item.status === 'paused') return true;
    return (item.cancelledEps ?? []).includes(episode) || (item.pausedEps ?? []).includes(episode);
  }

  private async acquireServerSlot(
    item: QueueItem,
    episode: number,
    server: string,
    signal: AbortSignal,
  ): Promise<boolean> {
    const key = this.serverSlotKey(item.id, server);
    for (;;) {
      const used = this.activeServerCounts.get(key) ?? 0;
      if (used < MAX_CONCURRENT_PER_SERVER) {
        this.activeServerCounts.set(key, used + 1);
        return true;
      }
      if (signal.aborted || this.episodeInterrupted(item, episode)) return false;
      await new Promise((resolve) => setTimeout(resolve, SERVER_SLOT_POLL_MS));
    }
  }

  private releaseServerSlot(id: string, server: string): void {
    const key = this.serverSlotKey(id, server);
    const left = (this.activeServerCounts.get(key) ?? 1) - 1;
    if (left <= 0) this.activeServerCounts.delete(key);
    else this.activeServerCounts.set(key, left);
  }

  private purgeServerSlots(id: string): void {
    for (const key of Array.from(this.activeServerCounts.keys())) {
      if (key === id || key.startsWith(`${id}|`)) this.activeServerCounts.delete(key);
    }
  }

  private async attemptServersSequentially(
    item: QueueItem,
    episode: number,
    dest: string,
    episodeAbort: AbortController,
    sortedLinks: ProviderDownloadLink[],
    onProgress: (update: EpisodeAttemptProgress) => void,
    onServerChange?: (server: string) => void,
  ): Promise<{ success: boolean; failureReason: string }> {
    let success = false;
    let failureReason = 'Todos los servidores disponibles fallaron';
    let heldServer: string | null = null;
    try {
      for (const link of sortedLinks) {
        if (episodeAbort.signal.aborted) break;
        const speed = this.options.getServerSpeed(link.server) || '–';
        const resolvedLabel = link.sourceEpisode !== episode ? ` (fuente EP ${link.sourceEpisode})` : '';
        this.options.sendLog(
          `▶ Intentando "${link.server}" desde ${link.provider}${resolvedLabel} (${speed})...`,
          'info',
        );
        item.currentServer = link.server;
        onServerChange?.(link.server);
        // Aviso liviano y throttled: el progreso en vuelo ya viaja por delta
        // 250ms, no hace falta un full sync por cada salto de servidor.
        if (this.options.scheduleQueueUpdate) this.options.scheduleQueueUpdate();
        else this.options.sendQueueUpdate();
        // Tope por servidor: si ya hay 2 EPs en este host, espera un hueco en
        // vez de saturarlo. Al abortar/pausar sale y sigue la ruta de aborto.
        if (heldServer !== link.canonicalServer) {
          if (heldServer) {
            this.releaseServerSlot(item.id, heldServer);
            heldServer = null;
          }
          const acquired = await this.acquireServerSlot(item, episode, link.canonicalServer, episodeAbort.signal);
          if (!acquired) break;
          heldServer = link.canonicalServer;
        }
        const startedAt = Date.now();
        const result = await this.options.attemptService.attempt(item, episode, link, dest, episodeAbort.signal, {
          onProgress,
          updateTray: (text) => this.options.updateTray(text),
        });
        success = result.success;
        try {
          this.options.recordServerOutcome?.({
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
          this.options.sendLog(
            `✓ EP ${episode} descargado desde "${link.server}"${resolvedLabel} en ${(elapsedMs / 1000).toFixed(1)}s`,
            'success',
          );
          this.options.sendStatus(`EP ${episode} Completado ✓`, item.episodes.length > 1);
          break;
        }
        if (result.invalidMp4) continue;
        if (result.attemptTimedOut && !result.parentAborted) {
          failureReason = `El servidor "${link.server}" no inició la descarga a tiempo`;
          const timeoutSec = this.getStartTimeoutSec();
          this.options.sendLog(
            `⌛ "${link.server}" no inició descarga en ${timeoutSec}s. Probando siguiente...`,
            'warn',
          );
          await this.options.attemptService.cleanEpisodeTemps(dest);
          await this.options.attemptService.cleanYtdlpCacheForEpisode(dest);
        } else if (result.toolFailureMessage && !result.parentAborted) {
          failureReason = result.toolFailureMessage;
          this.options.sendLog(`✗ ${result.toolFailureMessage}`, 'error');
          await this.options.attemptService.cleanYtdlpCacheForEpisode(dest);
        } else if (!result.parentAborted) {
          await this.options.attemptService.cleanYtdlpCacheForEpisode(dest);
          const isLast = sortedLinks.indexOf(link) === sortedLinks.length - 1;
          if (result.skipRequested) {
            this.options.sendLog(
              `⏭️ "${link.server}" cancelado, probando siguiente...${isLast ? ' (Último servidor)' : ''}`,
              'warn',
            );
          } else {
            this.options.sendLog(
              `✗ "${link.server}" falló.${isLast ? ' Sin más servidores.' : ' Probando siguiente...'}`,
              'error',
            );
          }
        }
      }
    } finally {
      if (heldServer) this.releaseServerSlot(item.id, heldServer);
    }
    return { success, failureReason };
  }

  // Suelo de display al reanudar: el % vivo nunca baja del congelado
  // mientras exista baseline en el snapshot (se limpia al finalizar el EP).
  // Con allowContinue=false el EP reinicia de cero, sin suelo.
  private frozenBaseline(item: QueueItem, episode: number): number {
    if (!this.shouldUseFrozenBaseline()) return 0;
    const raw = item.pausedEpSnapshot?.[String(episode)]?.progress;
    return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
  }

  private handleParallelProgress(
    item: QueueItem,
    episodesToProcess: number[],
    episodeProgress: Map<number, number>,
    episodeServer: Map<number, string>,
    episode: number,
    logId: string,
    update: EpisodeAttemptProgress,
  ): void {
    const live = Math.max(0, Math.min(1, update.progress));
    episodeProgress.set(episode, Math.max(this.frozenBaseline(item, episode), live));
    const total = Math.max(1, episodesToProcess.length);
    // Pausados no cuentan como finalizados: su % congelado suma en activeSum
    const isFinal = (ep: number): boolean =>
      item.completedEps.includes(ep) || item.failedEps.includes(ep) || (item.cancelledEps || []).includes(ep);
    const finalized = episodesToProcess.filter(isFinal).length;
    const activeEps: import('./QueueStore').ActiveEpisodeProgress[] = [];
    const pausedSet = new Set<number>(item.pausedEps || []);
    let activeSum = 0;
    for (const ep of episodesToProcess) {
      if (isFinal(ep)) continue;
      activeSum += episodeProgress.get(ep) ?? 0;
      // Pausados suman su % congelado pero no listan como activos
      if (pausedSet.has(ep)) continue;
      // Veraz: solo lista EPs con worker vivo; los en cola sin arrancar no existen visualmente
      if (!this.activeEpisodeControllers.has(this.epKey(item.id, ep))) continue;
      if (activeEps.length < 3) {
        activeEps.push({
          episode: ep,
          progress: Math.max(0, Math.min(1, episodeProgress.get(ep) ?? 0)),
          ...(episodeServer.get(ep) ? { server: episodeServer.get(ep) as string } : {}),
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
    // Siembra anti-flash: al reanudar, los mapas arrancan del % congelado
    // (el vivo lo supera con max()) en vez de publicar ceros.
    if (item.pausedEpSnapshot && typeof item.pausedEpSnapshot === 'object') {
      const doneSet = new Set<number>([...item.completedEps, ...item.failedEps, ...(item.cancelledEps || [])]);
      for (const ep of episodesToProcess) {
        if (doneSet.has(ep)) continue;
        const frozen = this.frozenBaseline(item, ep);
        if (frozen > 0) episodeProgress.set(ep, frozen);
        const server = item.pausedEpSnapshot[String(ep)]?.server;
        if (typeof server === 'string' && server) episodeServer.set(ep, server);
      }
    }
    this.parallelContexts.set(item.id, { progress: episodeProgress, server: episodeServer });
    const runCtx = this.parallelContexts.get(item.id)!;
    let nextIndex = 0;
    const workerCount = Math.max(1, Math.min(maxParallel, episodesToProcess.length));

    const processOne = async (episode: number): Promise<void> => {
      for (;;) {
        if (this.parallelContexts.get(item.id) !== runCtx) return;
        if (this.cancelledIds.has(item.id)) return;
        if (this.pausedItemIds.has(item.id) || item.status === 'paused') return;
        if ((item.cancelledEps || []).includes(episode)) return;
        if ((item.pausedEps || []).includes(episode)) {
          // Aparcado antes de arrancar: espera sin consumir slot ajeno
          const reason = await this.parkEpisode(item.id, episode);
          if (this.parallelContexts.get(item.id) !== runCtx) return;
          if (reason === 'resume') continue;
          if (reason === 'cancel') {
            this.finalizeEpisodeResult(item, episode, this.options.buildEpisodePath(item, episode), 'cancelled');
            this.options.sendQueueUpdate();
          }
          return;
        }
        this.options.sendLog(`🔍 Buscando servidores para EP ${episode}...`, 'info');
        const dest = this.options.buildEpisodePath(item, episode);
        if (this.options.attemptService.hasCompletedFile(dest)) {
          this.options.sendLog(`💡 EP ${episode} ya existe en disco. Omitiendo.`, 'info');
          this.removeEpisode(item.failedEps, episode);
          this.pushUniqueEpisode(item.completedEps, episode);
          this.removeFailureReason(item, episode);
          return;
        }

        this.removeEpisode(item.completedEps, episode);
        this.removeEpisode(item.failedEps, episode);

        const episodeAbort = new AbortController();
        const epKey = this.epKey(item.id, episode);
        this.activeEpisodeControllers.set(epKey, episodeAbort);
        this.activeQueueItemId = item.id;
        try {
          const links = await this.options.getEpisodeLinks(item, episode, episodeAbort.signal);
          if (episodeAbort.signal.aborted || this.cancelledIds.has(item.id)) {
            if ((item.cancelledEps || []).includes(episode)) {
              this.finalizeEpisodeResult(item, episode, dest, 'cancelled');
              this.options.sendQueueUpdate();
              this.options.sendLog(`⛔ EP ${episode}: cancelado por el usuario (sigue el resto)`, 'warn');
              return;
            }
            if (this.pausedItemIds.has(item.id)) {
              if ((item.status as string) !== 'paused') item.status = 'paused';
              this.options.sendQueueUpdate();
              this.options.sendLog(`⏸ EP ${episode}: pausado por el usuario`, 'warn');
              return;
            }
            if ((item.pausedEps || []).includes(episode)) {
              this.options.sendQueueUpdate();
              this.options.sendLog(`⏸ EP ${episode}: aparcado, conserva su slot`, 'warn');
              const reason = await this.parkEpisode(item.id, episode);
              if (this.parallelContexts.get(item.id) !== runCtx) return;
              if (reason === 'resume') continue;
              if (reason === 'cancel') {
                this.finalizeEpisodeResult(item, episode, dest, 'cancelled');
                this.options.sendQueueUpdate();
              }
              return;
            }
            if (this.consumeSettledResume(this.gateKey(item.id, episode))) {
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
            this.options.sendLog(`⛔ EP ${episode}: descarga cancelada por el usuario`, 'warn');
            return;
          }
          if (!links || links.length === 0) {
            this.options.sendLog(`✗ EP ${episode}: No se encontraron servidores disponibles`, 'error');
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
                episode,
                logId,
                update,
              ),
            (server) => episodeServer.set(episode, server),
          );
          if (episodeAbort.signal.aborted || this.cancelledIds.has(item.id)) {
            if ((item.cancelledEps || []).includes(episode)) {
              this.finalizeEpisodeResult(item, episode, dest, 'cancelled');
              this.options.sendQueueUpdate();
              return;
            }
            if (this.pausedItemIds.has(item.id)) {
              if ((item.status as string) !== 'paused') item.status = 'paused';
              this.options.sendQueueUpdate();
              return;
            }
            if ((item.pausedEps || []).includes(episode)) {
              this.options.sendQueueUpdate();
              const reason = await this.parkEpisode(item.id, episode);
              if (this.parallelContexts.get(item.id) !== runCtx) return;
              if (reason === 'resume') continue;
              if (reason === 'cancel') {
                this.finalizeEpisodeResult(item, episode, dest, 'cancelled');
                this.options.sendQueueUpdate();
              }
              return;
            }
            if (this.consumeSettledResume(this.gateKey(item.id, episode))) {
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
            this.options.sendLog(`⚠ EP ${episode}: falló en todos los servidores disponibles`, 'warn');
          }
          return;
        } finally {
          this.activeEpisodeControllers.delete(epKey);
          // Si el EP queda aparcado, conservar su % congelado en los mapas
          if (!(item.pausedEps || []).includes(episode)) {
            episodeProgress.delete(episode);
            episodeServer.delete(episode);
          }
        }
      }
    };

    const workers = Array.from({ length: workerCount }, async () => {
      while (true) {
        if (this.cancelledIds.has(item.id) || item.status === 'cancelled') return;
        if (this.pausedItemIds.has(item.id) || item.status === 'paused') return;
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
      this.wakeItemGates(item.id, 'total');
      this.purgeServerSlots(item.id);
      if (this.parallelContexts.get(item.id) === runCtx) this.parallelContexts.delete(item.id);
    }
    if (this.activeEpisodeControllers.size === 0) this.activeQueueItemId = null;
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
