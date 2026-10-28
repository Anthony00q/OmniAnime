import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ok, fail, isIpcFail } from '../../src/types/api';
import { unwrap } from '../../src/renderer/hooks/queries/unwrap';
import { INVOKE_CHANNELS, SEND_CHANNELS, EVENT_CHANNELS } from '../../src/types/ipc-channels';

test('el contrato IPC distingue ausencia, datos y fallos', () => {
  assert.deepEqual(ok(7), { ok: true, data: 7 });
  assert.deepEqual(ok(null), { ok: true, data: null });
  assert.deepEqual(fail('TEST_ERROR', 'Fallo sintético'), {
    ok: false,
    code: 'TEST_ERROR',
    message: 'Fallo sintético',
  });
  assert.equal(unwrap(ok('datos')), 'datos');
  assert.equal(unwrap(ok(null)), null);
  assert.equal(unwrap(ok(false)), false);
  assert.equal(unwrap(ok(0)), 0);
  assert.equal(isIpcFail(fail('TEST_ERROR', 'Fallo sintético')), true);
  assert.equal(isIpcFail(ok(null)), false);
  assert.equal(isIpcFail(null), false);
  assert.equal(isIpcFail({ ok: false }), false);
});

test('cada allowlist IPC conserva identidades únicas', () => {
  for (const channels of [INVOKE_CHANNELS, SEND_CHANNELS, EVENT_CHANNELS]) {
    assert.equal(channels.length, new Set(channels).size);
    assert.ok(channels.length > 0);
  }
  assert.ok(INVOKE_CHANNELS.includes('get-queue'));
  assert.ok(EVENT_CHANNELS.includes('queue-progress'));
});
