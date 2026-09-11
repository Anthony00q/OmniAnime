import axios from 'axios';
import * as fsp from 'fs/promises';
import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import { execFile } from 'child_process';
import { parseMasterPlaylist, parseMediaPlaylist } from './HlsPlaylistParser';
import { concatFilesInOrder, remuxConcatToMp4 } from './HlsAssembler';

export const HLS_NATIVE_CONCURRENCY = 10;

const PLAYLIST_TIMEOUT_MS = 15_000;
const SEGMENT_TIMEOUT_MS = 30_000;
const SEGMENT_ATTEMPTS = 3;

const noop = (): void => undefined;

export interface HlsDownloadProgress {
  fraction01: number;
  doneSegments: number;
  totalSegments: number;
}

export interface HlsDownloadDeps {
  fetchText?: (url: string) => Promise<string>;
  remux?: (concatPath: string, outPath: string) => Promise<void>;
}

export interface HlsDownloadOptions {
  userAgent: string;
  referer: string;
  concurrency?: number;
  attempts?: number;
  ffmpegPath: string;
  signal?: AbortSignal;
  onProgress?: (progress: HlsDownloadProgress) => void;
  deps?: HlsDownloadDeps;
}

export interface HlsDownloadResult {
  ok: boolean;
  bytes?: number;
  segments?: number;
  resumedSegments?: number;
  error?: string;
  aborted?: boolean;
}

interface HlsResumeManifest {
  m3u8Url: string;
  mediaUrl: string;
  segmentCount: number;
  mapUri: string | null;
}

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 32 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 32 });

function isLoopbackHost(hostname: string): boolean {
  const normalized = String(hostname || '').toLowerCase();
  return normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost';
}

function assertSameOriginUrl(rawUrl: string, playlistUrl: string): string {
  let parsed: URL;
  let base: URL;
  try {
    parsed = new URL(rawUrl);
    base = new URL(playlistUrl);
  } catch {
    throw new Error(`URL de segmento inválida: ${String(rawUrl).slice(0, 80)}`);
  }
  const loopbackHttp = parsed.protocol === 'http:' && isLoopbackHost(parsed.hostname);
  if (parsed.protocol !== 'https:' && !loopbackHttp) throw new Error('segmento fuera de https');
  if (parsed.hostname !== base.hostname) throw new Error('segmento fuera del host del playlist');
  return parsed.toString();
}

function sleepAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener('abort', onAbort);
  });
}

function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code;
    if (code === 'ERR_CANCELED') return true;
    if (error.name === 'CanceledError' || error.name === 'AbortError') return true;
  }
  return false;
}

