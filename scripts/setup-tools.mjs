// Descarga verificada de los binarios externos a tools/win/.
// Uso: node scripts/setup-tools.mjs [--force] [--check]
// Solo Windows (objetivo de distribucion del proyecto).
// Garantia: el binario de tools/win/ solo se reemplaza por rename atomico
// despues de verificar SHA256 + version; un fallo deja el anterior intacto.

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, promises as fsp } from 'node:fs';
import { get } from 'node:https';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TOOLS_DIR = path.join(ROOT, 'tools', 'win');
const VERSIONS_FILE = path.join(ROOT, 'scripts', 'tools-versions.json');
const MAX_REDIRECTS = 5;

function runExe(exe, args, timeoutMs) {
  return new Promise((resolve) => {
    execFile(exe, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout) => {
      if (err) return resolve(null);
      resolve(String(stdout || ''));
    });
  });
}

function fetchToFile(url, dest, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error(`URL invalida: ${url}`));
      return;
    }
    if (parsed.protocol !== 'https:') {
      reject(new Error(`Solo se permiten URLs https: ${url}`));
      return;
    }
    const req = get(
      parsed,
      { headers: { 'User-Agent': 'OmniAnime-setup-tools' }, signal: AbortSignal.timeout(600_000) },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location && redirectsLeft > 0) {
          res.resume();
          resolve(fetchToFile(new URL(res.headers.location, parsed).toString(), dest, redirectsLeft - 1));
          return;
        }
        if (status !== 200) {
          res.resume();
          reject(new Error(`Descarga fallida (${status}): ${url}`));
          return;
        }
        const out = createWriteStream(dest);
        res.pipe(out);
        out.on('finish', () => resolve());
        out.on('error', reject);
        res.on('error', reject);
      },
    );
    req.on('error', reject);
  });
}

async function sha256Of(filePath) {
  const hash = createHash('sha256');
  hash.update(await fsp.readFile(filePath));
  return hash.digest('hex');
}

async function removeQuiet(target) {
  await fsp.unlink(target).catch(() => {});
}

function stagedPath(finalName) {
  return path.join(TOOLS_DIR, `${finalName}.download-${process.pid}-${Date.now()}`);
}

async function sweepStaleStaged() {
  let entries = [];
  try {
    entries = await fsp.readdir(TOOLS_DIR);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.includes('.download-')) await removeQuiet(path.join(TOOLS_DIR, entry));
  }
}

async function probeFfmpegTool(exe, kind, version) {
  const out = await runExe(exe, ['-version'], 15_000);
  const firstLine = (out || '').split(/\r?\n/)[0] || '';
  return firstLine.startsWith(`${kind} version ${version}`);
}

