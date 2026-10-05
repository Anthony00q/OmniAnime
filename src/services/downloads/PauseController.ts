import type { HistoryWriteRecord } from '../../types/history';
import type { QueueItem } from '../../types/queue';
import type { EpisodeDownloadAttemptService } from './EpisodeDownloadAttemptService';
import { noopScopedLogger, type ScopedLogger } from '../logging/AppLogger';
import type { QueueStore } from '../persistence/QueueStore';

export type EpisodeGateReason = 'resume' | 'cancel' | 'total';

export interface PausedProgressSink {
  save(
    queueId: string,
    snapshot: { totalProgress: number; episodes: Record<string, { progress: number; server?: string }> },
  ): void;
  clear(queueId: string): void;
}

// Contexto vivo del run paralelo (para snapshottear % al pausar).
export interface ParallelRunContext {
  progress: Map<number, number>;
  server: Map<number, string>;
}

interface EpisodeGate {
  settled: boolean;
  reason: EpisodeGateReason;
  waiters: Array<(reason: EpisodeGateReason) => void>;
}

export function epKey(id: string, episode: number): string {
  return `${id}:${episode}`;
}

// Contexto de log por item/EP: solo provider/queue/ep, nunca URLs ni rutas.
export function queueFileContext(
  item: QueueItem,
  episode?: number,
): { provider?: string; queueId: string; episode?: number } {
  return {
    ...(item.providerId ? { provider: String(item.providerId) } : {}),
    queueId: item.id,
    ...(episode !== undefined ? { episode } : {}),
  };
}

export function ensureEpArrays(item: QueueItem): void {
  if (!Array.isArray(item.pausedEps)) item.pausedEps = [];
  if (!Array.isArray(item.cancelledEps)) item.cancelledEps = [];
}

export function pushUniqueEpisode(episodes: number[], episode: number): void {
  if (!episodes.includes(episode)) episodes.push(episode);
}

export function removeEpisode(episodes: number[], episode: number): void {
  const index = episodes.indexOf(episode);
  if (index >= 0) episodes.splice(index, 1);
}

export function removeFailureReason(item: QueueItem, episode: number): void {
  if (!item.failureReasons) return;
  delete item.failureReasons[String(episode)];
  if (Object.keys(item.failureReasons).length === 0) item.failureReasons = undefined;
}

export interface PauseControllerDeps {
  queueStore: QueueStore;
  attemptService: EpisodeDownloadAttemptService;
  pausedProgress?: PausedProgressSink;
  getDownloadSettings?: () => { allowContinue?: boolean } | undefined;
  buildEpisodePath: (item: QueueItem, episode: number) => string;
  writeHistory: (record: HistoryWriteRecord) => boolean;
  sendQueueUpdate: () => void;
  updateTray: (text?: string) => void;
  abortDownloadService: () => void;
  logger?: ScopedLogger;
}

// Pausa, reanudación y cancelación (total y por EP) de la cola: estado, aparcamiento de workers, abort y % congelado.
export class PauseController {
  private readonly cancelledIds = new Set<string>();
  private readonly pausedItemIds = new Set<string>();
  private readonly pausedEpisodesByItem = new Map<string, Set<number>>();
  private readonly cancelledEpisodesByItem = new Map<string, Set<number>>();
  private readonly activeEpisodeControllers = new Map<string, AbortController>();
  // Puertas de aparcamiento: el worker en pausa espera aquí tras liberar su
  // slot en el finally del coordinador; la puerta solo retiene el flujo.
  private readonly episodeGates = new Map<string, EpisodeGate>();
  private readonly parallelContexts = new Map<string, ParallelRunContext>();
  private activeQueueItemId: string | null = null;

  constructor(private readonly deps: PauseControllerDeps) {}

  private get fileLog(): ScopedLogger {
    return this.deps.logger ?? noopScopedLogger;
  }

  get activeItemId(): string | null {
    return this.activeQueueItemId;
  }

  setActiveItem(id: string | null): void {
    this.activeQueueItemId = id;
  }

  isCancelled(id: string): boolean {
    return this.cancelledIds.has(id);
  }

  clearCancelled(id: string): void {
    this.cancelledIds.delete(id);
  }

  isItemPaused(id: string): boolean {
    return this.pausedItemIds.has(id);
  }

  setItemPaused(id: string): void {
    this.pausedItemIds.add(id);
  }

  clearItemPaused(id: string): void {
    this.pausedItemIds.delete(id);
  }

