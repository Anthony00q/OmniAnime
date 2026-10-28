import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { downloadDirectRanged } from '../../src/services/downloads/DirectRangedDownloader';
import { createTempDirectory } from '../helpers/temp';

for (const cancel of [false, true]) {
  test(
    `transferencia HTTP local: ${cancel ? 'cancelación sin éxito falso' : 'contenido exacto con varios rangos'}`,
    { timeout: 15000 },
    async () => {
      const root = createTempDirectory('omni-transfer-');
      const body = Buffer.alloc(256 * 1024, 42);
      const abort = new AbortController();
      let requests = 0;
      const server = createServer((request, response) => {
        requests++;
        if (cancel) {
          abort.abort();
          return;
        }
        const range = /^bytes=(\d+)-(\d+)$/.exec(String(request.headers.range));
        if (!range) {
          response.writeHead(416).end();
          return;
        }
        const start = Number(range[1]);
        const end = Number(range[2]);
        response.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${body.length}`,
          'Content-Length': end - start + 1,
        });
        response.end(body.subarray(start, end + 1));
      });
      try {
        await new Promise<void>((accept) => server.listen(0, '127.0.0.1', accept));
        const address = server.address();
        assert.ok(address && typeof address === 'object');
        const dest = join(root, 'fixture.bin');
        const success = await downloadDirectRanged(`http://127.0.0.1:${address.port}/fixture`, dest, body.length, 2, {
          userAgent: 'omni-test',
          referer: 'https://example.test/',
          segmentBytes: 64 * 1024,
          signal: abort.signal,
        });
        assert.equal(success, !cancel);
        assert.ok(requests > 0);
        if (!cancel) {
          assert.ok(readFileSync(dest).equals(body));
          assert.equal(requests, 4);
        }
      } finally {
        server.closeAllConnections();
        await new Promise<void>((accept) => server.close(() => accept()));
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
}
