import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isAllowedExternalUrl, isAllowedChangelogUrl } from '../../src/utils/security/externalUrl';
import { isPathSafeForDestructiveOperation } from '../../src/utils/security/pathSecurity';
import { assertOutboundUrl } from '../../src/utils/security/outboundPolicy';
import { createTempDirectory } from '../helpers/temp';

test('las puertas de URL rechazan esquemas, credenciales y hosts engañosos', () => {
  assert.equal(isAllowedExternalUrl('https://animeav1.com/media/prueba'), true);
  for (const url of [
    'http://animeav1.com/',
    'https://animeav1.com.example.test/',
    'https://usuario:clave@animeav1.com/',
    'file:///fixture.mp4',
    'javascript:alert(1)',
  ]) {
    assert.equal(isAllowedExternalUrl(url), false);
  }
  for (const url of ['https://127.0.0.1/', 'https://localhost/', 'https://example.test:443/']) {
    assert.equal(isAllowedChangelogUrl(url), false);
  }
  assert.throws(() => assertOutboundUrl('http://192.168.1.1/video.mp4'));
  assert.throws(() =>
    assertOutboundUrl('https://animeav1.com.example.test/', {
      allowedHosts: ['animeav1.com'],
      allowLoopback: false,
    }),
  );
});

test('el borrado queda dentro de una raíz temporal y nunca acepta la raíz ni sus vecinos', () => {
  const root = createTempDirectory('omni-paths-');
  try {
    const downloads = join(root, 'downloads');
    const other = join(root, 'downloads-other');
    mkdirSync(downloads);
    mkdirSync(other);
    const file = join(downloads, 'episodio.mp4');
    writeFileSync(file, 'fixture');
    assert.equal(isPathSafeForDestructiveOperation(file, [downloads]), true);
    assert.equal(isPathSafeForDestructiveOperation(downloads, [downloads]), false);
    assert.equal(isPathSafeForDestructiveOperation(join(other, 'episodio.mp4'), [downloads]), false);
    assert.equal(isPathSafeForDestructiveOperation(join(downloads, '..', 'fuera.mp4'), [downloads]), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
