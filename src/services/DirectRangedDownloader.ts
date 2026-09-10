import axios from 'axios';
import * as fsp from 'fs/promises';

export const DIRECT_RANGED_MIN_CONNECTIONS = 1;
export const DIRECT_RANGED_MAX_CONNECTIONS = 4;
const RANGE_PROBE_TIMEOUT_MS = 10_000;
const PART_TIMEOUT_MS = 60_000;
const PART_STALL_MS = 30_000;

export interface RangedProbeResult {
  supported: boolean;
  totalBytes: number | null;
}

export interface RangedDownloadOptions {
  userAgent: string;
  referer: string;
  signal?: AbortSignal;
  onProgress?: (fraction01: number) => void;
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
    if (response.status !== 206) return { supported: false, totalBytes: null };
    const total = parseContentRangeTotal(response.headers?.['content-range']);
    if (total === null) return { supported: false, totalBytes: null };
    return { supported: true, totalBytes: total };
  } catch {
    return { supported: false, totalBytes: null };
  }
}

export async function downloadDirectRanged(
  url: string,
  tempPath: string,
  totalBytes: number,
  connections: number,
  options: RangedDownloadOptions,
): Promise<boolean> {
  const parts = clampDirectConnections(connections);
  if (!Number.isFinite(totalBytes) || totalBytes <= 0 || parts <= 1) return false;
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
      options.onProgress?.(Math.max(0, Math.min(1, confirmed / totalBytes)));
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
  try {
    const chunk = Math.floor(totalBytes / parts);
    await Promise.all(
      Array.from({ length: parts }, (_, i) => {
        const start = i * chunk;
        const end = i === parts - 1 ? totalBytes - 1 : (i + 1) * chunk - 1;
        return runPart(i, start, end);
      }),
    );
    await handle.sync().catch(() => undefined);
  } catch {
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
