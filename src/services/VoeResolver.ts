import axios from 'axios';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 10_000;
const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;

export interface VoeResolveResult {
  ok: boolean;
  kind?: 'mp4' | 'hls';
  directUrl?: string;
  reason?: 'embed-invalido' | 'fetch-fallo' | 'sin-directo';
}

export type VoeResolveFn = (embedUrl: string) => Promise<VoeResolveResult>;

export interface VoeResolverDeps {
  fetchHtml?: (url: string) => Promise<string>;
  timeoutMs?: number;
}

const VOE_HOST_SUFFIXES = ['voe.sx'];

function isVoeEmbedUrl(candidate: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(String(candidate || '').trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  const host = parsed.hostname.toLowerCase();
  return VOE_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export function extractVoePayload(html: string): string | null {
  const text = String(html || '');
  if (!text) return null;
  const markers = ['<script type="application/json">', '<script type=application/json>'];
  let contentStart = -1;
  for (const marker of markers) {
    const at = text.indexOf(marker);
    if (at >= 0) {
      contentStart = at + marker.length;
      break;
    }
  }
  if (contentStart < 0) return null;
  const end = text.indexOf('</script>', contentStart);
  if (end < 0) return null;
  const raw = text.slice(contentStart, end).trim();
  if (!raw.startsWith('[') || raw.length > MAX_PAYLOAD_BYTES) return null;
  return raw;
}

function rot13(input: string): string {
  return input.replace(/[A-Za-z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

function stripMarkers(input: string): string {
  let out = input;
  for (const marker of ['@$', '^^', '~@', '%?', '*~', '!!', '#&']) out = out.split(marker).join('');
  return out;
}

function shiftChars(input: string, shift: number): string {
  return [...input].map((c) => String.fromCharCode((c.codePointAt(0) ?? 0) - shift)).join('');
}

function decodeBase64Latin1(input: string): string | null {
  try {
    const clean = String(input || '').trim();
    if (!clean || /[^A-Za-z0-9+/=]/.test(clean)) return null;
    const padded = clean + '='.repeat((4 - (clean.length % 4)) % 4);
    const out = Buffer.from(padded, 'base64').toString('latin1');
    if (!out) return null;
    return out;
  } catch {
    return null;
  }
}

export function deobfuscateVoePayload(rawJson: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(String(rawJson || ''));
    if (!Array.isArray(parsed) || typeof parsed[0] !== 'string' || !parsed[0]) return null;
    const step1 = stripMarkers(rot13(parsed[0]));
    if (!step1) return null;
    const step2 = decodeBase64Latin1(step1);
    if (step2 === null || !step2) return null;
    const step3 = [...shiftChars(step2, 3)].reverse().join('');
    if (!step3) return null;
    const step4 = decodeBase64Latin1(step3);
    if (step4 === null) return null;
    const decoded: unknown = JSON.parse(step4);
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) return null;
    return decoded as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.trim();
  if (!/^https?:\/\//i.test(clean)) return null;
  try {
    const parsed = new URL(clean);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return clean;
  } catch {
    return null;
  }
}

export function pickVoeSource(decoded: Record<string, unknown> | null): { kind: 'mp4' | 'hls'; url: string } | null {
  if (!decoded || typeof decoded !== 'object') return null;
  const mp4 = asHttpUrl(decoded.direct_access_url);
  if (mp4) return { kind: 'mp4', url: mp4 };
  const hls = asHttpUrl(decoded.source);
  if (hls) return { kind: 'hls', url: hls };
  return null;
}

function followVoeRedirect(html: string, embedUrl: string): string | null {
  const match = String(html || '').match(/window\.location\.href\s*=\s*'([^']+)'/);
  if (!match?.[1]) return null;
  try {
    const resolved = new URL(match[1].trim(), embedUrl);
    if (resolved.protocol !== 'https:') return null;
    return resolved.toString();
  } catch {
    return null;
  }
}

async function defaultFetchHtml(url: string, timeoutMs: number): Promise<string> {
  const response = await axios.get(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    timeout: timeoutMs,
    responseType: 'text',
    maxRedirects: 5,
    maxContentLength: MAX_PAYLOAD_BYTES,
    maxBodyLength: MAX_PAYLOAD_BYTES,
    validateStatus: (status) => status >= 200 && status < 300,
  });
  return String(response.data || '');
}

export async function resolveVoeDirect(embedUrl: string, deps: VoeResolverDeps = {}): Promise<VoeResolveResult> {
  try {
    const clean = String(embedUrl || '').trim();
    if (!isVoeEmbedUrl(clean)) return { ok: false, reason: 'embed-invalido' };
    const timeoutMs =
      typeof deps.timeoutMs === 'number' && Number.isFinite(deps.timeoutMs) && deps.timeoutMs > 0
        ? Math.min(30_000, deps.timeoutMs)
        : FETCH_TIMEOUT_MS;
    const fetchHtml = deps.fetchHtml ?? ((url: string) => defaultFetchHtml(url, timeoutMs));
    let html: string;
    try {
      html = await fetchHtml(clean);
    } catch {
      return { ok: false, reason: 'fetch-fallo' };
    }
    const redirect = followVoeRedirect(html, clean);
    if (redirect && redirect !== clean) {
      try {
        html = await fetchHtml(redirect);
      } catch {
        return { ok: false, reason: 'fetch-fallo' };
      }
    }
    if (html.length > MAX_PAYLOAD_BYTES * 2) return { ok: false, reason: 'sin-directo' };
    const raw = extractVoePayload(html);
    if (!raw) return { ok: false, reason: 'sin-directo' };
    const picked = pickVoeSource(deobfuscateVoePayload(raw));
    if (!picked) return { ok: false, reason: 'sin-directo' };
    return { ok: true, kind: picked.kind, directUrl: picked.url };
  } catch {
    return { ok: false, reason: 'fetch-fallo' };
  }
}