  clearEpisodePaused(id: string, episode: number): void {
    this.pausedEpisodesByItem.get(id)?.delete(episode);
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

  private abortControllersForItem(id: string): void {
    for (const [key, controller] of Array.from(this.activeEpisodeControllers.entries())) {
      if (key === id || key.startsWith(`${id}:`)) {
        try {
          controller.abort();
        } catch {
          /* abortar es idempotente */
        }
      }
    }
  }

  beginEpisode(id: string, episode: number): AbortController {
    const controller = new AbortController();
    this.activeEpisodeControllers.set(epKey(id, episode), controller);
    this.activeQueueItemId = id;
    return controller;
  }

  endEpisode(id: string, episode: number): void {
    this.activeEpisodeControllers.delete(epKey(id, episode));
  }

  clearActiveItemIfIdle(): void {
    if (this.activeEpisodeControllers.size === 0) this.activeQueueItemId = null;
  }

  clearControllers(): void {
    this.activeEpisodeControllers.clear();
    this.activeQueueItemId = null;
  }

  hasEpisodeController(id: string, episode: number): boolean {
    return this.activeEpisodeControllers.has(epKey(id, episode));
  }

  hasEpisodeControllersFor(id: string): boolean {
    return Array.from(this.activeEpisodeControllers.keys()).some((key) => key.startsWith(`${id}:`));
  }

  abortEpisodeController(id: string, episode: number): void {
    const controller = this.activeEpisodeControllers.get(epKey(id, episode));
    if (controller) {
      try {
        controller.abort();
      } catch {
        /* abortar es idempotente */
      }
    }
  }

  deleteControllersForItem(id: string): void {
    for (const key of Array.from(this.activeEpisodeControllers.keys())) {
      if (key === id || key.startsWith(`${id}:`)) this.activeEpisodeControllers.delete(key);
    }
  }

  registerRunContext(id: string, context: ParallelRunContext): ParallelRunContext {
    this.parallelContexts.set(id, context);
    return context;
  }

  runContext(id: string): ParallelRunContext | undefined {
    return this.parallelContexts.get(id);
  }

  clearRunContext(id: string): void {
    this.parallelContexts.delete(id);
  }

  parkEpisode(id: string, episode: number): Promise<EpisodeGateReason> {
    // Si el item ya no existe (quitado de la cola), no aparcar: salir
    const alive = this.deps.queueStore.items.some((i) => i.id === id);
    if (!alive) return Promise.resolve('total');
    const key = epKey(id, episode);
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

  consumeSettledResume(id: string, episode: number): boolean {
    const key = epKey(id, episode);
    const gate = this.episodeGates.get(key);
    if (gate?.settled && gate.reason === 'resume') {
      this.episodeGates.delete(key);
      return true;
    }
    return false;
  }

  wakeItemGates(id: string, reason: EpisodeGateReason): void {
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

  snapshotPausedProgress(item: QueueItem): void {
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

  syncPersistedPause(item: QueueItem): void {
    const sink = this.deps.pausedProgress;
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

  // Suelo de display al reanudar: solo cuando hay resume real de bytes
  // (Mega con allowContinue). En el resto el EP reinicia de cero y la barra
  // debe mostrarlo en vez de quedarse clavada en el % congelado.
  // Con allowContinue=false todo reinicia de cero, sin suelo.
  frozenBaseline(item: QueueItem, episode: number, currentServer?: string): number {
    if (!this.shouldUseFrozenBaseline()) return 0;
    if (currentServer !== 'Mega') return 0;
    const entry = item.pausedEpSnapshot?.[String(episode)];
    if (!entry || entry.server !== 'Mega') return 0;
    const raw = entry.progress;
    return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
  }

  private shouldUseFrozenBaseline(): boolean {
    try {
      const raw = this.deps.getDownloadSettings?.()?.allowContinue;
      return raw !== false;
    } catch {
      return true;
    }
  }

  episodeInterrupted(item: QueueItem, episode: number): boolean {
    if (this.cancelledIds.has(item.id) || this.pausedItemIds.has(item.id)) return true;
    if (item.status === 'cancelled' || item.status === 'paused') return true;
    return (item.cancelledEps ?? []).includes(episode) || (item.pausedEps ?? []).includes(episode);
  }

  getWorkList(item: QueueItem, base: number[]): number[] {
    const cancelled = new Set<number>([
      ...(item.cancelledEps || []),
      ...(this.cancelledEpisodesByItem.get(item.id) || []),
    ]);
    const completed = new Set<number>(item.completedEps || []);
    return (base || []).filter((ep) => !completed.has(ep) && !cancelled.has(ep));
  }

  cancel(id: string): boolean {
    const item = this.deps.queueStore.items.find((queueItem) => queueItem.id === id);
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
    ensureEpArrays(item);
    item.pausedEps = [];
    if (item.pausedEpSnapshot) delete item.pausedEpSnapshot;
    try {
      this.deps.pausedProgress?.clear(id);
    } catch {
      /* best-effort */
    }
    try {
      (this.deps.attemptService as unknown as { forgetItem?: (itemId: string) => void }).forgetItem?.(id);
    } catch {
      /* limpieza best-effort */
    }
    this.fileLog.info(`Descarga cancelada por el usuario: ${item.animeTitle}`, queueFileContext(item));
    this.recordQueueCancellation(item);
    if (item.status === 'pending' || item.status === 'downloading' || item.status === 'paused') {
      item.status = 'cancelled';
      ensureEpArrays(item);
      this.deps.updateTray();
      this.deps.sendQueueUpdate();
    }

    if (id === this.activeQueueItemId) {
      this.abortControllersForItem(id);
      try {
        this.deps.attemptService.abortItem?.(id);
      } catch {
        /* compat */
      }
      this.deps.abortDownloadService();
    }
    // Purga best-effort de parciales no finalizados (preserva vídeos completos).
    void (async () => {
      try {
        const done = new Set<number>([...(item.completedEps || [])]);
        for (const ep of item.episodes || []) {
          if (done.has(ep)) continue;
          try {
            const dest = this.deps.buildEpisodePath(item, ep);
            await this.deps.attemptService.cleanEpisodeTemps(dest);
            await this.deps.attemptService.cleanEpisodeCacheForEpisode(dest);
          } catch {
            /* un EP no bloquea al resto */
          }
        }
      } catch {
        /* purga best-effort */
      }
    })();
    return true;
  }

  pause(id: string): boolean {
    const item = this.deps.queueStore.items.find((queueItem) => queueItem.id === id);
    if (!item) return false;
    if (item.status !== 'downloading' && item.status !== 'pending') return false;
    ensureEpArrays(item);
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
      this.deps.attemptService.abortItem?.(id);
    } catch {
      /* compat */
    }
    // Los workers aparcados individualmente salen con la pausa total
    this.wakeItemGates(id, 'total');
    this.snapshotPausedProgress(item);
    this.syncPersistedPause(item);
    this.fileLog.info(`Descarga pausada por el usuario: ${item.animeTitle}`, queueFileContext(item));
    this.deps.updateTray();
    this.deps.sendQueueUpdate();
    return true;
  }

  async cancelEpisode(id: string, episode: number): Promise<boolean> {
    const item = this.deps.queueStore.items.find((queueItem) => queueItem.id === id);
    if (!item || !Number.isInteger(episode)) return false;
    if (!(item.episodes || []).includes(episode)) return false;
    if (item.completedEps.includes(episode)) return false;
    if (item.status === 'done' || item.status === 'failed' || item.status === 'cancelled') return false;
    ensureEpArrays(item);
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
    const key = epKey(id, episode);
    // Si el worker está aparcado, lo despierta: finaliza cancelled y libera el slot
    this.settleGate(key, 'cancel');
    const controller = this.activeEpisodeControllers.get(key);
    if (controller) {
      try {
        controller.abort();
      } catch {
        /* abortar es idempotente */
      }
    }
    try {
      this.deps.attemptService.abortEpisode?.(id, episode);
    } catch {
      /* compat */
    }
    // Limpieza solo de este EP (preserva parciales de otros)
    try {
      const dest = this.deps.buildEpisodePath(item, episode);
      await this.deps.attemptService.cleanEpisodeTemps(dest);
      await this.deps.attemptService.cleanEpisodeCacheForEpisode(dest);
    } catch {
      /* limpieza best-effort */
    }
    this.fileLog.info(`EP ${episode} cancelado por el usuario`, queueFileContext(item, episode));
    this.syncPersistedPause(item);
    this.deps.sendQueueUpdate();
    return true;
  }

  pauseEpisode(id: string, episode: number): boolean {
    const item = this.deps.queueStore.items.find((queueItem) => queueItem.id === id);
    if (!item || !Number.isInteger(episode)) return false;
    if (!(item.episodes || []).includes(episode)) return false;
    if (item.completedEps.includes(episode) || item.failedEps.includes(episode)) return false;
    if (item.status !== 'downloading' && item.status !== 'pending') return false;
    ensureEpArrays(item);
    if ((item.cancelledEps || []).includes(episode)) return false;
    if ((item.pausedEps || []).includes(episode)) return true;
    this.getPausedSet(id).add(episode);
    item.pausedEps!.push(episode);
    // Puerta fresca: descarta veredictos rancios de pausas anteriores
    this.episodeGates.delete(epKey(id, episode));
    // Snapshot del % congelado (los mapas aún tienen los últimos valores)
    this.snapshotPausedProgress(item);
    this.syncPersistedPause(item);
    const key = epKey(id, episode);
    const controller = this.activeEpisodeControllers.get(key);
    if (controller) {
      try {
        controller.abort();
      } catch {
        /* abortar es idempotente */
      }
    }
    try {
      this.deps.attemptService.abortEpisode?.(id, episode);
    } catch {
      /* compat */
    }
    // Pausa conserva parciales en disco, no limpia
    this.fileLog.info(`EP ${episode} pausado por el usuario`, queueFileContext(item, episode));
    this.deps.sendQueueUpdate();
    return true;
  }

  resumeEpisode(id: string, episode: number): boolean {
    const item = this.deps.queueStore.items.find((queueItem) => queueItem.id === id);
    if (!item || !Number.isInteger(episode)) return false;
    ensureEpArrays(item);
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
    // Despierta al worker aparcado: reintenta su EP desde cero salvo Mega,
    // que retoma sus parciales.
    this.settleGate(epKey(id, episode), 'resume');
    this.syncPersistedPause(item);
    this.fileLog.info(`EP ${episode} reanudado por el usuario`, queueFileContext(item, episode));
    this.deps.sendQueueUpdate();
    return true;
  }

  resume(id: string): boolean {
    const item = this.deps.queueStore.items.find((queueItem) => queueItem.id === id);
    if (!item || item.status !== 'paused') return false;
    ensureEpArrays(item);
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
      this.deps.pausedProgress?.clear(id);
    } catch {
      /* best-effort */
    }
    item.status = 'pending';
    this.fileLog.info(`Descarga reanudada por el usuario: ${item.animeTitle}`, queueFileContext(item));
    this.deps.sendQueueUpdate();
    return true;
  }

  private recordQueueCancellation(item: QueueItem): void {
    this.deps.writeHistory({
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

  notifyItemsRemoved(removedIds: string[]): void {
    for (const id of removedIds) {
      this.cancelledIds.delete(id);
      this.pausedItemIds.delete(id);
      this.pausedEpisodesByItem.delete(id);
      this.cancelledEpisodesByItem.delete(id);
      // Sin esto, un worker aparcado cuelga processQueue para siempre
      this.wakeItemGates(id, 'total');
      this.parallelContexts.delete(id);
      // Abort antes de soltar handles: evita workers huérfanos en AttemptService.
      this.abortControllersForItem(id);
      try {
        this.deps.attemptService.abortItem?.(id);
      } catch {
        /* compat */
      }
      this.deleteControllersForItem(id);
      try {
        (this.deps.attemptService as unknown as { forgetItem?: (itemId: string) => void }).forgetItem?.(id);
      } catch {
        /* limpieza best-effort */
      }
      try {
        this.deps.pausedProgress?.clear(id);
      } catch {
        /* best-effort */
      }
    }
    this.cleanupStaleIds();
  }

  /** Limpia ids de items que ya no existen o son terminales */
  cleanupStaleIds(): void {
    const forget = (id: string): void => {
      try {
        (this.deps.attemptService as unknown as { forgetItem?: (itemId: string) => void }).forgetItem?.(id);
      } catch {
        /* limpieza best-effort */
      }
    };
    for (const id of Array.from(this.cancelledIds)) {
      const exists = this.deps.queueStore.items.some((i) => i.id === id);
      if (!exists) {
        this.cancelledIds.delete(id);
        forget(id);
      }
    }
    for (const id of Array.from(this.pausedItemIds)) {
      const exists = this.deps.queueStore.items.some((i) => i.id === id);
      if (!exists) {
        this.pausedItemIds.delete(id);
        forget(id);
      }
    }
    for (const id of Array.from(this.pausedEpisodesByItem.keys())) {
      const exists = this.deps.queueStore.items.some((i) => i.id === id);
      if (!exists) {
        this.pausedEpisodesByItem.delete(id);
        forget(id);
      }
    }
    for (const id of Array.from(this.cancelledEpisodesByItem.keys())) {
      const exists = this.deps.queueStore.items.some((i) => i.id === id);
      if (!exists) {
        this.cancelledEpisodesByItem.delete(id);
        forget(id);
      }
    }
  }
}