async function ensureFfmpegTools(ffmpegPin, ffprobePin, force) {
  const ffmpegDest = path.join(TOOLS_DIR, 'ffmpeg.exe');
  const ffprobeDest = path.join(TOOLS_DIR, 'ffprobe.exe');
  if (
    !force &&
    (await probeFfmpegTool(ffmpegDest, 'ffmpeg', ffmpegPin.version)) &&
    (await probeFfmpegTool(ffprobeDest, 'ffprobe', ffprobePin.version))
  ) {
    console.log(`ffmpeg/ffprobe ${ffmpegPin.version} ya estan instalados.`);
    return false;
  }
  if (process.platform !== 'win32') {
    throw new Error('La extraccion de ffmpeg requiere Windows (Expand-Archive).');
  }
  const stamp = `${process.pid}-${Date.now()}`;
  const tmpZip = path.join(tmpdir(), `omnianime-ffmpeg-${stamp}.zip`);
  const tmpDir = path.join(tmpdir(), `omnianime-ffmpeg-${stamp}`);
  const stagedFfmpeg = stagedPath('ffmpeg.exe');
  const stagedFfprobe = stagedPath('ffprobe.exe');
  try {
    console.log('Descargando paquete ffmpeg...');
    await fetchToFile(ffmpegPin.url, tmpZip);
    const actual = await sha256Of(tmpZip);
    if (actual.toLowerCase() !== ffmpegPin.sha256.toLowerCase()) {
      throw new Error(`SHA256 del paquete ffmpeg no coincide (esperado ${ffmpegPin.sha256}, obtenido ${actual})`);
    }
    console.log('Extrayendo ffmpeg.exe y ffprobe.exe...');
    await new Promise((resolve, reject) => {
      execFile(
        'powershell',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Expand-Archive -LiteralPath ${JSON.stringify(tmpZip)} -DestinationPath ${JSON.stringify(tmpDir)} -Force`,
        ],
        { timeout: 300_000, windowsHide: true },
        (err) => (err ? reject(err) : resolve()),
      );
    });
    const ffmpegExe = await findInDir(tmpDir, ffmpegPin.exePathInArchive);
    const ffprobeExe = await findInDir(tmpDir, ffprobePin.exePathInArchive);
    if (!ffmpegExe || !ffprobeExe) {
      throw new Error('No se encontraron bin/ffmpeg.exe y/o bin/ffprobe.exe en el paquete descargado.');
    }
    await fsp.mkdir(TOOLS_DIR, { recursive: true });
    await fsp.copyFile(ffmpegExe, stagedFfmpeg);
    await fsp.copyFile(ffprobeExe, stagedFfprobe);
    if (!(await probeFfmpegTool(stagedFfmpeg, 'ffmpeg', ffmpegPin.version))) {
      throw new Error(`ffmpeg extraido no reporta la version fijada (${ffmpegPin.version})`);
    }
    if (!(await probeFfmpegTool(stagedFfprobe, 'ffprobe', ffprobePin.version))) {
      throw new Error(`ffprobe extraido no reporta la version fijada (${ffprobePin.version})`);
    }
    await fsp.rename(stagedFfmpeg, ffmpegDest);
    await fsp.rename(stagedFfprobe, ffprobeDest);
    console.log(`ffmpeg/ffprobe ${ffmpegPin.version} verificados y guardados.`);
    return true;
  } catch (err) {
    await removeQuiet(stagedFfmpeg);
    await removeQuiet(stagedFfprobe);
    throw err;
  } finally {
    await removeQuiet(tmpZip);
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function findInDir(dir, suffix) {
  const wanted = suffix.toLowerCase().replace(/\\/g, '/');
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findInDir(full, suffix);
      if (found) return found;
    } else if (full.toLowerCase().replace(/\\/g, '/').endsWith(wanted)) {
      return full;
    }
  }
  return null;
}

function requireFields(pins, key, fields) {
  const entry = pins[key];
  if (!entry || typeof entry !== 'object') throw new Error(`tools-versions.json: falta la entrada "${key}"`);
  for (const field of fields) {
    if (!entry[field]) throw new Error(`tools-versions.json: "${key}" no fija "${field}"`);
  }
  return entry;
}

function loadPins(raw) {
  let pins;
  try {
    pins = JSON.parse(raw);
  } catch {
    throw new Error('tools-versions.json no es un JSON valido');
  }
  const ffmpeg = requireFields(pins, 'ffmpeg', ['version', 'url', 'sha256', 'variant', 'exePathInArchive']);
  const ffprobe = requireFields(pins, 'ffprobe', ['version', 'fromPackage', 'exePathInArchive']);
  if (ffprobe.fromPackage !== 'ffmpeg') {
    throw new Error('tools-versions.json: ffprobe solo puede provenir del paquete ffmpeg');
  }
  return { ffmpeg, ffprobe };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const force = args.has('--force');
  const checkOnly = args.has('--check');
  let raw;
  try {
    raw = await fsp.readFile(VERSIONS_FILE, 'utf8');
  } catch {
    throw new Error('No se pudo leer scripts/tools-versions.json');
  }
  const pins = loadPins(raw);

  if (checkOnly) {
    const ffmpegOk = await probeFfmpegTool(path.join(TOOLS_DIR, 'ffmpeg.exe'), 'ffmpeg', pins.ffmpeg.version);
    const ffprobeOk = await probeFfmpegTool(path.join(TOOLS_DIR, 'ffprobe.exe'), 'ffprobe', pins.ffprobe.version);
    console.log(`ffmpeg: ${ffmpegOk ? 'OK' : 'FALTA/DESACTUALIZADO'}`);
    console.log(`ffprobe: ${ffprobeOk ? 'OK' : 'FALTA/DESACTUALIZADO'}`);
    process.exit(ffmpegOk && ffprobeOk ? 0 : 1);
  }

  await fsp.mkdir(TOOLS_DIR, { recursive: true });
  await sweepStaleStaged();
  await ensureFfmpegTools(pins.ffmpeg, pins.ffprobe, force);
  console.log('Herramientas listas en tools/win/.');
}

const isDirectRun = !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((err) => {
    console.error(`setup-tools fallo: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}

export { findInDir };
