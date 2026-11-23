import { dialog } from 'electron';
import { isEpisodeNumber } from '../../../utils/episodeNumber';
import { EPISODE_AVAILABILITY_CONCURRENCY } from '../../../utils/episodeAvailabilityScan';
import { handleIpc } from '../ipcGuard';
import axios from 'axios';
import { ok, fail } from '../../../types/api';
import { USER_AGENT } from '../../../utils/windowUtils';
import { safeErrorMessage } from '../../../utils/logging/redactLog';
import { assertAllowedImageRedirect, isAllowedImageUrl } from '../../../utils/security/networkSecurity';
import { JkAnimeProvider } from '../../../services/providers/JkAnimeProvider';
import type { CatalogFilters, EpisodeAvailability } from '../../../types/anime';
import type { IpcRegistryDependencies } from '../../IpcRegistry';
import { parseProviderAnimeUrl } from '../../../utils/security/externalUrl';

export function registerCatalogHandlers({
  providerGateway,
  homeFeedService,
  scheduleService,
  getAnimeDetailsBySlug,
  writeGlobalLog,
}: IpcRegistryDependencies): void {
  const availabilityRuns = new Map<number, Map<string, { controller: AbortController; size: number }>>();
  const resolveProvider = (id: unknown) => {
    const key = typeof id === 'string' ? id.trim() : '';
    if (!key) return providerGateway.activeProvider;
    return (
      providerGateway.getProvider(key) ??
      providerGateway.getProvider(key.toLowerCase()) ??
      providerGateway.activeProvider
    );
  };
  handleIpc('get-image-base64', async (_, url: string) => {
    try {
      if (!url || !isAllowedImageUrl(url)) return ok(null);
      const response = await axios.get(url, {
        headers: { 'User-Agent': USER_AGENT, Referer: 'https://animeav1.com/' },
        responseType: 'arraybuffer',
        timeout: 5000,
        maxContentLength: 5 * 1024 * 1024,
        maxBodyLength: 5 * 1024 * 1024,
        maxRedirects: 3,
        beforeRedirect: assertAllowedImageRedirect,
      });
      const contentTypeRaw = String(response.headers['content-type'] || '').toLowerCase();
      const mime = contentTypeRaw.split(';')[0].trim();
      const allowedMime = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
      if (!allowedMime.has(mime)) return ok(null);
      if (mime === 'image/svg+xml' || contentTypeRaw.includes('svg')) return ok(null);
      const buffer = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data);
      if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) return ok(null);
      const isValidMagic = (() => {
        if (mime === 'image/jpeg' || mime === 'image/jpg') {
          return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
        }
        if (mime === 'image/png') {
          return (
            buffer.length >= 8 &&
            buffer[0] === 0x89 &&
            buffer[1] === 0x50 &&
            buffer[2] === 0x4e &&
            buffer[3] === 0x47 &&
            buffer[4] === 0x0d &&
            buffer[5] === 0x0a &&
            buffer[6] === 0x1a &&
            buffer[7] === 0x0a
          );
        }
        if (mime === 'image/gif') {
          return (
            buffer.length >= 6 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38
          );
        }
        if (mime === 'image/webp') {
          return (
            buffer.length >= 12 &&
            buffer[0] === 0x52 &&
            buffer[1] === 0x49 &&
            buffer[2] === 0x46 &&
            buffer[3] === 0x46 &&
            buffer[8] === 0x57 &&
            buffer[9] === 0x45 &&
            buffer[10] === 0x42 &&
            buffer[11] === 0x50
          );
        }
        if (mime === 'image/avif') {
          if (buffer.length < 12) return false;
          if (buffer[4] !== 0x66 || buffer[5] !== 0x74 || buffer[6] !== 0x79 || buffer[7] !== 0x70) return false;
          const brand = buffer.subarray(8, 12).toString('ascii');
          return (
            brand === 'avif' ||
            brand === 'avis' ||
            brand === 'av01' ||
            buffer.subarray(8, 12).toString().includes('avif')
          );
        }
        return false;
      })();
      if (!isValidMagic) return ok(null);
      const base64 = buffer.toString('base64');
      return ok(`data:${mime};base64,${base64}`);
    } catch {
      return ok(null);
    }
  });

  handleIpc(
    'get-home-data',
    async (_, payload?: boolean | { force?: boolean; mediaFilter?: string; provider?: string }) => {
      try {
        const force = typeof payload === 'boolean' ? payload : !!payload?.force;
        const providerId =
          payload && typeof payload === 'object' && typeof payload.provider === 'string' ? payload.provider : undefined;
        return ok(await homeFeedService.getHomeFeed('anime', 30, force, providerId));
      } catch (error) {
        writeGlobalLog(`Home error: ${safeErrorMessage(error)}`);
        return ok(null);
      }
    },
  );

  handleIpc('get-schedule', async (_, payload?: { force?: boolean; provider?: string }) => {
    try {
      return ok(await scheduleService.getSchedule(!!payload?.force, payload?.provider));
    } catch (error) {
      writeGlobalLog(`Schedule error: ${safeErrorMessage(error)}`);
      return ok(null);
    }
  });

  handleIpc('get-catalog', async (_, filters: CatalogFilters & { provider?: string } = {}, force = false) => {
    try {
      const { provider: requestedProvider, ...catalogFilters } = filters || {};
      return ok(
        await resolveProvider(requestedProvider).getCatalog(
          {
            page: catalogFilters?.page || 1,
            search: catalogFilters?.search || '',
            genre: Array.isArray(catalogFilters?.genre) ? catalogFilters.genre.filter(Boolean) : [],
            status: catalogFilters?.status || '',
            category: catalogFilters?.category || '',
            order: catalogFilters?.order ?? '',
            minYear: catalogFilters?.minYear || null,
            maxYear: catalogFilters?.maxYear || null,
            year: catalogFilters?.year || '',
            letter: catalogFilters?.letter || '',
            demographic: catalogFilters?.demographic || '',
            type: catalogFilters?.type || '',
            season: catalogFilters?.season || '',
            orderDir: catalogFilters?.orderDir ?? '',
          },
          force,
        ),
      );
    } catch (error) {
      writeGlobalLog(`Catalog error: ${safeErrorMessage(error)}`);
      return ok([]);
    }
  });

  handleIpc('get-filters-data', async (_, payload: boolean | { force?: boolean; provider?: string } = false) => {
    try {
      const force = typeof payload === 'boolean' ? payload : !!payload?.force;
      const providerId =
        payload && typeof payload === 'object' && typeof payload.provider === 'string' ? payload.provider : undefined;
      return ok(await resolveProvider(providerId).getFiltersData(force));
    } catch (error) {
      writeGlobalLog(`Filters error: ${safeErrorMessage(error)}`);
      return ok({ categories: [], genres: [], years: [] });
    }
  });

  handleIpc('search-anime', async (_, payload: string | { query?: string; provider?: string }) => {
    try {
      const query = typeof payload === 'string' ? payload : String(payload?.query ?? '');
      const providerId =
        payload && typeof payload === 'object' && typeof payload.provider === 'string' ? payload.provider : undefined;
      if (/^https?:\/\//i.test(query)) {
        const provider = resolveProvider(providerId);
        const slug = parseProviderAnimeUrl(query.trim(), provider.id);
        if (!slug) return fail('SEARCH_INVALID_URL', 'Pega una URL de ficha del proveedor elegido.');
        const details = await provider.getDetails(slug);
        if (!details) return fail('SEARCH_FAILED', 'No se pudo consultar la ficha del proveedor.');
        return ok([
          {
            id: details.id,
            slug,
            title: details.title,
            poster: details.poster,
            year: details.year,
            category: details.category,
          },
        ]);
      }
      return ok(await resolveProvider(providerId).search(query, { strict: true }));
    } catch (error) {
      writeGlobalLog(`Search error: ${safeErrorMessage(error)}`);
      return fail('SEARCH_FAILED', 'No se pudo consultar el proveedor. Inténtalo de nuevo.');
    }
  });

  handleIpc('get-details', async (_, payload: string | { slug?: string; provider?: string }) => {
    try {
      const slug = typeof payload === 'string' ? payload : String(payload?.slug ?? '');
      const providerId =
        payload && typeof payload === 'object' && typeof payload.provider === 'string'
          ? (payload.provider as string)
          : undefined;
      return ok(await getAnimeDetailsBySlug(slug, providerId as 'animeav1' | 'jkanime' | undefined));
    } catch (error: unknown) {
      const message = safeErrorMessage(error);
      writeGlobalLog(
        `get-details handler error (${String((payload as { slug?: string })?.slug ?? payload)}): ${message}`,
      );
      return ok(null);
    }
  });

  handleIpc(
    'get-episode-thumbs',
    async (_, payload: { slug?: string; fromEp?: number; toEp?: number; provider?: string }) => {
      try {
        const slug = String(payload?.slug ?? '').trim();
        if (!slug) return ok({});
        const provider = resolveProvider(payload?.provider);
        if (!(provider instanceof JkAnimeProvider)) return ok({});
        return ok(await provider.getEpisodeThumbs(slug, Number(payload?.fromEp), Number(payload?.toEp)));
      } catch (error: unknown) {
        writeGlobalLog(`get-episode-thumbs handler error: ${safeErrorMessage(error)}`);
        return ok({});
      }
    },
  );

  handleIpc(
    'get-episode-availability',
    async (
      event,
      payload: {
        provider?: string;
        slug?: string;
        episodes?: number[];
        lang?: string;
        requestId?: string;
      },
    ) => {
      if (
        payload?.provider !== 'animeav1' ||
        payload.lang !== 'DUB' ||
        typeof payload.slug !== 'string' ||
        !/^[a-z0-9][a-z0-9-]{0,199}$/i.test(payload.slug) ||
        !Array.isArray(payload.episodes) ||
        payload.episodes.length === 0 ||
        payload.episodes.length > EPISODE_AVAILABILITY_CONCURRENCY ||
        !payload.episodes.every((ep) => isEpisodeNumber(ep) && ep > 0 && ep <= 100_000) ||
        typeof payload.requestId !== 'string' ||
        !/^[a-z0-9-]{1,100}$/i.test(payload.requestId)
      ) {
        return fail('INVALID_INPUT', 'La consulta de doblaje no es válida.');
      }
      const provider = providerGateway.getProvider(payload.provider);
      if (!provider?.getEpisodeAvailability) return ok(null);
      const sender = event.sender;
      if (sender.isDestroyed?.()) return ok(null);
      const senderId: number = sender.id;
      const episodes = [...new Set(payload.episodes)];
      const runs = availabilityRuns.get(senderId) ?? new Map();
      const occupied = [...runs.values()].reduce(
        (count, run) => count + (run.controller.signal.aborted ? 0 : run.size),
        0,
      );
      if (runs.has(payload.requestId) || occupied + episodes.length > EPISODE_AVAILABILITY_CONCURRENCY) {
        return fail('AVAILABILITY_BUSY', 'Ya hay comprobaciones de doblaje en curso.');
      }
      const run = { controller: new AbortController(), size: episodes.length };
      runs.set(payload.requestId, run);
      availabilityRuns.set(senderId, runs);
      const abort = () => run.controller.abort();
      sender.once('destroyed', abort);
      try {
        const result: Record<number, EpisodeAvailability> = {};
        await Promise.all(
          episodes.map(async (ep) => {
            result[ep] = await provider.getEpisodeAvailability!(payload.slug!, ep, 'DUB', run.controller.signal);
          }),
        );
        return ok(run.controller.signal.aborted ? null : result);
      } finally {
        sender.removeListener('destroyed', abort);
        runs.delete(payload.requestId);
        if (runs.size === 0) availabilityRuns.delete(senderId);
      }
    },
  );

  handleIpc('cancel-episode-availability', (event, requestId: unknown) => {
    if (typeof requestId === 'string') availabilityRuns.get(event.sender.id)?.get(requestId)?.controller.abort();
    return ok(null);
  });

  handleIpc('select-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return ok(result.filePaths[0] ?? null);
  });

  handleIpc('search-trailer-id', async (_, payload: string | { title?: string; slug?: string; mediaId?: number }) => {
    try {
      const animeTitle = typeof payload === 'string' ? payload : String(payload?.title || '').trim();
      const query = encodeURIComponent(`${animeTitle} trailer oficial anime pv`);
      const url = `https://www.youtube.com/results?search_query=${query}&sp=EgIQAQ%253D%253D`;
      const response = await axios.get(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        },
        timeout: 10000,
        maxRedirects: 3,
        maxContentLength: 2 * 1024 * 1024,
      });
      const html = response.data;
      const regex = /"videoRenderer":\{"videoId":"([^"]+)"/g;
      const matches = [...html.matchAll(regex)];
      if (matches.length > 0) return ok(matches[0][1]);
      const simpleMatch = html.match(/"videoId":"([^"]+)"/);
      return ok(simpleMatch ? simpleMatch[1] : null);
    } catch (error) {
      writeGlobalLog(error);
      return ok(null);
    }
  });
}
