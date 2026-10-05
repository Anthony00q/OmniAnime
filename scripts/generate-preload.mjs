// Genera src/main/preload.js y src/main/splashPreload.js desde los .ts de main: dev y prod
// nacen de la misma fuente, con los canales de src/types/ipc-channels.ts embebidos.
// Uso: node scripts/generate-preload.mjs [--check] (--check falla si están desactualizados)

import { existsSync, promises as fsp } from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const prettier = require('prettier');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC_DIR = path.join(ROOT, 'src');
const CHECK_ONLY = process.argv.includes('--check');
const ENTRIES = [
  { entry: 'main/preload', out: 'main/preload.js' },
  { entry: 'main/splashPreload', out: 'main/splashPreload.js' },
];
const REQUIRE_RE = /\brequire\(\s*(['"])([^'"]+)\1\s*\)/g;

function fail(message) {
  console.error(`generate-preload: ${message}`);
  process.exit(1);
}

// Rutas de módulo estilo POSIX ('main/preload', 'types/ipc-channels') relativas a src/.
function toPosix(value) {
  return value.split(path.sep).join('/');
}

function resolveLocal(fromKey, id) {
  const joined = [...fromKey.split('/').slice(0, -1), ...id.split('/')];
  const parts = [];
  for (const part of joined) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

async function compileModule(key) {
  const file = path.join(SRC_DIR, `${key}.ts`);
  const source = await fsp.readFile(file, 'utf8');
  const result = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });
  return result.outputText;
}

// Mini-bundler: solo módulos locales de src/; 'electron' y los builtins van al require real.
async function collectModules(entryKey) {
  const modules = new Map();
  const pending = [entryKey];
  while (pending.length > 0) {
    const key = pending.shift();
    if (modules.has(key)) continue;
    const code = await compileModule(key);
    modules.set(key, code);
    for (const match of code.matchAll(REQUIRE_RE)) {
      const id = match[2];
      if (!id.startsWith('.')) continue;
      const target = resolveLocal(key, id.replace(/\.(ts|js)$/, ''));
      if (!existsSync(path.join(SRC_DIR, `${target}.ts`))) {
        fail(`no encuentro src/${target}.ts (requerido por ${key} como '${id}')`);
      }
      if (!modules.has(target)) pending.push(target);
    }
  }
  return modules;
}

function emitBundle(entryKey, modules) {
  const lines = [
    "'use strict';",
    `// GENERADO por scripts/generate-preload.mjs desde src/${entryKey}.ts — no editar a mano.`,
    '',
    'const __modules = {',
  ];
  for (const [key, code] of modules) {
    lines.push(`  ${JSON.stringify(key)}: function (exports, require, module) {`);
    lines.push(code);
    lines.push('  },');
  }
  lines.push(
    '};',
    '',
    'const __cache = {};',
    'function __resolve(from, id) {',
    '  const joined = [...from.split("/").slice(0, -1), ...id.split("/")];',
    '  const parts = [];',
    '  for (const part of joined) {',
    '    if (part === "" || part === ".") continue;',
    '    if (part === "..") parts.pop();',
    '    else parts.push(part);',
    '  }',
    '  return parts.join("/");',
    '}',
    'function __load(key) {',
    '  const factory = __modules[key];',
    "  if (!factory) throw new Error('Módulo no incluido en el preload: ' + key);",
    '  if (!__cache[key]) {',
    '    const mod = { exports: {} };',
    '    factory(mod.exports, (next) => __require(next, key), mod);',
    '    __cache[key] = mod.exports;',
    '  }',
    '  return __cache[key];',
    '}',
    'function __require(id, from) {',
    '  if (!id.startsWith(".")) return require(id);',
    '  return __load(__resolve(from, id));',
    '}',
    '',
    `__load(${JSON.stringify(entryKey)});`,
    '',
  );
  return lines.join('\n');
}

const outputs = [];
for (const { entry, out } of ENTRIES) {
  const modules = await collectModules(entry);
  const outFile = path.join(SRC_DIR, toPosix(out));
  const config = (await prettier.resolveConfig(outFile)) ?? {};
  const text = await prettier.format(emitBundle(entry, modules), { ...config, filepath: outFile });
  outputs.push({ outFile, text });
}

let drifted = false;
for (const { outFile, text } of outputs) {
  const current = existsSync(outFile) ? await fsp.readFile(outFile, 'utf8') : null;
  if (CHECK_ONLY) {
    if (current !== text) {
      drifted = true;
      console.error(`generate-preload: ${path.relative(ROOT, outFile)} está desactualizado`);
    }
    continue;
  }
  if (current === text) continue;
  await fsp.writeFile(outFile, text, 'utf8');
  console.log(`generate-preload: ${path.relative(ROOT, outFile)} regenerado`);
}

if (CHECK_ONLY && drifted) {
  fail('regenera con: node scripts/generate-preload.mjs');
}
