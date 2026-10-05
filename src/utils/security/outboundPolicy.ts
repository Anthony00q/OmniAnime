import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';

export type OutboundPolicyReason = 'url-invalida' | 'esquema-no-permitido' | 'host-no-permitido' | 'red-privada';

export class OutboundPolicyError extends Error {
  readonly reason: OutboundPolicyReason;

  constructor(reason: OutboundPolicyReason) {
    // Sin URL en el mensaje: acaba en logs y en failureReason.
    super(`Petición saliente bloqueada (${reason})`);
    this.name = 'OutboundPolicyError';
    this.reason = reason;
  }
}

export interface OutboundPolicy {
  /** Hosts permitidos (exacto o subdominio). Sin lista → cualquier host público. */
  allowedHosts?: readonly string[];
  /** Admite http además de https. Por defecto sí: hay orígenes legacy en http. */
  allowHttp?: boolean;
  /** Rechaza IPs privadas/LAN/CGNAT literales. Por defecto sí. */
  blockPrivateNetwork?: boolean;
  /** Admite loopback (127.0.0.1, ::1, localhost). Por defecto sí: los motores se prueban contra servidores locales. */
  allowLoopback?: boolean;
  /** Timeout por defecto cuando el punto de llamada no fija el suyo. */
  timeoutMs?: number;
}

export const DEFAULT_OUTBOUND_TIMEOUT_MS = 30_000;

// Para orígenes no enumerables (los hosts de descarga salen de los enlaces del proveedor y cambian): solo host público.
export const BROAD_OUTBOUND_POLICY: OutboundPolicy = {
  allowHttp: true,
  blockPrivateNetwork: true,
  allowLoopback: true,
};

function parseIPv4(host: string): number[] | null {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  return parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null;
}

function isLoopbackIPv4(parts: number[]): boolean {
  return parts[0] === 127;
}

function isPrivateIPv4(parts: number[]): boolean {
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  // Link-local, incluido el endpoint de metadatos de la nube.
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 0) return true;
  return false;
}

function normalizeHost(hostname: string): string {
  return String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/^\[(.*)\]$/, '$1');
}

function mappedIPv4(hostname: string): number[] | null {
  const dotted = hostname.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) return parseIPv4(dotted[1]);
  // La URL canónica de Node escribe el mapeado en hex: ::ffff:c0a8:101.
  const hex = hostname.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const high = parseInt(hex[1], 16);
    const low = parseInt(hex[2], 16);
    return [(high >> 8) & 0xff, high & 0xff, (low >> 8) & 0xff, low & 0xff];
  }
  return null;
}

export function isLoopbackHost(hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  const v4 = parseIPv4(host);
  if (v4) return isLoopbackIPv4(v4);
  const mapped = mappedIPv4(host);
  if (mapped) return isLoopbackIPv4(mapped);
  return host === '::1' || host === '0:0:0:0:0:0:0:1';
}

export function isPrivateNetworkHost(hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (!host) return false;
  const v4 = parseIPv4(host);
  if (v4) return isPrivateIPv4(v4);
  const mapped = mappedIPv4(host);
  if (mapped) return isPrivateIPv4(mapped);
  // IPv6 de ámbito local (ULA) o link-local.
  return /^f[cd]/.test(host) || /^fe[89ab]/.test(host);
}

function isAllowedHost(hostname: string, allowedHosts: readonly string[]): boolean {
  const host = normalizeHost(hostname);
  return allowedHosts.some((entry) => {
    const allowed = normalizeHost(entry);
    return !!allowed && (host === allowed || host.endsWith(`.${allowed}`));
  });
}

export function assertOutboundUrl(rawUrl: string, policy: OutboundPolicy = {}): URL {
  let parsed: URL;
  try {
    parsed = new URL(String(rawUrl || '').trim());
  } catch {
    throw new OutboundPolicyError('url-invalida');
  }

  const httpsOnly = policy.allowHttp === false;
  if (parsed.protocol !== 'https:' && (httpsOnly || parsed.protocol !== 'http:')) {
    throw new OutboundPolicyError('esquema-no-permitido');
  }

  const host = parsed.hostname;
  if (isLoopbackHost(host)) {
    if (policy.allowLoopback === false) throw new OutboundPolicyError('red-privada');
  } else if (isPrivateNetworkHost(host) && policy.blockPrivateNetwork !== false) {
    throw new OutboundPolicyError('red-privada');
  }

  if (policy.allowedHosts) {
    if (!isAllowedHost(host, policy.allowedHosts)) throw new OutboundPolicyError('host-no-permitido');
  } else if (!isLoopbackHost(host) && !host.includes('.')) {
    // Sin dominio no es un host público: resuelve a la red local.
    throw new OutboundPolicyError('host-no-permitido');
  }

  return parsed;
}

