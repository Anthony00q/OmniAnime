import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { discoverTests } from './test-groups.mjs';
import { acquireTestLock } from './test-lock.mjs';

const root = resolve(import.meta.dirname, '..');
const group = process.argv[2] || 'ci';
const groups = discoverTests(root);
const list = process.argv.includes('--list');
const coverage = process.argv.includes('--coverage');
const selected =
  group === 'all'
    ? ['ci']
    : group === 'local-all'
      ? ['ci', 'local', 'build', 'tooling']
      : Object.hasOwn(groups, group)
        ? [group]
        : [];
const valid = ['ci', 'local', 'build', 'tooling', 'all', 'local-all', 'electron', 'performance', 'diagnostics'];
const concurrency = Number(process.env.OMNI_TEST_CONCURRENCY || 4);
if (
  process.argv.slice(3).some((argument) => !['--list', '--coverage'].includes(argument)) ||
  !valid.includes(group) ||
  !Number.isInteger(concurrency) ||
  concurrency < 1 ||
  concurrency > 4 ||
  (coverage && group !== 'ci') ||
  (list && ['electron', 'performance', 'diagnostics'].includes(group))
) {
  console.error('Argumentos inválidos. Consulta la sección Pruebas de README.md para los comandos y opciones.');
  process.exit(1);
}
if (list) {
  for (const name of selected) console.log(`${name}:\n${groups[name].join('\n')}`);
  process.exit(0);
}
for (const name of selected) {
  if (groups[name].length === 0) {
    console.error(
      `No está instalada la colección ${name}. Las colecciones locales no se distribuyen; usa npm test o npm run test:all.`,
    );
    process.exit(1);
  }
}
const diagnostic = resolve(root, 'tests/diagnostics/discover-links.ts');
if (group === 'diagnostics' && !existsSync(diagnostic)) {
  console.error('El diagnóstico es exclusivamente local y no está instalado en este checkout.');
  process.exit(1);
}
if (group === 'build' && !existsSync(resolve(root, 'dist/renderer/assets'))) {
  console.error('Falta el renderer compilado. Ejecuta npm run build antes de las pruebas del build.');
  process.exit(1);
}
let lease;
try {
  lease = acquireTestLock(root);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

function launch(args, env) {
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', env });
    child.once('error', reject);
    child.once('exit', (status) => accept(status ?? 1));
  });
}

async function run(name) {
  const args = [
    '--enable-source-maps',
    '--require',
    './checks/helpers/register-offline.cjs',
    '--require',
    'ts-node/register/transpile-only',
    '--require',
    'tsconfig-paths/register',
    '--test',
    `--test-concurrency=${name === 'tooling' ? 1 : concurrency}`,
  ];
  if (coverage) {
    mkdirSync(resolve(root, 'coverage'), { recursive: true });
    args.push(
      '--experimental-test-coverage',
      '--test-coverage-include=src/**/*.ts',
      '--test-reporter=spec',
      '--test-reporter-destination=stdout',
      '--test-reporter=lcov',
      '--test-reporter-destination=coverage/critical.lcov',
    );
  }
  args.push(...groups[name]);
  console.log(`Pruebas ${name}: ${groups[name].length} archivos · sin red externa`);
  const env = { ...process.env, TS_NODE_PROJECT: name === 'ci' ? 'tsconfig.checks.json' : 'tsconfig.json' };
  env.NODE_OPTIONS = `--require "${resolve(root, 'checks/helpers/register-offline.cjs').replaceAll('\\', '/')}"`;
  delete env.ELECTRON_RUN_AS_NODE;
  return launch(args, env);
}

async function runPlaywright(project) {
  const cli = createRequire(import.meta.url).resolve('@playwright/test/cli');
  const env = { ...process.env, OMNI_TEST_LOCK_TOKEN: lease.token };
  delete env.NODE_OPTIONS;
  delete env.ELECTRON_RUN_AS_NODE;
  return launch([cli, 'test', '--config', 'checks/playwright.config.ts', '--project', project], env);
}

try {
  if (group === 'all' || group === 'local-all') {
    const npm = process.env.npm_execpath;
    if (!npm || !existsSync(npm)) throw new Error('Ejecuta la colección completa mediante su comando npm.');
    const code = await launch([npm, 'run', 'build'], { ...process.env });
    if (code !== 0) process.exitCode = code;
  }
  for (const name of selected) {
    if (process.exitCode) break;
    const code = await run(name);
    if (code !== 0) process.exitCode = code;
  }
  if (!process.exitCode && ['all', 'electron', 'performance'].includes(group)) {
    process.exitCode = await runPlaywright(group === 'performance' ? 'performance' : 'electron');
  }
  if (group === 'diagnostics') {
    const env = { ...process.env };
    delete env.NODE_OPTIONS;
    delete env.ELECTRON_RUN_AS_NODE;
    console.log('Diagnóstico voluntario con red externa; no certifica funcionamiento.');
    process.exitCode = await launch(
      ['--require', 'ts-node/register/transpile-only', '--require', 'tsconfig-paths/register', diagnostic],
      env,
    );
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  lease.release();
}
