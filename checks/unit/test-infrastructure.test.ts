import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTempDirectory } from '../helpers/temp';

const requireModule = createRequire(__filename);

test('el descubrimiento separa build, herramientas, integración y diagnósticos', async () => {
  const { discoverTests } = await import('../../scripts/test-groups.mjs');
  const root = createTempDirectory('omni-discovery-');
  const files = [
    'checks/unit/test-infrastructure.test.ts',
    'tests/downloads/attempt.test.ts',
    'tests/integration/queue-visibility.timer.test.ts',
    'tests/build/settings-bundle.test.ts',
    'tests/tooling/lint-tooling.test.ts',
    'tests/build/vite-config.test.ts',
    'tests/tooling/npm-install-policy.test.ts',
    'tests/diagnostics/discover-links.test.ts',
    'tests/external/provider.test.ts',
    'tests/helpers/fixture.ts',
  ];
  try {
    for (const file of files) {
      mkdirSync(join(root, file, '..'), { recursive: true });
      writeFileSync(join(root, file), '');
    }
    const groups = discoverTests(root);
    assert.deepEqual(groups, {
      ci: ['checks/unit/test-infrastructure.test.ts'],
      local: ['tests/downloads/attempt.test.ts', 'tests/integration/queue-visibility.timer.test.ts'],
      build: ['tests/build/settings-bundle.test.ts', 'tests/build/vite-config.test.ts'],
      tooling: ['tests/tooling/lint-tooling.test.ts', 'tests/tooling/npm-install-policy.test.ts'],
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('la política de red del harness solo acepta loopback literal', () => {
  const { isLoopbackHost } = requireModule('../helpers/offline.cjs');
  for (const host of ['127.0.0.1', '::1', '[::1]']) assert.equal(isLoopbackHost(host), true);
  for (const host of ['example.test', '127.0.0.1.example.test', 'localhost', '192.168.1.1', '']) {
    assert.equal(isLoopbackHost(host), false);
  }
});

test('el bloqueo TCP rechaza la conexión antes de resolver un host externo', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--require',
      './checks/helpers/register-offline.cjs',
      '-e',
      `
    try {
      require('node:net').connect({ host: 'example.invalid', port: 80 });
      process.exitCode = 1;
    } catch (error) {
      if (error.code !== 'OMNI_TEST_NETWORK_BLOCKED') throw error;
      process.stdout.write('OK');
    }
  `,
    ],
    { encoding: 'utf8', timeout: 5000 },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'OK');
});

test('CI ejecuta la selección versionada y el piloto sin depender de tests locales', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.match(workflow, /npm run test:ci/);
  assert.match(workflow, /npm run test:electron/);
  assert.match(workflow, /npm run typecheck:checks/);
  const release = readFileSync('.github/workflows/release.yml', 'utf8');
  for (const command of ['npm run test:ci', 'npm run test:electron', 'npm run typecheck:checks']) {
    assert.ok(release.includes(command));
    assert.ok(release.indexOf(command) < release.indexOf('name: Publicar release'));
  }
  assert.ok(existsSync('checks/electron/bootstrap.cjs'));
});

test('el perfil de Electron exige una raíz propia, un marcador válido y el token correspondiente', () => {
  const { validateIsolatedRoot } = requireModule('../helpers/isolation.cjs');
  const root = createTempDirectory('omnianime-electron-');
  try {
    assert.throws(() => validateIsolatedRoot(undefined, undefined));
    assert.throws(() => validateIsolatedRoot(join(root, '..'), 'fixture'));
    assert.throws(() => validateIsolatedRoot(root, 'fixture'));
    writeFileSync(join(root, 'harness.json'), JSON.stringify({ token: 'fixture' }));
    assert.throws(() => validateIsolatedRoot(root, 'incorrecto'));
    assert.equal(validateIsolatedRoot(root, 'fixture'), root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('un clon sin tests privados descubre la colección pública y explica los comandos exclusivamente locales', () => {
  const root = createTempDirectory('omni-public-checkout-');
  try {
    mkdirSync(join(root, 'scripts'));
    mkdirSync(join(root, 'checks/unit'), { recursive: true });
    for (const file of ['test.mjs', 'test-groups.mjs', 'test-lock.mjs']) {
      copyFileSync(join('scripts', file), join(root, 'scripts', file));
    }
    writeFileSync(join(root, 'package.json'), '{}');
    writeFileSync(join(root, 'checks/unit/fixture.test.ts'), '');
    const run = (...args: string[]) =>
      spawnSync(process.execPath, [join(root, 'scripts/test.mjs'), ...args], {
        encoding: 'utf8',
        timeout: 5000,
      });
    const publicTests = run('all', '--list');
    assert.equal(publicTests.status, 0, publicTests.stderr);
    assert.match(publicTests.stdout, /checks\/unit\/fixture\.test\.ts/);
    assert.doesNotMatch(publicTests.stdout, /^tests\//m);
    const localTests = run('local-all');
    assert.equal(localTests.status, 1);
    assert.match(localTests.stderr, /colección local/);
    const diagnostics = run('diagnostics');
    assert.equal(diagnostics.status, 1);
    assert.match(diagnostics.stderr, /exclusivamente local/);
    assert.doesNotMatch(diagnostics.stderr, /MODULE_NOT_FOUND/);
    const invalid = run('ci', '--opcion-inexistente');
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /Argumentos inválidos/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
