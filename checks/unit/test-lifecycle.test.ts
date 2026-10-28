import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { terminateChildProcessTree } from '../../src/utils/processUtils';
import { createTempDirectory } from '../helpers/temp';
import { closeOwnedElectron, withResourceCleanup } from '../helpers/resources';

test('los recursos se liberan también si falla la preparación anterior al arranque', async () => {
  const root = createTempDirectory('omni-cleanup-');
  await assert.rejects(
    withResourceCleanup(async (defer) => {
      defer(() => rmSync(root, { recursive: true, force: true }));
      writeFileSync(join(root, 'fixture.json'), '{}');
      throw new Error('Fallo de preparación');
    }),
    /Fallo de preparación/,
  );
  assert.equal(existsSync(root), false);
});

test('la limpieza continúa en orden inverso y conserva tanto el fallo original como el de cierre', async () => {
  const events: string[] = [];
  await assert.rejects(
    withResourceCleanup(async (defer) => {
      defer(() => {
        events.push('carpeta');
      });
      defer(() => {
        events.push('proceso');
        throw new Error('Fallo de cierre');
      });
      throw new Error('Fallo original');
    }),
    (error: unknown) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(
        error.errors.map((entry) => entry.message),
        ['Fallo original', 'Fallo de cierre'],
      );
      return true;
    },
  );
  assert.deepEqual(events, ['proceso', 'carpeta']);
});

test('Node y Playwright comparten exclusión, y un hijo autorizado no libera el candado del padre', async () => {
  const { acquireTestLock } = await import('../../scripts/test-lock.mjs');
  const root = createTempDirectory('omni-lock-');
  try {
    const owner = acquireTestLock(root);
    try {
      assert.throws(() => acquireTestLock(root), /otra ejecución/);
      assert.throws(() => acquireTestLock(root, 'incorrecto'), /autoriz/);
      const child = acquireTestLock(root, owner.token);
      child.release();
      assert.throws(() => acquireTestLock(root), /otra ejecución/);
    } finally {
      owner.release();
      owner.release();
    }
    const next = acquireTestLock(root);
    next.release();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

for (const force of [false, true]) {
  test(
    `el cierre del proceso propio ${force ? 'reporta si necesita terminación forzada' : 'espera su salida confirmada'}`,
    { timeout: 15000 },
    async () => {
      const child = spawn(process.execPath, ['-e', 'process.stdin.resume()'], { stdio: ['pipe', 'ignore', 'ignore'] });
      try {
        const closing = closeOwnedElectron(child, async () => {
          if (!force) child.stdin!.end();
        });
        if (force) await assert.rejects(closing, /cierre forzado/);
        else await closing;
        assert.ok(child.exitCode !== null || child.signalCode !== null);
      } finally {
        if (child.exitCode === null && child.signalCode === null) terminateChildProcessTree(child);
      }
    },
  );
}
