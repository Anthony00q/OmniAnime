import axios from 'axios';
import * as fsp from 'fs/promises';
import {
  readConcurrency,
  reportActualConcurrency,
  subscribeConcurrency,
  type ConcurrencySource,
} from './downloads/attemptConcurrency';

export const DIRECT_RANGED_MIN_CONNECTIONS = 1;
export const DIRECT_RANGED_MAX_CONNECTIONS = 8;
const RANGE_PROBE_TIMEOUT_MS = 10_000;
const PART_TIMEOUT_MS = 60_000;
const PART_STALL_MS = 30_000;
// Cola de segmentos: los workers cogen el siguiente libre al terminar, así un
// trozo lento no frena al resto (el reparto estático lo dejaba todo al lento).
const RANGED_SEGMENT_BYTES = 4 * 1024 * 1024;
const RANGED_MAX_SEGMENTS = 128;

export interface RangedProbeResult {
  supported: boolean;
  totalBytes: number | null;
  // Código diagnóstico sin URLs: para logs debug y fallback.
  reason?: 'sin-206' | 'sin-content-range' | 'fetch-fallo';
}

export interface RangedDownloadOptions {
  userAgent: string;
  referer: string;
  signal?: AbortSignal;
  onProgress?: (fraction01: number, loadedBytes?: number) => void;
  // Tamaño de segmento fijo (tests/afinación); por defecto la heurística de
  // siempre (4 MB o total/128).
  segmentBytes?: number;
  // Permite el pool con 1 worker (medición simple-1 vs ranged-1).
  allowOneWorker?: boolean;
}

export function clampDirectConnections(value: unknown): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : (value as number);
  if (!Number.isFinite(n)) return 1;
  return Math.max(DIRECT_RANGED_MIN_CONNECTIONS, Math.min(DIRECT_RANGED_MAX_CONNECTIONS, Math.round(n)));
}

export function parseContentRangeTotal(raw: unknown): number | null {
  if (typeof raw !== 'string' || !raw) return null;
  const match = raw.trim().match(/^bytes\s+\d+-\d+\/(\d+)$/i);
  if (!match) return null;
  const total = Number(match[1]);
  if (!Number.isFinite(total) || total <= 0) return null;
  return Math.floor(total);
}

export async function probeDirectRangeSupport(url: string, options: RangedDownloadOptions): Promise<RangedProbeResult> {
  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
      headers: {
        'User-Agent': options.userAgent,
        Referer: options.referer,
        Range: 'bytes=0-0',
        'Accept-Encoding': 'identity',
      },
      timeout: RANGE_PROBE_TIMEOUT_MS,
      signal: options.signal as never,
      maxRedirects: 5,
      validateStatus: () => true,
    });
    try {
      (response.data as { destroy?: () => void } | null)?.destroy?.();
    } catch {
      /* best-effort */
    }
    if (response.status !== 206) return { supported: false, totalBytes: null, reason: 'sin-206' };
    const total = parseContentRangeTotal(response.headers?.['content-range']);
    if (total === null) return { supported: false, totalBytes: null, reason: 'sin-content-range' };
    return { supported: true, totalBytes: total };
  } catch {
    return { supported: false, totalBytes: null, reason: 'fetch-fallo' };
  }
}

