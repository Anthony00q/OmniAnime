import type { QueueItem } from '../../types/queue';
import type { FallbackAttemptPort } from './DownloadCoordinator';
import type { EpisodeDownloadAttemptService } from './EpisodeDownloadAttemptService';

// Tope de EPs-INTENTO simultáneos contra el mismo servidor (NO de conexiones):
// con 3 EPs en paralelo, como mucho 2 descargan del mismo host a la vez y el
// tercero espera un hueco en vez de saturarlo. La concurrencia de streams por
// intento es otro nivel (AttemptConcurrencyHandle) y aquí no se contabiliza.
export const MAX_CONCURRENT_PER_SERVER = 2;
export const SERVER_SLOT_POLL_MS = 200;

export interface SlotSchedulerDeps {
  attemptService: EpisodeDownloadAttemptService;
  // La interrupción (pausa/cancel) corta la espera de hueco en vez de seguir
  // sondeando; con slot libre el intento se lanza igual.
  isEpisodeInterrupted: (item: QueueItem, episode: number) => boolean;
}

export class SlotScheduler {
  // Slots vivos por servidor (itemId|server). Cuenta EPs, no conexiones.
  private readonly activeServerCounts = new Map<string, number>();

  constructor(private readonly deps: SlotSchedulerDeps) {}

  serverSlotKey(id: string, server: string): string {
    return `${id}|${server}`;
  }

  async acquireServerSlot(item: QueueItem, episode: number, server: string, signal: AbortSignal): Promise<boolean> {
    const key = this.serverSlotKey(item.id, server);
    for (;;) {
      const used = this.activeServerCounts.get(key) ?? 0;
      if (used < MAX_CONCURRENT_PER_SERVER) {
        this.activeServerCounts.set(key, used + 1);
        return true;
      }
      if (signal.aborted || this.deps.isEpisodeInterrupted(item, episode)) return false;
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

  // Un intento = un engine, con el slot del servidor retenido mientras el mismo
  // host sigue siendo candidato: cambiar de servidor libera el hueco anterior y
  // retiene el nuevo en el mismo paso. Sin slot (abort/pausa) no se intenta nada
  // y el fallback del coordinador se detiene en silencio.
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
        const result = await this.deps.attemptService.attempt(
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
}