export async function downloadHlsToMp4(
  m3u8Url: string,
  destPath: string,
  options: HlsDownloadOptions,
): Promise<HlsDownloadResult> {
  const { userAgent, referer, ffmpegPath, signal, onProgress, deps } = options;
  const concurrency = Math.max(
    1,
    Math.min(32, Math.round(options.concurrency ?? HLS_NATIVE_CONCURRENCY) || HLS_NATIVE_CONCURRENCY),
  );
  const segmentAttempts = Math.max(
    1,
    Math.min(10, Math.round(options.attempts ?? SEGMENT_ATTEMPTS) || SEGMENT_ATTEMPTS),
  );
  if (signal?.aborted) return { ok: false, aborted: true, error: 'descarga abortada' };

  const headers = {
    'User-Agent': userAgent,
    Referer: referer,
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
  };
  const fetchText =
    deps?.fetchText ??
    (async (url: string): Promise<string> => {
      const response = await axios.get(url, {
        headers,
        timeout: PLAYLIST_TIMEOUT_MS,
        maxRedirects: 5,
        httpAgent,
        httpsAgent,
        signal: signal as never,
        validateStatus: (status) => status >= 200 && status < 300,
      });
      return String(response.data ?? '');
    });
  const fetchBytes = async (url: string): Promise<Buffer> => {
    const response = await axios.get(url, {
      headers,
      timeout: SEGMENT_TIMEOUT_MS,
      maxRedirects: 5,
      responseType: 'arraybuffer',
      httpAgent,
      httpsAgent,
      signal: signal as never,
      validateStatus: (status) => status >= 200 && status < 300,
    });
    return Buffer.from(response.data as ArrayBuffer);
  };

  const destDir = path.dirname(destPath);
  const cacheDir = path.join(destDir, '.cache');
  const baseName = path.basename(destPath);
  const hlsPrefix = `${baseName}.hls-`;
  const sidecarPath = path.join(cacheDir, `${baseName}.hls.json`);
  const partPathFor = (index: number): string =>
    path.join(cacheDir, `${baseName}.hls-${String(index).padStart(5, '0')}.part`);
  const segmentParts: Array<string | undefined> = [];
  let mapPart = '';
  let concatPath = '';
  let tmpOut = '';
  const cleanupTransient = async (): Promise<void> => {
    const targets: string[] = [];
    if (concatPath) targets.push(concatPath);
    if (tmpOut) targets.push(tmpOut);
    await Promise.all(targets.map((p) => fsp.rm(p, { force: true }).catch(() => undefined)));
  };
  const purgeHlsTemps = async (): Promise<void> => {
    try {
      const names = await fsp.readdir(cacheDir);
      await Promise.all(
        names
          .filter((name) => name.startsWith(hlsPrefix))
          .map((name) => fsp.rm(path.join(cacheDir, name), { force: true }).catch(() => undefined)),
      );
    } catch {
      /* purga best-effort */
    }
    await fsp.rm(sidecarPath, { force: true }).catch(noop);
  };
  const readManifest = async (): Promise<HlsResumeManifest | null> => {
    try {
      const raw = await fsp.readFile(sidecarPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<HlsResumeManifest>;
      if (
        !parsed ||
        typeof parsed.m3u8Url !== 'string' ||
        typeof parsed.mediaUrl !== 'string' ||
        typeof parsed.segmentCount !== 'number' ||
        (parsed.mapUri !== null && typeof parsed.mapUri !== 'string')
      ) {
        return null;
      }
      return parsed as HlsResumeManifest;
    } catch {
      return null;
    }
  };

  try {
    let playlistText: string;
    try {
      playlistText = await fetchText(m3u8Url);
    } catch (error: unknown) {
      if (signal?.aborted || isAbortError(error)) return { ok: false, aborted: true, error: 'descarga abortada' };
      return { ok: false, error: `no se pudo leer el playlist: ${(error as Error)?.message || error}` };
    }
    const variantUrl = parseMasterPlaylist(playlistText, m3u8Url);
    let mediaBase = m3u8Url;
    if (variantUrl) {
      mediaBase = variantUrl;
      try {
        playlistText = await fetchText(variantUrl);
      } catch (error: unknown) {
        if (signal?.aborted || isAbortError(error)) return { ok: false, aborted: true, error: 'descarga abortada' };
        return { ok: false, error: `no se pudo leer la variante HLS: ${(error as Error)?.message || error}` };
      }
    }
    const media = parseMediaPlaylist(playlistText, mediaBase);
    if (media.keyMethod) return { ok: false, error: `HLS cifrado (${media.keyMethod}) no soportado` };
    if (!media.endlist) return { ok: false, error: 'HLS en vivo no soportado' };
    if (media.segments.length === 0) return { ok: false, error: 'playlist HLS sin segmentos' };

    let segmentUrls: string[];
    try {
      segmentUrls = media.segments.map((s) => assertSameOriginUrl(s, mediaBase));
    } catch (error: unknown) {
      return { ok: false, error: (error as Error)?.message || 'segmento HLS no válido' };
    }
    let mapBytes: Buffer | null = null;
    if (media.mapUri) {
      try {
        mapBytes = await fetchBytes(assertSameOriginUrl(media.mapUri, mediaBase));
      } catch (error: unknown) {
        if (signal?.aborted || isAbortError(error)) return { ok: false, aborted: true, error: 'descarga abortada' };
        return { ok: false, error: `no se pudo leer el init HLS: ${(error as Error)?.message || error}` };
      }
    }

    try {
      await fsp.mkdir(cacheDir, { recursive: true });
      if (process.platform === 'win32') {
        execFile('attrib', ['+h', cacheDir], { windowsHide: true }, () => {});
      }
    } catch {
      return { ok: false, error: 'no se pudo preparar la carpeta temporal' };
    }

    const total = segmentUrls.length;
    let done = 0;
    let resumedSegments = 0;
    const report = (): void => {
      try {
        onProgress?.({
          fraction01: total === 0 ? 0 : Math.min(1, done / total),
          doneSegments: done,
          totalSegments: total,
        });
      } catch {
        /* progreso best-effort */
      }
    };

    // Resume: mismo playlist + misma variante + mismo conteo + mismo MAP
    // reutiliza las .part completas; cualquier cambio arranca en fresco.
    const manifest: HlsResumeManifest = {
      m3u8Url,
      mediaUrl: mediaBase,
      segmentCount: total,
      mapUri: media.mapUri,
    };
    const previous = await readManifest();
    const canResume =
      previous !== null &&
      previous.m3u8Url === manifest.m3u8Url &&
      previous.mediaUrl === manifest.mediaUrl &&
      previous.segmentCount === manifest.segmentCount &&
      previous.mapUri === manifest.mapUri;
    if (!canResume) {
      await purgeHlsTemps();
    } else {
      for (let i = 0; i < total; i += 1) {
        const partPath = partPathFor(i);
        try {
          const st = await fsp.stat(partPath);
          if (st.isFile() && st.size > 0) {
            segmentParts[i] = partPath;
            done += 1;
            resumedSegments += 1;
          }
        } catch {
          /* hueco: se descarga */
        }
      }
    }
    await fsp.writeFile(sidecarPath, JSON.stringify(manifest)).catch(noop);
    // Restos de ensamblados interrumpidos nunca se reutilizan.
    await fsp.rm(path.join(cacheDir, `${baseName}.hls-concat.tmp`), { force: true }).catch(noop);
    await fsp.rm(path.join(cacheDir, `${baseName}.hls-mux.mp4`), { force: true }).catch(noop);
    report();
    const fetchSegmentGuarded = async (url: string, index: number): Promise<string> => {
      let lastError: unknown = null;
      for (let attempt = 1; attempt <= segmentAttempts; attempt += 1) {
        if (signal?.aborted) return '';
        try {
          const bytes = await fetchBytes(url);
          // Tmp + rename: solo lo renombrado a .part cuenta como completo.
          const partPath = partPathFor(index);
          await fsp.writeFile(`${partPath}.downloading`, bytes);
          await fsp.rename(`${partPath}.downloading`, partPath);
          segmentParts[index] = partPath;
          done += 1;
          report();
          return partPath;
        } catch (error: unknown) {
          lastError = error;
          if (signal?.aborted || isAbortError(error)) return '';
          if (attempt < segmentAttempts) await sleepAbortable(attempt === 1 ? 1000 : 2000, signal);
        }
      }
      throw lastError instanceof Error ? lastError : new Error(`segmento ${index} irrecuperable`);
    };

    let next = 0;
    let segmentError: unknown = null;
    const workers = Array.from({ length: Math.min(concurrency, total) }, async () => {
      while (next < total && !signal?.aborted && !segmentError) {
        const index = next;
        next += 1;
        if (segmentParts[index]) continue;
        try {
          await fetchSegmentGuarded(segmentUrls[index], index);
        } catch (error: unknown) {
          segmentError = error;
        }
      }
    });
    await Promise.all(workers);
    if (signal?.aborted) {
      await cleanupTransient();
      return { ok: false, aborted: true, error: 'descarga abortada' };
    }
    if (segmentError) {
      await cleanupTransient();
      const message = segmentError instanceof Error ? segmentError.message : String(segmentError);
      return { ok: false, error: `segmento HLS irrecuperable: ${message.slice(0, 200)}` };
    }

    concatPath = path.join(cacheDir, `${baseName}.hls-concat.tmp`);
    const orderedParts: string[] = [];
    if (mapBytes) {
      mapPart = path.join(cacheDir, `${baseName}.hls-init.part`);
      await fsp.writeFile(mapPart, mapBytes);
      orderedParts.push(mapPart);
    }
    for (let i = 0; i < total; i += 1) {
      const part = segmentParts[i];
      if (!part) {
        await cleanupTransient();
        return { ok: false, error: `falta el segmento HLS ${i}` };
      }
      orderedParts.push(part);
    }
    await concatFilesInOrder(orderedParts, concatPath);
    tmpOut = path.join(cacheDir, `${baseName}.hls-mux.mp4`);
    const remux = deps?.remux ?? ((concat: string, out: string) => remuxConcatToMp4(concat, out, ffmpegPath, signal));
    try {
      await remux(concatPath, tmpOut);
    } catch (error: unknown) {
      if (signal?.aborted) {
        await cleanupTransient();
        return { ok: false, aborted: true, error: 'descarga abortada' };
      }
      await cleanupTransient();
      return { ok: false, error: `no se pudo ensamblar el mp4: ${(error as Error)?.message || error}`.slice(0, 300) };
    }
    if (signal?.aborted) {
      await cleanupTransient();
      return { ok: false, aborted: true, error: 'descarga abortada' };
    }
    let bytes = 0;
    try {
      const st = await fsp.stat(tmpOut);
      if (!st.isFile() || st.size <= 0) {
        await cleanupTransient();
        return { ok: false, error: 'ensamblado HLS vacío' };
      }
      bytes = st.size;
      await fsp.unlink(destPath).catch(noop);
      await fsp.rename(tmpOut, destPath);
      tmpOut = '';
    } catch (error: unknown) {
      await cleanupTransient();
      return { ok: false, error: `no se pudo publicar el mp4: ${(error as Error)?.message || error}` };
    }
    await purgeHlsTemps();
    report();
    return { ok: true, bytes, segments: total, resumedSegments };
  } catch (error: unknown) {
    await cleanupTransient();
    if (signal?.aborted) return { ok: false, aborted: true, error: 'descarga abortada' };
    return { ok: false, error: (error as Error)?.message || 'fallo HLS desconocido' };
  }
}
