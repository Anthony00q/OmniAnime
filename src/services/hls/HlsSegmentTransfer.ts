import { createWriteStream } from 'fs';
import * as fsp from 'fs/promises';
import type * as http from 'http';
import type { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { BROAD_OUTBOUND_POLICY, outboundGet } from '../../utils/security/outboundPolicy';

interface HlsPartOptions {
  headers: Record<string, string>;
  signal?: AbortSignal;
  httpAgent?: http.Agent;
  httpsAgent?: http.Agent;
}

export async function downloadHlsPart(url: string, partPath: string, options: HlsPartOptions): Promise<number> {
  options.signal?.throwIfAborted();
  const temporary = `${partPath}.downloading`;
  let body: Readable | undefined;
  try {
    const response = await outboundGet<Readable>(
      url,
      {
        headers: options.headers,
        timeout: 30_000,
        maxRedirects: 5,
        responseType: 'stream',
        httpAgent: options.httpAgent,
        httpsAgent: options.httpsAgent,
        signal: options.signal,
        validateStatus: () => true,
      },
      BROAD_OUTBOUND_POLICY,
    );
    body = response.data;
    if (response.status < 200 || response.status >= 300) throw new Error('Respuesta HLS no válida');
    options.signal?.throwIfAborted();
    const writer = createWriteStream(temporary, { highWaterMark: 1024 * 1024 });
    await pipeline(body, writer, { signal: options.signal });
    options.signal?.throwIfAborted();
    const bytes = writer.bytesWritten;
    if (bytes <= 0) throw new Error('Parte HLS vacía');
    await fsp.rename(temporary, partPath);
    return bytes;
  } catch (error) {
    body?.destroy();
    await fsp.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    body?.destroy();
  }
}
