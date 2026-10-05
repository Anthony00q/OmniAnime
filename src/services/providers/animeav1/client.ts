import * as http from 'http';
import * as https from 'https';
import { createOutboundClient, type OutboundClient, type OutboundPolicy } from '../../../utils/security/outboundPolicy';
import type { CatalogFilters } from '../../../types/anime';

export const AV1_BASE_URL = 'https://animeav1.com';
const AV1_OUTBOUND_POLICY: OutboundPolicy = { allowedHosts: ['animeav1.com'], allowLoopback: false };
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const MAX_HTML_BYTES = 5 * 1024 * 1024;

export function createAv1Client(): OutboundClient {
  return createOutboundClient(
    {
      headers: { 'User-Agent': USER_AGENT },
      timeout: 10000,
      maxRedirects: 3,
      maxContentLength: MAX_HTML_BYTES,
      maxBodyLength: MAX_HTML_BYTES,
      httpAgent: new http.Agent({ keepAlive: true, maxSockets: 32 }),
      httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 32 }),
    },
    AV1_OUTBOUND_POLICY,
  );
}

export function av1ScheduleUrl(): string {
  return `${AV1_BASE_URL}/horario`;
}

export function av1CatalogUrl(filters: CatalogFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.page) params.append('page', filters.page.toString());
  if (filters.order) params.append('order', filters.order);
  if (filters.status) params.append('status', filters.status);
  if (filters.category) params.append('category', filters.category);
  if (filters.minYear) params.append('minYear', filters.minYear.toString());
  if (filters.maxYear) params.append('maxYear', filters.maxYear.toString());
  if (filters.search) params.append('search', filters.search);
  if (filters.letter) params.append('letter', filters.letter);
  if (filters.genre && filters.genre.length > 0) {
    filters.genre.forEach((g: string) => params.append('genre', g));
  }
  return `${AV1_BASE_URL}/catalogo?${params.toString()}`;
}

export function av1CatalogPageUrl(): string {
  return `${AV1_BASE_URL}/catalogo`;
}

export function av1SearchUrl(query: string): string {
  return `${AV1_BASE_URL}/catalogo?search=${encodeURIComponent(query)}`;
}

export function av1MediaUrl(slug: string): string {
  return `${AV1_BASE_URL}/media/${slug}`;
}

export function av1EpisodeUrl(slug: string, episode: number): string {
  return `${AV1_BASE_URL}/media/${slug}/${episode}`;
}

export function av1CoverUrl(id: string): string {
  return `https://cdn.animeav1.com/covers/${id}.jpg`;
}
