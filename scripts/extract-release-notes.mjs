// Extrae la seccion de una version desde CHANGELOG.md para las notas del release.
// Uso: node scripts/extract-release-notes.mjs <version> [--changelog <ruta>] [--output <ruta>]
// Sin --output imprime por stdout. Falla si la version no existe o esta vacia.

import { promises as fsp } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function normalizeHeading(line) {
  const match = line.match(/^##\s+\[?v?([0-9]+\.[0-9]+\.[0-9]+)\]?\b/);
  return match ? match[1] : null;
}

function normalizeVersion(version) {
  return version.startsWith('v') ? version.slice(1) : version;
}

export function extractReleaseNotes(markdown, version) {
  const wanted = normalizeVersion(String(version));
  const lines = markdown.split(/\r?\n/);
  let capturing = false;
  const collected = [];
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (capturing) break;
      if (normalizeHeading(line) === wanted) capturing = true;
      continue;
    }
    if (capturing) collected.push(line);
  }
  if (!capturing) throw new Error(`Version ${wanted} no encontrada en el changelog`);
  const notes = collected.join('\n').trim();
  if (!notes) throw new Error(`Version ${wanted} sin contenido en el changelog`);
  return notes;
}

function readArgValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : null;
}

async function main() {
  const args = process.argv.slice(2);
  const rawVersion = args.find((arg) => !arg.startsWith('--')) || null;
  const version = rawVersion ? normalizeVersion(rawVersion) : null;
  if (!version || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version)) {
    throw new Error('Uso: extract-release-notes.mjs <X.Y.Z> [--changelog <ruta>] [--output <ruta>]');
  }
  const changelogPath = readArgValue(args, '--changelog') || path.join(ROOT, 'CHANGELOG.md');
  let markdown;
  try {
    markdown = await fsp.readFile(changelogPath, 'utf8');
  } catch {
    throw new Error(`No se pudo leer ${changelogPath}`);
  }
  const notes = extractReleaseNotes(markdown, version);
  const outputPath = readArgValue(args, '--output');
  if (outputPath) {
    await fsp.writeFile(outputPath, `${notes}\n`, 'utf8');
  } else {
    process.stdout.write(`${notes}\n`);
  }
}

const isDirectRun = !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((err) => {
    console.error(`extract-release-notes fallo: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