function absoluteUrlOf(config: AxiosRequestConfig): string {
  const url = String(config.url ?? '');
  if (!config.baseURL) return url;
  try {
    return new URL(url, config.baseURL).toString();
  } catch {
    return url;
  }
}

function redirectTargetOf(options: Record<string, unknown>): string {
  const protocol = String(options.protocol ?? '');
  const hostname = String(options.hostname ?? '');
  const host = hostname.includes(':') && !hostname.startsWith('[') ? `[${hostname}]` : hostname;
  const port = options.port ? `:${String(options.port)}` : '';
  return `${protocol}//${host}${port}${String(options.path ?? '/')}`;
}

interface PreparedCall {
  config: AxiosRequestConfig;
  blocked: () => OutboundPolicyError | null;
}

function prepareCall(config: AxiosRequestConfig, policy: OutboundPolicy): PreparedCall {
  assertOutboundUrl(absoluteUrlOf(config), policy);

  let blocked: OutboundPolicyError | null = null;
  return {
    config: {
      ...config,
      timeout: config.timeout ?? policy.timeoutMs ?? DEFAULT_OUTBOUND_TIMEOUT_MS,
      beforeRedirect: (options, responseDetails, requestDetails) => {
        try {
          assertOutboundUrl(redirectTargetOf(options), policy);
        } catch (error) {
          // follow-redirects envuelve el error del salto; guardamos el nuestro para devolverlo tal cual.
          blocked = error as OutboundPolicyError;
          throw error;
        }
        config.beforeRedirect?.(options, responseDetails, requestDetails);
      },
    },
    blocked: () => blocked,
  };
}

async function runCall<T>(prepared: PreparedCall, send: () => Promise<AxiosResponse<T>>): Promise<AxiosResponse<T>> {
  try {
    return await send();
  } catch (error) {
    const blocked = prepared.blocked();
    if (blocked) throw blocked;
    throw error;
  }
}

// Valida la URL inicial y cada salto de redirect, con timeout por defecto; el resto de la config es la de axios.
export function outboundRequest<T = any>(
  config: AxiosRequestConfig,
  policy: OutboundPolicy = {},
): Promise<AxiosResponse<T>> {
  const prepared = prepareCall(config, policy);
  return runCall(prepared, () => axios.request<T>(prepared.config));
}

export function outboundGet<T = any>(
  url: string,
  config: AxiosRequestConfig = {},
  policy: OutboundPolicy = {},
): Promise<AxiosResponse<T>> {
  const prepared = prepareCall({ ...config, url, method: 'get' }, policy);
  return runCall(prepared, () => axios.get<T>(url, prepared.config));
}

export function outboundPost<T = any>(
  url: string,
  data?: unknown,
  config: AxiosRequestConfig = {},
  policy: OutboundPolicy = {},
): Promise<AxiosResponse<T>> {
  const prepared = prepareCall({ ...config, url, data, method: 'post' }, policy);
  return runCall(prepared, () => axios.post<T>(url, data, prepared.config));
}

export interface OutboundClient {
  request<T = any>(config: AxiosRequestConfig): Promise<AxiosResponse<T>>;
  get<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
  post<T = any>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
}

export function createOutboundClient(defaults: AxiosRequestConfig, policy: OutboundPolicy = {}): OutboundClient {
  const merge = (config: AxiosRequestConfig = {}): AxiosRequestConfig => ({ ...defaults, ...config });
  return {
    request: (config) => outboundRequest(merge(config), policy),
    get: (url, config) => outboundGet(url, merge(config), policy),
    post: (url, data, config) => outboundPost(url, data, merge(config), policy),
  };
}
