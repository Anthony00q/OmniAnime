import assert from 'node:assert/strict';
import { test } from 'node:test';
import fc from 'fast-check';
import {
  createAttemptConcurrencyHandle,
  DIRECT_CONCURRENCY_LEVELS,
} from '../../src/services/downloads/attemptConcurrency';
import { normalizeDownloadSettings } from '../../src/utils/downloads/downloadSettings';

test('las secuencias generadas de concurrencia respetan el cierre del intento', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.oneof(
          fc.record({ kind: fc.constant('target'), value: fc.constantFrom(...DIRECT_CONCURRENCY_LEVELS) }),
          fc.record({ kind: fc.constant('dispose'), value: fc.constant(0) }),
        ),
        { maxLength: 80 },
      ),
      (commands) => {
        const handle = createAttemptConcurrencyHandle(2);
        let disposed = false;
        let target = 2;
        let notifications = 0;
        handle.subscribe(() => notifications++);
        for (const command of commands) {
          if (command.kind === 'dispose') {
            handle.dispose();
            disposed = true;
          } else {
            const before = notifications;
            handle.setTarget(command.value);
            if (!disposed) target = command.value;
            else assert.equal(notifications, before);
          }
          assert.equal(handle.current(), target);
          assert.equal(handle.isDisposed(), disposed);
        }
        handle.dispose();
      },
    ),
    { seed: 20261028, numRuns: 200 },
  );
});

test('la normalización nunca convierte Mega en una descarga de varias conexiones', () => {
  fc.assert(
    fc.property(fc.anything(), (value) => {
      const settings = normalizeDownloadSettings({ megaConnections: value });
      assert.equal(settings.megaConnections, 1);
    }),
    { seed: 20261028, numRuns: 200 },
  );
});