export async function downloadDirectRanged(
  url: string,
  tempPath: string,
  totalBytes: number,
  connections: ConcurrencySource,
  options: RangedDownloadOptions,
): Promise<boolean> {
  // El pool arranca con 2+ workers (con allowOneWorker también con 1). Una
  // descarga ya iniciada escala en caliente; una que arrancó simple sigue simple.
  const initialWorkers = clampDirectConnections(readConcurrency(connections));
  if (!Number.isFinite(totalBytes) || totalBytes <= 0 || (initialWorkers <= 1 && !options.allowOneWorker)) {
    return false;
  }
  if (options.signal?.aborted) return false;
  let handle: fsp.FileHandle | null = null;
  try {
    handle = await fsp.open(tempPath, 'w');
  } catch {
    return false;
  }
  let confirmed = 0;
  const report = (): void => {
    try {
      options.onProgress?.(Math.max(0, Math.min(1, confirmed / totalBytes)), confirmed);
    } catch {
      /* progress is best-effort */
    }
  };
  const runPart = async (index: number, start: number, end: number): Promise<void> => {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
      headers: {
        'User-Agent': options.userAgent,
        Referer: options.referer,
        Range: `bytes=${start}-${end}`,
        'Accept-Encoding': 'identity',
      },
      timeout: PART_TIMEOUT_MS,
      signal: options.signal as never,
      maxRedirects: 5,
      validateStatus: () => true,
    });
    if (response.status !== 206) throw new Error(`ranged part ${index} status ${response.status}`);
    const stream = response.data as NodeJS.ReadableStream & { destroy?: () => void };
    await new Promise<void>((resolve, reject) => {
      let position = start;
      let settled = false;
      const fail = (error: unknown): void => {
        if (settled) return;
        settled = true;
        clearTimeout(stallTimer);
        try {
          stream.destroy?.();
        } catch {
          /* best-effort */
        }
        reject(error);
      };
      const resetStall = (): void => {
        clearTimeout(stallTimer);
        stallTimer = setTimeout(() => fail(new Error(`ranged part ${index} stalled`)), PART_STALL_MS);
      };
      let stallTimer = setTimeout(() => fail(new Error(`ranged part ${index} stalled`)), PART_STALL_MS);
      const onAbort = (): void => fail(new Error('Aborted'));
      options.signal?.addEventListener('abort', onAbort, { once: true });
      let tail: Promise<void> = Promise.resolve();
      stream.on('data', (chunk: Buffer) => {
        if (options.signal?.aborted || settled) {
          fail(new Error('Aborted'));
          return;
        }
        resetStall();
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
        const offset = position;
        position += buf.length;
        tail = tail.then(async () => {
          if (settled) return;
          await handle?.write(buf, 0, buf.length, offset);
          confirmed += buf.length;
          report();
        });
        tail.catch((error: unknown) => fail(error));
      });
      stream.on('end', () => {
        void tail.then(
          () => {
            if (settled) return;
            settled = true;
            clearTimeout(stallTimer);
            options.signal?.removeEventListener('abort', onAbort);
            resolve();
          },
          (error: unknown) => fail(error),
        );
      });
      stream.on('error', (error: unknown) => fail(error));
    });
  };
  // Pool de streams con Range (no confundir con los workers de episodio): cada
  // uno coge el siguiente segmento libre y el objetivo puede cambiar en caliente.
  const segmentSize = options.segmentBytes
    ? Math.max(1, Math.floor(options.segmentBytes))
    : Math.max(RANGED_SEGMENT_BYTES, Math.ceil(totalBytes / RANGED_MAX_SEGMENTS));
  const segmentCount = Math.ceil(totalBytes / segmentSize);
  const targetWorkers = (): number => Math.max(1, clampDirectConnections(readConcurrency(connections)));
  let nextSegment = 0;
  let running = 0;
  let failure: unknown = null;
  const inflight = new Set<Promise<void>>();

  function spawnUpTo(): void {
    if (failure !== null) return;
    // Sin segmentos pendientes no se spawnea nada (evita ciclos al final).
    if (nextSegment >= segmentCount) return;
    const cap = Math.min(targetWorkers(), segmentCount);
    // El bucle acota los spawns aunque un worker recién creado salga enseguida.
    let toSpawn = cap - running;
    while (toSpawn > 0) {
      toSpawn -= 1;
      running += 1;
      const promise = runWorker().finally(() => inflight.delete(promise));
      inflight.add(promise);
    }
    reportActualConcurrency(connections, running);
  }

  async function runWorker(): Promise<void> {
    // Arranque diferido: el spawn no es reentrante.
    await Promise.resolve();
    try {
      for (;;) {
        if (options.signal?.aborted) throw new Error('Aborted');
        if (failure !== null) return;
        // Si sobran workers, este sale tras su segmento; al menos uno sigue
        // hasta agotar el trabajo.
        if (running > targetWorkers()) return;
        spawnUpTo();
        const index = nextSegment;
        nextSegment += 1;
        if (index >= segmentCount) return;
        const start = index * segmentSize;
        const end = Math.min(totalBytes - 1, start + segmentSize - 1);
        await runPart(index, start, end);
      }
    } catch (error) {
      if (failure === null) failure = error;
    } finally {
      running -= 1;
      reportActualConcurrency(connections, running);
    }
  }

  const unsubscribe = subscribeConcurrency(connections, spawnUpTo);
  try {
    spawnUpTo();
    while (inflight.size > 0) {
      await Promise.all(Array.from(inflight));
    }
    await handle.sync().catch(() => undefined);
  } catch (error) {
    if (failure === null) failure = error;
  }
  unsubscribe();
  reportActualConcurrency(connections, 0);
  if (failure !== null) {
    await handle.close().catch(() => undefined);
    handle = null;
    await fsp.rm(tempPath, { force: true }).catch(() => undefined);
    return false;
  }
  await handle.close().catch(() => undefined);
  handle = null;
  if (options.signal?.aborted) {
    await fsp.rm(tempPath, { force: true }).catch(() => undefined);
    return false;
  }
  try {
    const st = await fsp.stat(tempPath);
    return st.isFile() && st.size === totalBytes;
  } catch {
    return false;
  }
}
