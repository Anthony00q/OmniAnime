import { dialog, ipcMain } from 'electron';
import axios from 'axios';
import { USER_AGENT } from '../../../utils/windowUtils';
import { assertAllowedImageRedirect, isAllowedImageUrl } from '../../../utils/networkSecurity';
import { JkAnimeProvider } from '../../../services/providers/JkAnimeProvider';
import type { CatalogFilters } from '../../../types/anime';
import type { IpcRegistryDependencies } from '../../IpcRegistry';

export function registerCatalogHandlers({
  providerGateway,
  homeFeedService,
  getAnimeDetailsBySlug,
  writeGlobalLog,
}: IpcRegistryDependencies): void {
  const resolveProvider = (id: unknown) => {
    const key = typeof id === 'string' ? id.trim() : '';
    if (!key) return providerGateway.activeProvider;
    return (
      providerGateway.getProvider(key) ??
      providerGateway.getProvider(key.toLowerCase()) ??
      providerGateway.activeProvider
    );
  };
  ipcMain.handle('get-image-base64', async (_, url: string): Promise<string | null> => {
    try {
      if (!url || !isAllowedImageUrl(url)) return null;
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
      if (!allowedMime.has(mime)) return null;
      if (mime === 'image/svg+xml' || contentTypeRaw.includes('svg')) return null;
      const buffer = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data);
      if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) return null;
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
      if (!isValidMagic) return null;
      const base64 = buffer.toString('base64');
      return `data:${mime};base64,${base64}`;
    } catch {
      return null;
    }
  });

  ipcMain.handle(
    'get-home-data',
    async (_, payload?: boolean | { force?: boolean; mediaFilter?: string; provider?: string }) => {
      try {
        const force = typeof payload === 'boolean' ? payload : !!payload?.force;
        const providerId =
          payload && typeof payload === 'object' && typeof payload.provider === 'string' ? payload.provider : undefined;
        return await homeFeedService.getHomeFeed('anime', 30, force, providerId);
      } catch (error) {
        writeGlobalLog(`Home error: ${error}`);
        return [];
      }
    },
  );

  ipcMain.handle('get-catalog', async (_, filters: CatalogFilters & { provider?: string } = {}, force = false) => {
    try {
      const { provider: requestedProvider, ...catalogFilters } = filters || {};
      return await resolveProvider(requestedProvider).getCatalog(
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
      );
    } catch (error) {
      writeGlobalLog(`Catalog error: ${error}`);
      return [];
    }
  });

  ipcMain.handle('get-filters-data', async (_, payload: boolean | { force?: boolean; provider?: string } = false) => {
    try {
      const force = typeof payload === 'boolean' ? payload : !!payload?.force;
      const providerId =
        payload && typeof payload === 'object' && typeof payload.provider === 'string' ? payload.provider : undefined;
      return await resolveProvider(providerId).getFiltersData(force);
    } catch (error) {
      writeGlobalLog(`Filters error: ${error}`);
      return { categories: [], genres: [], years: [] };
    }
  });

  ipcMain.handle('search-anime', async (_, payload: string | { query?: string; provider?: string }) => {
    try {
      const query = typeof payload === 'string' ? payload : String(payload?.query ?? '');
      const providerId =
        payload && typeof payload === 'object' && typeof payload.provider === 'string' ? payload.provider : undefined;
      return await resolveProvider(providerId).search(query);
    } catch (error) {
      writeGlobalLog(`Search error: ${error}`);
      return [];
    }
  });

  ipcMain.handle('get-details', async (_, payload: string | { slug?: string; provider?: string }) => {
    try {
      const slug = typeof payload === 'string' ? payload : String(payload?.slug ?? '');
      const providerId =
        payload && typeof payload === 'object' && typeof payload.provider === 'string'
          ? (payload.provider as string)
          : undefined;
      return await getAnimeDetailsBySlug(slug, providerId as 'animeav1' | 'jkanime' | undefined);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      writeGlobalLog(
        `get-details handler error (${String((payload as { slug?: string })?.slug ?? payload)}): ${message}`,
      );
      return null;
    }
  });

  ipcMain.handle(
    'get-episode-thumbs',
    async (_, payload: { slug?: string; fromEp?: number; toEp?: number; provider?: string }) => {
      try {
        const slug = String(payload?.slug ?? '').trim();
        if (!slug) return {};
        const provider = resolveProvider(payload?.provider);
        if (!(provider instanceof JkAnimeProvider)) return {};
        return await provider.getEpisodeThumbs(slug, Number(payload?.fromEp), Number(payload?.toEp));
      } catch (error: unknown) {
        writeGlobalLog(`get-episode-thumbs handler error: ${error instanceof Error ? error.message : String(error)}`);
        return {};
      }
    },
  );

  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.filePaths[0];
  });

  ipcMain.handle(
    'search-trailer-id',
    async (_, payload: string | { title?: string; slug?: string; mediaId?: number }) => {
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
        if (matches.length > 0) return matches[0][1];
        const simpleMatch = html.match(/"videoId":"([^"]+)"/);
        return simpleMatch ? simpleMatch[1] : null;
      } catch (error) {
        writeGlobalLog(error);
        return null;
      }
    },
  );
}
