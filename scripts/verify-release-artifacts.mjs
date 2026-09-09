// Verifica el trio publicable (exe + blockmap + latest.yml) antes de subirlo al draft.
// Uso: node scripts/verify-release-artifacts.mjs --dir dist-release --tag v1.0.2 [--package package.json]
// Falla si falta alguna pieza, la version no cuadra o el sha512/size del yml no coincide con el exe real.

import { createHash } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function readArgValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
}

function fail(message) {
  console.error(`verify-release-artifacts: ${message}`);
  process.exit(1);
}

export function parseLatestYml(yml, exeName) {
  const lines = String(yml).split(/\r?\n/);
  let version = null;
  let topPath = null;
  let current = null;
  let entry = null;
  const close = () => {
    if (current && current.url === exeName && !entry) entry = current;
    current = null;
  };
  for (const line of lines) {
    if (/^\S/.test(line)) {
      close();
      const versionMatch = line.match(/^version\s*:\s*['"]?([^'"\s]+)['"]?\s*$/);
      if (versionMatch) version = versionMatch[1];
      const pathMatch = line.match(/^path\s*:\s*['"]?([^'"\s]+)['"]?\s*$/);
      if (pathMatch) topPath = pathMatch[1];
      continue;
    }
    const urlMatch = line.match(/-\s*url\s*:\s*['"]?([^'"\s]+)['"]?\s*$/);
    if (urlMatch) {
      close();
      current = { url: urlMatch[1], sha512: null, size: null };
      continue;
    }
    if (current) {
      const shaMatch = line.match(/sha512\s*:\s*['"]?([^'"\s]+)['"]?\s*$/);
      if (shaMatch) current.sha512 = shaMatch[1];
      // size en minúsculas: no casa con blockMapSize.
      const sizeMatch = line.match(/^\s*size\s*:\s*(\d+)\s*$/);
      if (sizeMatch) current.size = Number(sizeMatch[1]);
    }
  }
  close();
  return { version, topPath, entry };
}

async function sha512Base64(filePath) {
  const hash = createHash('sha512');
  hash.update(await fsp.readFile(filePath));
  return hash.digest('base64');
}

async function readPackageVersion(pkgPath) {
  let raw;
  try {
    raw = await fsp.readFile(pkgPath, 'utf8');
  } catch {
    fail(`no se pudo leer ${pkgPath}`);
  }
  try {
    return JSON.parse(raw).version;
  } catch {
    fail(`${pkgPath} no es un JSON válido`);
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const dir = readArgValue(args, '--dir') || path.join(ROOT, 'dist-release');
  const tag = readArgValue(args, '--tag') || process.env.GITHUB_REF_NAME || '';
  const pkgPath = readArgValue(args, '--package') || path.join(ROOT, 'package.json');
  const version = await readPackageVersion(pkgPath);
  const wanted = tag.startsWith('v') ? tag.slice(1) : tag;
  if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(wanted)) {
    fail(`tag inválido o ausente: "${tag || '(vacío)'}" (se espera vX.X.X)`);
  }
  if (wanted !== version) {
    fail(`el tag v${wanted} no coincide con package.json (${version})`);
  }
  const exeName = `OmniAnime-Setup-${version}.exe`;
  for (const name of [exeName, `${exeName}.blockmap`, 'latest.yml', 'release-notes.md']) {
    const stat = await fsp.stat(path.join(dir, name)).catch(() => null);
    if (!stat || !stat.isFile() || stat.size === 0) {
      fail(`${name} falta o está vacío en ${dir}`);
    }
  }
  const yml = await fsp.readFile(path.join(dir, 'latest.yml'), 'utf8');
  const { version: ymlVersion, topPath, entry } = parseLatestYml(yml, exeName);
  if (ymlVersion !== version) {
    fail(`latest.yml declara version ${ymlVersion ?? '(ausente)'}, se esperaba ${version}`);
  }
  if (topPath && topPath !== exeName) {
    fail(`latest.yml apunta a ${topPath}, se esperaba ${exeName}`);
  }
  if (!entry || !entry.sha512 || entry.size === null || entry.size === undefined) {
    fail(`latest.yml no trae sha512/size para ${exeName}`);
  }
  const exePath = path.join(dir, exeName);
  const actualSha = await sha512Base64(exePath);
  if (actualSha !== entry.sha512) {
    fail(`sha512 de ${exeName} no coincide con latest.yml`);
  }
  const { size } = await fsp.stat(exePath);
  if (size !== entry.size) {
    fail(`size de ${exeName} (${size}) no coincide con latest.yml (${entry.size})`);
  }
  console.log(`Artefactos ${version} verificados: ${exeName} (${size} bytes, sha512 OK).`);
}

const isDirectRun = !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((err) => {
    console.error(`verify-release-artifacts falló: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
