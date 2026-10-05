import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import * as http from 'http';
import * as https from 'https';
import { createOutboundClient, type OutboundPolicy } from '../../../utils/security/outboundPolicy';
import { normalizeAllowedImageUrl } from '../../../utils/security/networkSecurity';

export const JK_BASE_URL = 'https://jkanime.net';

const JK_OUTBOUND_POLICY: OutboundPolicy = { allowedHosts: ['jkanime.net'], allowLoopback: false };

const MAX_HTML_BYTES = 5 * 1024 * 1024;

export interface JkHttpClient {
  get<T = any>(url: string, extra?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
  post<T = any>(url: string, data?: unknown, extra?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
}

export function createJkHttpClient(): JkHttpClient {
  const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 32 });
  const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 32 });
  const requestConfig = (extra: AxiosRequestConfig = {}): AxiosRequestConfig => ({
    timeout: 10_000,
    maxRedirects: 3,
    maxContentLength: MAX_HTML_BYTES,
    maxBodyLength: MAX_HTML_BYTES,
    httpAgent,
    httpsAgent,
    ...extra,
  });
  const client = createOutboundClient({}, JK_OUTBOUND_POLICY);
  return {
    get: (url, extra) => client.get(url, requestConfig(extra)),
    post: (url, data, extra) => client.post(url, data, requestConfig(extra)),
  };
}

export function jkImageUrl(rawUrl: string): string {
  return normalizeAllowedImageUrl(rawUrl, `${JK_BASE_URL}/`);
}

// Primera cookie de cada Set-Cookie (el resto son atributos de sesión).
export function setCookieHeader(headers: Record<string, any>): string {
  const cookies = headers['set-cookie'];
  return cookies ? cookies.map((c: string) => c.split(';')[0]).join('; ') : '';
}

export function jkHomeUrl(): string {
  return JK_BASE_URL;
}

export function jkScheduleUrl(): string {
  return `${JK_BASE_URL}/horario`;
}

export function jkAnimePageUrl(slug: string): string {
  return `${JK_BASE_URL}/${slug}/`;
}

export function jkEpisodePageUrl(slug: string, episode: number): string {
  return `${JK_BASE_URL}/${slug}/${episode}/`;
}

export function jkSearchUrl(query: string): string {
  const safeQuery = encodeURIComponent(query.replace(/ /g, '_'));
  return `${JK_BASE_URL}/buscar/${safeQuery}/`;
}

export function jkDirectoryUrl(): string {
  return `${JK_BASE_URL}/directorio/`;
}

export function jkDirectoryResultsUrl(filters: Record<string, any>): string {
  const params = new URLSearchParams();
  params.set('p', String(filters.page || 1));

  if (filters.genre && filters.genre.length > 0) params.append('genero', filters.genre[0]);
  if (filters.category) params.append('categoria', filters.category);
  if (filters.status) params.append('estado', filters.status);
  // El parámetro del año es 'fecha'
  if (filters.year) params.append('fecha', filters.year);
  else if (filters.maxYear) params.append('fecha', filters.maxYear);

  if (filters.letter) params.append('letra', filters.letter);
  if (filters.demographic) params.append('demografia', filters.demographic);
  if (filters.type) params.append('tipo', filters.type);
  if (filters.season) params.append('temporada', filters.season);

  // 'filtro' vacío = por fecha (por defecto)
  if (filters.order !== undefined && filters.order !== '') {
    params.append('filtro', filters.order);
  }
  // 'orden': "" = desc, "asc" = asc

  if (filters.orderDir !== undefined && filters.orderDir !== '') {
    params.append('orden', filters.orderDir);
  }

  return `${JK_BASE_URL}/directorio/?${params.toString()}`;
}

export function jkEpisodesAjaxUrl(animeId: string, page: number): string {
  return `${JK_BASE_URL}/ajax/episodes/${animeId}/${page}`;
}
