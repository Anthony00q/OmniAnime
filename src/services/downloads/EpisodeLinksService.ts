import type { DownloadLink } from '../../types/anime';
import type { DownloadProvider, ProviderDownloadLink, QueueItem } from '../../types/queue';
import {
  effectiveServerOrder,
  getServerPriorityOrder as getServerPriorityOrderFallback,
  isBlockedServer,
  normalizeServerName,
} from '../../utils/serverUtils';

export interface EpisodeLinksProviderPort {
  getLinks(slug: string, episode: number, lang?: string, signal?: AbortSignal): Promise<DownloadLink[]>;
}

export interface EpisodeLinksServerOrderSettings {
  serverOrderAnimeav1?: string[];
  serverOrderJkanime?: string[];
}

export interface EpisodeLinksServiceOptions {
  getProviderById: (providerId: string) => EpisodeLinksProviderPort | undefined;
  getActiveProvider: () => EpisodeLinksProviderPort;
  getActiveProviderId: () => string;
  getServerOrderSettings: () => EpisodeLinksServerOrderSettings | null | undefined;
  recordFound: (provider: string, server: string) => void;
  recordAllowlisted: (provider: string, server: string) => void;
  log: (message: string, level: 'info' | 'success' | 'error' | 'warn') => void;
}

export class EpisodeLinksService {
  constructor(private readonly options: EpisodeLinksServiceOptions) {}

  getServerPriorityOrder(providerId?: string): string[] {
    try {
      const stored = this.options.getServerOrderSettings();
      return effectiveServerOrder(providerId, {
        animeav1: stored?.serverOrderAnimeav1,
        jkanime: stored?.serverOrderJkanime,
      });
    } catch {
      return getServerPriorityOrderFallback(providerId);
    }
  }

  async getEpisodeLinks(item: QueueItem, ep: number, signal?: AbortSignal): Promise<ProviderDownloadLink[]> {
    const slug = String(item.downloadSlug || item.slug || '').trim();
    // DUB desactivado: solo SUB
    const lang = item.lang === 'DUB' ? 'SUB' : item.lang || 'SUB';
    if (!slug || signal?.aborted) return [];

    // Usa providerId del QueueItem, no el activo global.
    const targetProviderId = (item.providerId || this.options.getActiveProviderId()) as DownloadProvider;
    const order = this.getServerPriorityOrder(targetProviderId);
    const provider = this.options.getProviderById(targetProviderId) || this.options.getActiveProvider();
    this.options.log(`EP ${ep}: buscando servidores en ${targetProviderId}...`, 'info');

    const providerLinks: ProviderDownloadLink[] = [];
    const dedupe = new Set<string>();
    const allowedServers = new Set(this.getAllowedServersForProvider(targetProviderId, order));
    const rows = await provider.getLinks(slug, ep, lang, signal).catch(() => []);
    if (signal?.aborted) return [];

    for (const l of rows) {
      const rawName = String(l.server || '').trim() || '?';
      this.traceServerStage(ep, targetProviderId, rawName, 'found');
      this.options.recordFound(targetProviderId, rawName);
      const canonicalServer = normalizeServerName(l.server);
      if (canonicalServer !== rawName) {
        this.traceServerStage(ep, targetProviderId, `${rawName}->${canonicalServer}`, 'normalized');
      }
      if (!l.url) {
        this.traceServerStage(ep, targetProviderId, canonicalServer, 'blocked:empty-url');
        continue;
      }
      if (isBlockedServer(canonicalServer)) {
        this.traceServerStage(ep, targetProviderId, canonicalServer, 'blocked:security');
        continue;
      }
      if (!allowedServers.has(canonicalServer)) {
        this.traceServerStage(ep, targetProviderId, canonicalServer, 'blocked:allowlist');
        continue;
      }

      const key = `${slug}|${ep}|${canonicalServer.toLowerCase()}|${l.url}`;
      if (dedupe.has(key)) {
        this.traceServerStage(ep, targetProviderId, canonicalServer, 'deduplicated');
        continue;
      }
      dedupe.add(key);
      this.traceServerStage(ep, targetProviderId, canonicalServer, 'allowlisted');
      this.options.recordAllowlisted(targetProviderId, canonicalServer);

      providerLinks.push({
        server: canonicalServer,
        url: l.url,
        provider: targetProviderId,
        canonicalServer,
        sourceSlug: slug,
        sourceEpisode: ep,
      });
    }

    if (providerLinks.length > 0) {
      const names = Array.from(new Set(providerLinks.map((link) => link.canonicalServer)));
      this.options.log(
        `EP ${ep}: en ${targetProviderId} se encontraron ${providerLinks.length} servidor(es): ${names.join(', ')}`,
        'info',
      );
      return providerLinks;
    }

    this.options.log(`EP ${ep}: en ${targetProviderId} no se encontró servidor disponible.`, 'warn');
    return [];
  }

  private getAllowedServersForProvider(_provider: DownloadProvider, order: string[]): string[] {
    return [...order];
  }

  // Traza diagnóstica por servidor (found/normalized/blocked/deduplicated/
  // allowlisted). Solo activa con OMNIANIME_SERVER_TRACE=1; nunca loguea URLs.
  private traceServerStage(ep: number, providerId: string, server: string, stage: string): void {
    if (process.env.OMNIANIME_SERVER_TRACE !== '1') return;
    this.options.log(`[server-trace] EP ${ep} ${providerId} ${server} ${stage}`, 'info');
  }
}
