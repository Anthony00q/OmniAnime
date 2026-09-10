# Recrear mejoras de servidores: PDrain retirado + MediaFire + MP4Upload + Mega

Guía autocontenida para rehacer, desde un árbol limpio anterior a todos los
cambios, SOLO estas cuatro piezas. El código copiado aquí funciona sin probe (todos los hooks
`probe?.` son no-op con `undefined`) y sin ningún módulo que no esté en esta
guía.

## 0. Cómo usar esta guía

- Supuesto: `git status` limpio con F0 ya aplicada (PDrain retirado),
  Mega de un solo intento, MP4Upload solo por yt-dlp y MediaFire por axios de
  1 conexión.
- Orden obligatorio: F1 → F2 → F3 → F4. F1 es el suelo de seguridad;
  sin ella, los transports nuevos corren con razas.
- Aplica con la herramienta Edit (lee el archivo con Read antes de cada
  edición), en bloques exactos. Tras cada fase: `npm run build:main`,
  `npx tsc --project tsconfig.renderer.json --noEmit`, `npx eslint <ficheros>`,
  `npx prettier --check "src/**/*.{ts,tsx,css,html,js}"` y los tests que se
  indican. Revisa con `git diff` antes de seguir.
- Estilo: comillas simples, punto y coma, indent 2, ancho 120 (lo exige
  `format:check`).
- Scripts de prueba: escríbelos en `C:\Users\User\AppData\Local\Temp\opencode`
  (fuera del repo) y ejecútalos con
  `node --require ts-node/register/transpile-only <script>` desde la raíz
  del repo (con `NODE_PATH=<repo>\node_modules` si importan `axios` suelto).
  `tests/` es gitignored: existe solo en local.

## FASE 1 — Infraestructura mínima compartida

Sin esto, los transports de F2–F4 corren con razas de limpieza, robos entre
episodios y falsos "iniciados". Todo lo de esta fase es requisito.

### 1.1 `src/utils/serverUtils.ts`: referer por proveedor

Añadir al final del fichero:

```ts
// Referer del proveedor de origen para descargas directas. El contexto del
// proveedor (nunca un hardcode global) decide la cabecera.
export function providerDownloadReferer(providerId?: string): string {
  if (
    String(providerId || '')
      .trim()
      .toLowerCase() === 'jkanime'
  )
    return 'https://jkanime.net/';
  return 'https://animeav1.com/';
}
```

### 1.2 NUEVO `src/services/DownloadCleanupTracker.ts` (contenido completo)

```ts
import * as fsp from 'fs/promises';

// Limpieza diferida con identidad por generación: un cleanup programado por el
// intento N nunca borra archivos reclamados por un intento N+1 del mismo destino.
// Sin esto, el timer diferido de un abort/fallo (300ms/5s, necesario en Windows
// para soltar handles abiertos) podía borrar el temporal de un retry recién
// nacido, ya que todos los transportes comparten `.cache/<base>`.
export class DownloadCleanupTracker {
  private generations = new Map<string, number>();
  private pendingTimers = new Map<string, NodeJS.Timeout>();

  current(key: string): number {
    return this.generations.get(key) ?? 0;
  }

  // Reclama el destino para un intento nuevo: cancela cualquier limpieza
  // pendiente del intento anterior y devuelve la generación vigente.
  begin(key: string): number {
    this.cancel(key);
    const next = this.current(key) + 1;
    this.generations.set(key, next);
    return next;
  }

  isCurrent(key: string, generation: number): boolean {
    return this.current(key) === generation;
  }

  cancel(key: string): void {
    const timer = this.pendingTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.pendingTimers.delete(key);
    }
  }

  // Borra `files` tras `delayMs`, solo si ningún intento nuevo reclamó `key`.
  schedule(key: string, generation: number, files: string[], delayMs: number): void {
    if (!this.isCurrent(key, generation)) return;
    this.cancel(key);
    const timer = setTimeout(() => {
      this.pendingTimers.delete(key);
      if (!this.isCurrent(key, generation)) return;
      void Promise.allSettled(files.map((file) => fsp.rm(file, { force: true })));
    }, delayMs);
    if (typeof timer.unref === 'function') timer.unref();
    this.pendingTimers.set(key, timer);
  }
}
```

### 1.3 `src/services/DownloadService.ts`: tracker + consts + firma tools

1. Imports: añadir
   `import { DownloadCleanupTracker } from './DownloadCleanupTracker';`
2. Añadir consts (junto a los agents del fichero):
```ts
const DIRECT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const DEFAULT_DOWNLOAD_REFERER = 'https://animeav1.com/';
```
   Y sustituir sus dos usos inline: en la descarga directa
   `Referer: 'https://animeav1.com/'` → `Referer: typeof referer === 'string' && referer ? referer : DEFAULT_DOWNLOAD_REFERER,`
   y `'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',` → `'User-Agent': DIRECT_USER_AGENT,` (hay dos sitios: descarga directa y fetch de página MediaFire; cambia ambos).
3. Campo: borrar `private cleanupTokens = new Map<string, number>();` y poner
   `private readonly cleanupTracker = new DownloadCleanupTracker();`
4. En `downloadDirectAxiosOnce`: firma
```ts
  private async downloadDirectAxiosOnce(
    url: string,
    dest: string,
    onProgress: (p: number) => void,
    signal?: AbortSignal,
    probe?: AttemptProbe,
    generation?: number,
    referer?: string,
  ): Promise<boolean> {
```
   (`AttemptProbe` se importa de `./Aria2cTransport`, ver F2; si aplicas F1
   aislada, declara temporalmente `type AttemptProbe = any` —no, mejor:
   importa el tipo desde `./Aria2cTransport` solo cuando exista el fichero;
   en F1 puedes dejar `probe?: any` y tiparlo en F2. Recomendado: haz F1+F2
   seguidas o deja el `any` temporal con un `// TODO F2`.)
   Bloque cleanup: reemplazar el bloque `cleanupTokens`/`cleanupToken`/
   `setTimeout 300ms` (con sus dos `fsp.unlink`, incluido el de `dest`) por:
```ts
    const tempDest = path.join(cacheDir, path.basename(dest));
    // Identidad por intento: reclamar el destino cancela limpiezas diferidas del
    // intento anterior y el cleanup solo borra si sigue vigente esta generación.
    // El fallo nunca toca `dest`: solo existe tras un rename de éxito.
    const cleanupKey = path.resolve(dest).toLowerCase();
    const cleanupGeneration = generation ?? this.cleanupTracker.begin(cleanupKey);

    const cleanupFiles = () => {
      this.cleanupTracker.schedule(cleanupKey, cleanupGeneration, [tempDest], 300);
    };
```
   (OJO: se elimina el `fsp.unlink(dest)` del fallo: borrar el final en
   fallo solo podía destruir datos válidos.)
5. En el handler `data` del axios directo, tras `downloadedLength += chunk.length;`
   añadir `probe?.onFirstByte();` y cambiar el `if (totalLength > 0)` por:
```ts
        probe?.onFirstByte();
        if (totalLength > 0) {
          onProgress(downloadedLength / totalLength);
          probe?.onProgress(downloadedLength / totalLength, totalLength);
        }
```
   Y tras leer headers añadir:
```ts
      const acceptRangesHeader = response.headers['accept-ranges'];
      probe?.onResponseHeaders(
        typeof acceptRangesHeader === 'string' ? acceptRangesHeader : null,
        Number.isFinite(totalLength) && totalLength > 0 ? totalLength : null,
      );
```
6. En el `catch` de la descarga directa, dentro del `else` (no-abort),
   añadir como primera línea:
   `if (typeof e?.response?.status === 'number') probe?.onHttpStatus(e.response.status);`
7. `YtdlpRuntimeTools`: añadir el campo
   `// aria2c 1.37.0 empaquetado (tools/win): ausente hasta npm run setup:tools.`
   `aria2cPath?: string;`

### 1.4 Binario aria2c 1.37.0 (pin + descarga verificada)

1. `scripts/tools-versions.json`: añadir la entrada (orden alfabético, antes
   de `ffmpeg`):
```json
  "aria2c": {
    "exePathInArchive": "aria2-1.37.0-win-64bit-build1/aria2c.exe",
    "license": "GPL-2.0-or-later (build oficial tatsuhiro-t)",
    "name": "aria2c",
    "sha256": "67d015301eef0b612191212d564c5bb0a14b5b9c4796b76454276a4d28d9b288",
    "source": "github.com/aria2/aria2 (release oficial 1.37.0)",
    "url": "https://github.com/aria2/aria2/releases/download/release-1.37.0/aria2-1.37.0-win-64bit-build1.zip",
    "variant": "win-64bit build1",
    "version": "1.37.0"
  },
```
2. `scripts/setup-tools.mjs` (insertar antes de `async function ensureYtdlp...`
   la primera, y antes de `async function findInDir(dir, suffix) {` la segunda):
```js
async function probeAria2c(exe, version) {
  const out = await runExe(exe, ['--version'], 15_000);
  const firstLine = (out || '').split(/\r?\n/)[0] || '';
  return firstLine.startsWith(`aria2 version ${version}`);
}
```
```js
async function ensureAria2c(pinned, force) {
  const dest = path.join(TOOLS_DIR, 'aria2c.exe');
  if (!force && (await probeAria2c(dest, pinned.version))) {
    console.log(`aria2c ${pinned.version} ya esta instalado.`);
    return false;
  }
  if (process.platform !== 'win32') {
    throw new Error('La extraccion de aria2c requiere Windows (Expand-Archive).');
  }
  const stamp = `${process.pid}-${Date.now()}`;
  const tmpZip = path.join(tmpdir(), `omnianime-aria2c-${stamp}.zip`);
  const tmpDir = path.join(tmpdir(), `omnianime-aria2c-${stamp}`);
  const staged = stagedPath('aria2c.exe');
  try {
    console.log('Descargando paquete aria2c...');
    await fetchToFile(pinned.url, tmpZip);
    const actual = await sha256Of(tmpZip);
    if (actual.toLowerCase() !== pinned.sha256.toLowerCase()) {
      throw new Error(`SHA256 del paquete aria2c no coincide (esperado ${pinned.sha256}, obtenido ${actual})`);
    }
    console.log('Extrayendo aria2c.exe...');
    await new Promise((resolve, reject) => {
      execFile(
        'powershell',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Expand-Archive -LiteralPath ${JSON.stringify(tmpZip)} -DestinationPath ${JSON.stringify(tmpDir)} -Force`,
        ],
        { timeout: 120_000, windowsHide: true },
        (err) => (err ? reject(err) : resolve()),
      );
    });
    const aria2cExe = await findInDir(tmpDir, pinned.exePathInArchive);
    if (!aria2cExe) {
      throw new Error('No se encontro aria2c.exe en el paquete descargado.');
    }
    await fsp.mkdir(TOOLS_DIR, { recursive: true });
    await fsp.copyFile(aria2cExe, staged);
    if (!(await probeAria2c(staged, pinned.version))) {
      throw new Error(`aria2c extraido no reporta la version fijada (${pinned.version})`);
    }
    await fsp.rename(staged, dest);
    console.log(`aria2c ${pinned.version} verificado y guardado.`);
    return true;
  } catch (err) {
    await removeQuiet(staged);
    throw err;
  } finally {
    await removeQuiet(tmpZip);
    await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
```
   En `loadPins`, tras la línea de ffprobe:
   `const aria2c = requireFields(pins, 'aria2c', ['version', 'url', 'sha256', 'exePathInArchive']);`
   y el `return` pasa a `return { ytdlp, ffmpeg, ffprobe, aria2c };`
   En `checkOnly`, añadir:
```js
    const aria2cOk = await probeAria2c(path.join(TOOLS_DIR, 'aria2c.exe'), pins.aria2c.version);
```
   `console.log('aria2c: ' + (aria2cOk ? 'OK' : 'FALTA/DESACTUALIZADO'));`
   y el exit pasa a `process.exit(ytdlpOk && ffmpegOk && ffprobeOk && aria2cOk ? 0 : 1);`
   En el flujo principal, tras `await ensureFfmpegTools(...)`:
   `await ensureAria2c(pins.aria2c, force);`
   (NO copiar nada de `nm3u8dlre`: es de otra fase, fuera de alcance.)
3. `src/main/runtimePaths.ts`: añadir
```ts
export function getAria2cExecutablePath(): string {
  return path.join(getToolsDir(), 'aria2c.exe');
}
```
   y en `getYtdlpRuntimeTools`: `const bundledAria2c = getAria2cExecutablePath();`
   más el campo `aria2cPath: fs.existsSync(bundledAria2c) ? bundledAria2c : undefined,`
4. `THIRD-PARTY-NOTICES.md`: añadir sección (entre yt-dlp y ffmpeg):
```md
## aria2c 1.37.0 (`aria2c.exe`)

- Origen: release oficial `aria2/aria2`
  (`https://github.com/aria2/aria2/releases/tag/release-1.37.0`).
- Binario: `https://github.com/aria2/aria2/releases/download/release-1.37.0/aria2-1.37.0-win-64bit-build1.zip`
  (build oficial win-64bit; se extrae `aria2c.exe`), SHA-256 fijado en
  `tools-versions.json`.
- Licencia: **GPL-2.0-or-later**. Se distribuye el binario sin modificar.
- Código fuente correspondiente: tarball del tag
  `https://github.com/aria2/aria2/releases/download/release-1.37.0/aria2-1.37.0.tar.gz`
  (desarrollo en `https://github.com/aria2/aria2`).
- Obligaciones al distribuir el instalador de OmniAnime:
  1. Conservar este aviso junto a los binarios (este archivo viaja en el
     instalador vía `extraResources`).
  2. Ofrecer el código fuente correspondiente: la URL del tarball de
     arriba es la vía documentada para obtenerlo.
```
5. `docs/binarios-y-releases.md`: añadir a la lista de fuente de verdad:
   `- **aria2c** 1.37.0 variante win-64bit-build1 — release oficial aria2/aria2 (zip con aria2c.exe, SHA256 verificado + probe 'aria2 version 1.37.0'). Transporte multihilo de descargas directas.`
6. Descargar y verificar: `npm run setup:tools` y luego
   `node scripts/setup-tools.mjs --check` debe dar 4 OK (yt-dlp, ffmpeg,
   ffprobe, aria2c). `aria2c.exe --version` debe empezar por
   `aria2 version 1.37.0`.

### 1.5 `src/services/EpisodeDownloadAttemptService.ts`: claim + rename seguro

1. Imports: añadir
   `import { aria2cResumeFiles } from './Aria2cTransport';`
   (el fichero aún no existe: créalo vacío temporalmente o deja este import
   para F2; el build de F1 lo necesita —recomendado: crear ya F2/F3/F4 como
   ficheros vacíos NO, mejor haz F1+F2 seguidas. Si haces F1 aislada,
   retrasa este import y el claim a F2.)
   NOTA PRÁCTICA: el claim solo cobra sentido con el transporte aria2c;
   puedes mover los puntos 2–5 de esta sección a F2. Aquí van juntos porque
   comparten fichero.
2. Helper + tipos (pegar tras `fileExistsAsync`):
```ts
export interface DownloadCandidateState {
  size: number;
  mtimeMs: number;
}

export type DownloadCandidateBaseline = Map<string, DownloadCandidateState>;

// Un rename de rescate solo puede reclamar archivos con el mismo stem del destino
// (`base + .ext`). Sin esto, el EP 1 podía robar el mp4 recién escrito de un EP
// vecino en paralelo (`Title - 01` es prefijo de `Title - 010`) o de cualquier
// otro archivo de vídeo que creciera en la misma carpeta.
export function isSameStemCandidate(destFileName: string, candidateName: string): boolean {
  if (!destFileName || !candidateName) return false;
  if (candidateName.endsWith('.part') || candidateName.endsWith('.ytdl')) return false;
  const base = destFileName.replace(/\.mp4$/i, '');
  if (candidateName === destFileName || candidateName === base) return true;
  if (!candidateName.startsWith(base)) return false;
  return candidateName[base.length] === '.';
}
```
3. Claim al iniciar intento directo: en `attempt()`, antes del pre-check de
   `hasDownloadStartedOnDiskAsync(dest)`, insertar:
```ts
    // Claim de temporales al iniciar intento directo (Mega/Mediafire/
    // MP4Upload): cada transporte solo reclama lo suyo. axios nunca reanuda
    // (su temporal se barre siempre); aria2c y mega conservan su conjunto
    // reanudable solo con allowContinue + misma URL (otra URL = otro encode
    // posible: purga obligatoria). El `.part`/`.ytdl` de yt-dlp es suyo
    // (hasPartial/cleanYtdlpCache): aquí no se toca.
    if (link.server === 'Mega' || link.server === 'Mediafire' || link.server === 'MP4Upload') {
      await this.claimFreshDirectTemps(dest, dl.allowContinue, link.url);
    }
```
   (`dl` es el `normalizeDownloadSettings(...)` ya existente al inicio de
   `attempt()`; `link.url` es la URL del servidor para este EP.)
4. Método `claimFreshDirectTemps` (pegar como método privado; en F1 solo
   existe el trío aria2c —la parte mega se añade en F4—):
```ts
  private async claimFreshDirectTemps(destPath: string, allowContinue: boolean, sourceUrl: string): Promise<void> {
    const cacheDir = path.join(path.dirname(destPath), '.cache');
    const baseName = path.basename(destPath);
    const { partial: ariaPartial, control: ariaControl, urlSidecar: ariaSidecar } = aria2cResumeFiles(
      cacheDir,
      baseName,
    );
    const axiosTemp = path.join(cacheDir, baseName);
    const rmAll = (files: string[]): Promise<void> => {
      return Promise.all(files.map((file) => fsp.rm(file, { force: true })))
        .then(() => undefined)
        .catch(() => undefined);
    };
    const purgeAria = (): Promise<void> => rmAll([ariaPartial, ariaControl, ariaSidecar, axiosTemp]);
    if (!allowContinue) {
      await purgeAria();
      return;
    }
    let keepAria = false;
    try {
      const [controlStat, partialStat, boundUrl] = await Promise.all([
        fsp.stat(ariaControl),
        fsp.stat(ariaPartial),
        fsp.readFile(ariaSidecar, 'utf8'),
      ]);
      keepAria = controlStat.isFile() && partialStat.isFile() && boundUrl.trim() === sourceUrl;
    } catch {
      keepAria = false;
    }
    // axiosTemp comparte ruta con el parcial aria2c: vive dentro de purgeAria.
    // El `.part` de yt-dlp nunca se toca aquí (es suyo: hasPartial/cleanYtdlp).
    if (!keepAria) await purgeAria();
  }
```
   OJO: `axiosTemp` y el parcial aria2c son LA MISMA RUTA (sin sufijo): por
   eso solo se borra dentro de `purgeAria`, nunca antes.
5. `purgeAria2cResumeFiles` (para invalidMp4; pegar junto al claim):
```ts
  // Un mp4 inválido tras éxito de transporte envenena el resume: el parcial
  // retomado reproduciría el mismo archivo corrupto en bucle. Purga total.
  private async purgeAria2cResumeFiles(destPath: string): Promise<void> {
    const { partial, control, urlSidecar } = aria2cResumeFiles(
      path.join(path.dirname(destPath), '.cache'),
      path.basename(destPath),
    );
    await Promise.all([
      fsp.rm(partial, { force: true }),
      fsp.rm(control, { force: true }),
      fsp.rm(urlSidecar, { force: true }),
    ]).catch(() => undefined);
  }
```
6. Guard same-stem en los dos rescates de `ensureEpisodeMp4File*`:
   - En `ensureEpisodeMp4FileWithSnapshotAsync`, donde haya
     `if (name === path.basename(destPath)) continue;` → reemplazar por:
```ts
        if (!isSameStemCandidate(destFileName, name)) continue;
```
     (con `const destFileName = path.basename(destPath);` declarado justo
     antes del bucle, donde hoy se usa `path.basename(destPath)`).
   - En `ensureEpisodeMp4FileAsync`, reemplazar estas dos líneas:
```ts
        if (name === fileName || !name.startsWith(baseName)) continue;
        if (name.endsWith('.part') || name.endsWith('.ytdl')) continue;
```
     por:
```ts
        if (name === fileName) continue;
        if (!isSameStemCandidate(fileName, name)) continue;
```
7. `cleanEpisodeTemps`: dentro del `Promise.allSettled`, añadir tras las
   líneas de `destPath`:
```ts
      fsp.rm(cacheBase, { force: true }),
      fsp.rm(cacheBase + '.part', { force: true }),
```
   donde `const cacheBase = path.join(path.dirname(destPath), '.cache', path.basename(destPath));`
   se declara justo antes del `Promise.allSettled`. (Sin esto, los
   temporales de `.cache/` sobrevivían y contaminaban el siguiente intento.)
8. `hasDownloadStartedOnDiskAsync`: añadir parámetro opcional y candidato:
   - Firma: `async hasDownloadStartedOnDiskAsync(destPath: string, baseline?: DownloadCandidateBaseline)`
   - Lógica: sin baseline, existencia == iniciado (igual que hoy); con
     baseline, solo cuenta archivo nuevo (`!prev`) o crecido
     (`st.size > prev.size || st.mtimeMs > prev.mtimeMs`).
   - Añadir `${cachePath}.mega.part` a la lista de candidatos (harmless
     hasta F4; evita tocarlo dos veces).
   - Nuevo método:
```ts
  async snapshotDownloadCandidatesAsync(destPath: string): Promise<DownloadCandidateBaseline> {
    const cacheDir = path.join(path.dirname(destPath), '.cache');
    const cachePath = path.join(cacheDir, path.basename(destPath));
    const candidates = [
      destPath,
      `${destPath}.part`,
      `${destPath}.ytdl`,
      cachePath,
      `${cachePath}.part`,
      `${cachePath}.ytdl`,
      `${cachePath}.mega.part`,
    ];
    const out: DownloadCandidateBaseline = new Map();
    for (const p of candidates) {
      try {
        const st = await fsp.stat(p);
        if (st.isFile()) out.set(p, { size: st.size, mtimeMs: st.mtimeMs });
      } catch {
        /* no existe */
      }
    }
    return out;
  }
```
   - En `attempt()`, tras el pre-check: tomar baseline
     `const downloadBaseline = await this.snapshotDownloadCandidatesAsync(dest).catch(() => new Map<...>());`
     y pasarla en el callback del `startTimeout`:
     `if (await this.hasDownloadStartedOnDiskAsync(dest, downloadBaseline))`
     (así un resto huérfano no anula el timeout).
9. En `if (!mp4Ready)` (tras `invalidMp4 = true;`), añadir:
   `if (link.server === 'Mediafire' || link.server === 'MP4Upload') await this.purgeAria2cResumeFiles(dest);`
   (la línea de Mega se añade en F4).

### 1.6 Validación F1

`npm run build:main`, `typecheck:renderer`, `lint`, `format:check`,
`node --require ts-node/register --test tests/*.test.ts` (deben pasar los
existentes; si alguno menciona PDrain, actualízalo a la allowlist sin
PDrain ya aplicada: `normalizeServerName('Pixeldrain')` pasa crudo y la
allowlist lo bloquea, no es canónico).

## FASE 2 — MediaFire vía aria2c (primario) + axios (fallback)

### 2.1 NUEVO `src/services/Aria2cTransport.ts` (contenido completo)

Adaptado sin sistema de métricas: `AttemptProbe` se define aquí (todos los
hooks opcionales; sin probe todo funciona) y `parseSizeToBytes` es local.
Recortes frente al original: fuera `scheduleCleanup` (nunca llegó a usarse)
y `Aria2cRequestHeaders` (sin usos). Todo lo demás, verbatim:

```ts
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import axios from 'axios';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { terminateChildProcessTree } from '../utils/processUtils';

// Hooks opcionales de observabilidad. Sin probe, el transporte funciona igual.
export interface AttemptProbe {
  onFirstByte(): void;
  onProgress(fraction01: number, totalBytes: number | null): void;
  onRetry(): void;
  onHttpStatus(status: number): void;
  onResponseHeaders(acceptRanges: string | null, contentLength: number | null): void;
  onRangeProbe(status: number | null, supported: boolean): void;
  onTransportSwitch(transport: string, connections: number): void;
}

export function parseSizeToBytes(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const match = String(raw)
    .trim()
    .match(/^~?\s*([\d.,]+)\s*([KMGTPE]?i?B)$/i);
  if (!match) return null;
  const value = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(value) || value < 0) return null;
  const unit = match[2].toLowerCase();
  const factor = unit.startsWith('k')
    ? 1024
    : unit.startsWith('m')
      ? 1024 ** 2
      : unit.startsWith('g')
        ? 1024 ** 3
        : unit.startsWith('t')
          ? 1024 ** 4
          : 1;
  return Math.floor(value * factor);
}

// Transporte aria2c multihilo para HTTP directo. Primario para Mediafire con
// fallback a axios single-connection. Reglas: sin 206 real no hay multihilo;
// sin control `.aria2` no hay resume; axios siempre reescribe desde cero
// (nunca continúa un parcial ajeno).

export const ARIA2C_VERSION = '1.37.0';
export const ARIA2C_DEFAULT_CONNECTIONS = 8;
export const ARIA2C_MIN_USEFUL_CONNECTIONS = 4;
export const ARIA2C_MAX_CONNECTIONS = 16;
export const ARIA2C_GLOBAL_CONNECTION_CAP = 24;
export const ARIA2C_RANGE_PROBE_TIMEOUT_MS = 10_000;
const STDERR_LIMIT = 20_000;

export type Aria2cOutcome = 'ok' | 'failed' | 'unavailable';

export interface RangeProbeResult {
  supported: boolean;
  status: number | null;
  totalBytes: number | null;
  acceptRanges: string | null;
}

export interface Aria2cProgress {
  fraction: number;
  downloadedBytes: number | null;
  totalBytes: number | null;
  connections: number | null;
  speedBps: number | null;
}

export type Aria2cSpawnFn = (exe: string, args: string[], options: { windowsHide: boolean }) => ChildProcess;

export type RangeRequestFn = (
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
  signal?: AbortSignal,
) => Promise<{ status: number | null; contentRange: string | null; acceptRanges: string | null }>;

// 206 + Content-Range bien formado, o nada. El Accept-Ranges por sí solo no
// basta: hay servidores que lo anuncian y luego ignoran el Range.
export function validateRangeProbe(
  status: number | null,
  contentRange: string | null,
): { supported: boolean; totalBytes: number | null } {
  if (status !== 206 || !contentRange) return { supported: false, totalBytes: null };
  const match = contentRange.trim().match(/^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i);
  if (!match) return { supported: false, totalBytes: null };
  return { supported: true, totalBytes: match[3] === '*' ? null : Number(match[3]) };
}

export function parseAria2cProgressLine(line: string): Aria2cProgress | null {
  const match = line.match(/\[#\S+\s+(\S+)\/(\S+)\(([\d.]+)%\)(?:\s+CN:(\d+))?(?:\s+DL:(\S+))?/);
  if (!match) return null;
  const fraction = Number(match[3]) / 100;
  if (!Number.isFinite(fraction)) return null;
  const totalRaw = parseSizeToBytes(match[2]);
  return {
    fraction: Math.max(0, Math.min(1, fraction)),
    downloadedBytes: parseSizeToBytes(match[1]),
    totalBytes: totalRaw !== null && totalRaw > 0 ? totalRaw : null,
    connections: match[4] !== undefined ? Number.parseInt(match[4], 10) : null,
    speedBps: match[5] !== undefined ? parseSizeToBytes(match[5]) : null,
  };
}

export interface Aria2cArgsInput {
  url: string;
  destDir: string;
  fileName: string;
  connections: number;
  userAgent: string;
  referer: string;
  resume: boolean;
}

export function buildAria2cArgs(input: Aria2cArgsInput): string[] {
  const connections = Math.max(1, Math.min(ARIA2C_MAX_CONNECTIONS, Math.floor(input.connections) || 1));
  const args = [
    '-d',
    input.destDir,
    '-o',
    input.fileName,
    '-x',
    String(connections),
    '-s',
    String(connections),
    '-k',
    '1M',
    '--file-allocation=none',
    '--auto-file-renaming=false',
    '--allow-overwrite=true',
    '--check-certificate=true',
    '--console-log-level=warn',
    '--summary-interval=1',
    '--timeout=30',
    '--connect-timeout=15',
    '--max-tries=2',
    '--retry-wait=2',
    '--disk-cache=1M',
    `--user-agent=${input.userAgent}`,
    `--referer=${input.referer}`,
  ];
  if (input.resume) args.push('-c');
  args.push(input.url);
  return args;
}

// Plan de resume: solo con control `.aria2` existe continuación (-c). Sin él,
// cualquier parcial es huérfano y se barre (axios nunca reanuda: trunca).
// El sidecar `.url` viaja siempre con el conjunto: liga el parcial a su URL.
export function resolveAria2cResumePlan(
  cacheDir: string,
  fileName: string,
  controlExists: boolean,
): { mode: 'resume' | 'fresh'; staleFiles: string[] } {
  const { partial, control, urlSidecar } = aria2cResumeFiles(cacheDir, fileName);
  if (controlExists) return { mode: 'resume', staleFiles: [] };
  return { mode: 'fresh', staleFiles: [partial, control, urlSidecar] };
}

// Rutas del conjunto reanudable en `.cache/`. El sidecar `.url` liga el
// parcial a la URL exacta que lo generó: reanudar otra URL mezclaría bytes de
// encodes distintos. Quien limpie el parcial debe limpiar el trío completo.
export function aria2cResumeFiles(
  cacheDir: string,
  fileName: string,
): { partial: string; control: string; urlSidecar: string } {
  const partial = path.join(cacheDir, fileName);
  const control = `${partial}.aria2`;
  return { partial, control, urlSidecar: `${control}.url` };
}

// Tope global de conexiones aria2c vivas: evita que EPs × conexiones por
// servidor multipliquen sin control (3 EPs × 16 pedirían 48).
export class Aria2cConnectionBudget {
  private active = 0;

  constructor(private readonly cap: number = ARIA2C_GLOBAL_CONNECTION_CAP) {}

  get activeConnections(): number {
    return this.active;
  }

  grant(requested: number): number {
    const available = this.cap - this.active;
    if (available < ARIA2C_MIN_USEFUL_CONNECTIONS) return 0;
    const granted = Math.max(0, Math.min(Math.floor(requested) || 0, available));
    if (granted < ARIA2C_MIN_USEFUL_CONNECTIONS) return 0;
    this.active += granted;
    return granted;
  }

  release(count: number): void {
    this.active = Math.max(0, this.active - Math.floor(count));
  }
}

// Perfil por servidor, solo-sesión: 8 por defecto (16 no se asume óptimo),
// degradación 16→12→8→4→0 (axios-only) ante congestión. Sin auto-subidas.
export class Aria2cProfileSelector {
  private readonly current = new Map<string, number>();

  constructor(initial: Record<string, number> = {}) {
    for (const [server, connections] of Object.entries(initial)) {
      if (Number.isInteger(connections) && connections >= 0) {
        this.current.set(server.toLowerCase(), connections);
      }
    }
  }

  profileFor(server: string): number {
    return this.current.get(String(server || '').toLowerCase()) ?? ARIA2C_DEFAULT_CONNECTIONS;
  }

  degrade(server: string): number {
    const key = String(server || '').toLowerCase();
    const current = this.profileFor(server);
    const next = current > 12 ? 12 : current > 8 ? 8 : current > 4 ? 4 : 0;
    this.current.set(key, next);
    return next;
  }

  reset(server: string): void {
    this.current.delete(String(server || '').toLowerCase());
  }
}

async function defaultRangeRequest(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<{ status: number | null; contentRange: string | null; acceptRanges: string | null }> {
  const headerOf = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
      headers: { ...headers, Range: 'bytes=0-0', 'Accept-Encoding': 'identity' },
      timeout: timeoutMs,
      signal: signal as never,
      maxRedirects: 5,
    });
    const out = {
      status: typeof response.status === 'number' ? response.status : null,
      contentRange: headerOf(response.headers?.['content-range']),
      acceptRanges: headerOf(response.headers?.['accept-ranges']),
    };
    try {
      response.data?.destroy?.();
    } catch {
      /* best-effort */
    }
    return out;
  } catch (e: unknown) {
    const response = (e as { response?: { status?: unknown; headers?: Record<string, unknown> } })?.response;
    return {
      status: typeof response?.status === 'number' ? response.status : null,
      contentRange: headerOf(response?.headers?.['content-range']),
      acceptRanges: headerOf(response?.headers?.['accept-ranges']),
    };
  }
}

export interface Aria2cProbeOptions {
  userAgent: string;
  referer: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  probe?: AttemptProbe;
  request?: RangeRequestFn;
}

export async function probeRangeSupport(url: string, options: Aria2cProbeOptions): Promise<RangeProbeResult> {
  const headers = { 'User-Agent': options.userAgent, Referer: options.referer };
  let raw: { status: number | null; contentRange: string | null; acceptRanges: string | null };
  try {
    raw = await (options.request ?? defaultRangeRequest)(
      url,
      headers,
      options.timeoutMs ?? ARIA2C_RANGE_PROBE_TIMEOUT_MS,
      options.signal,
    );
  } catch {
    raw = { status: null, contentRange: null, acceptRanges: null };
  }
  const { supported, totalBytes } = validateRangeProbe(raw.status, raw.contentRange);
  options.probe?.onRangeProbe(raw.status, supported);
  options.probe?.onResponseHeaders(raw.acceptRanges, totalBytes);
  return { supported, status: raw.status, totalBytes, acceptRanges: raw.acceptRanges };
}

export interface Aria2cDownloadParams {
  aria2cPath?: string;
  url: string;
  cacheDir: string;
  fileName: string;
  server: string;
  userAgent: string;
  referer: string;
  signal?: AbortSignal;
  probe?: AttemptProbe;
  onProgress?: (fraction01: number) => void;
}

export interface Aria2cTransportDeps {
  spawnFn?: Aria2cSpawnFn;
  budget?: Aria2cConnectionBudget;
  selector?: Aria2cProfileSelector;
  rangeRequest?: RangeRequestFn;
}

export class Aria2cTransport {
  readonly budget: Aria2cConnectionBudget;
  readonly selector: Aria2cProfileSelector;
  private readonly spawnFn: Aria2cSpawnFn;
  private readonly rangeRequest?: RangeRequestFn;
  private readonly activeChildren = new Set<ChildProcess>();

  constructor(deps: Aria2cTransportDeps = {}) {
    this.spawnFn = deps.spawnFn ?? ((exe, args, options) => spawn(exe, args, options));
    this.budget = deps.budget ?? new Aria2cConnectionBudget();
    this.selector = deps.selector ?? new Aria2cProfileSelector();
    this.rangeRequest = deps.rangeRequest;
  }

  abort(): void {
    for (const child of Array.from(this.activeChildren)) {
      try {
        terminateChildProcessTree(child);
      } catch {
        /* best-effort */
      }
    }
    this.activeChildren.clear();
  }

  async download(params: Aria2cDownloadParams): Promise<Aria2cOutcome> {
    const exe = params.aria2cPath;
    if (!exe || !fs.existsSync(exe)) return 'unavailable';
    const wanted = this.selector.profileFor(params.server);
    if (wanted <= 0) return 'unavailable';
    try {
      await fsp.mkdir(params.cacheDir, { recursive: true });
    } catch {
      return 'failed';
    }
    if (params.signal?.aborted) return 'failed';

    const range = await probeRangeSupport(params.url, {
      userAgent: params.userAgent,
      referer: params.referer,
      signal: params.signal,
      probe: params.probe,
      request: this.rangeRequest,
    });
    if (params.signal?.aborted) return 'failed';
    if (!range.supported) return 'unavailable';

    const granted = this.budget.grant(wanted);
    if (granted < ARIA2C_MIN_USEFUL_CONNECTIONS) return 'unavailable';

    const {
      partial: partialPath,
      control: controlPath,
      urlSidecar,
    } = aria2cResumeFiles(params.cacheDir, params.fileName);
    let resume = fs.existsSync(controlPath);
    if (resume && range.totalBytes !== null) {
      try {
        const st = await fsp.stat(partialPath);
        if (!st.isFile() || st.size > range.totalBytes) resume = false;
      } catch {
        resume = false;
      }
    }
    try {
      const plan = resolveAria2cResumePlan(params.cacheDir, params.fileName, resume);
      await Promise.all(plan.staleFiles.map((file) => fsp.rm(file, { force: true })));
    } catch {
      /* best-effort */
    }
    try {
      await fsp.writeFile(urlSidecar, params.url);
    } catch {
      /* sin sidecar no hay resume ligado: el claim lo purgará */
    }
    resume = fs.existsSync(controlPath);
    params.probe?.onTransportSwitch('aria2c', granted);

    const args = buildAria2cArgs({
      url: params.url,
      destDir: params.cacheDir,
      fileName: params.fileName,
      connections: granted,
      userAgent: params.userAgent,
      referer: params.referer,
      resume,
    });

    return await new Promise<Aria2cOutcome>((resolve) => {
      let child: ChildProcess;
      try {
        child = this.spawnFn(exe, args, { windowsHide: true });
      } catch {
        this.selector.degrade(params.server);
        this.budget.release(granted);
        resolve('failed');
        return;
      }
      this.activeChildren.add(child);
      let stderr = '';
      let settled = false;
      let pollTimer: NodeJS.Timeout | null = null;
      const finish = (outcome: Aria2cOutcome) => {
        if (settled) return;
        settled = true;
        if (pollTimer) clearInterval(pollTimer);
        if (params.signal) params.signal.removeEventListener('abort', onAbort);
        this.activeChildren.delete(child);
        this.budget.release(granted);
        resolve(outcome);
      };
      const onAbort = () => {
        try {
          terminateChildProcessTree(child);
        } catch {
          /* best-effort */
        }
        // Sin borrado: el parcial + control quedan para resume (-c).
        finish('failed');
      };
      if (params.signal) {
        if (params.signal.aborted) {
          onAbort();
          return;
        }
        params.signal.addEventListener('abort', onAbort, { once: true });
      }
      // Actividad, no porcentaje: el parcial es sparse (stat miente el % real)
      // y por pipe no hay readout `[#]`. Primera actividad observada = primer
      // byte a efectos de TTFB; el % solo se emite al completar (exacto).
      let activitySeen = false;
      const pollActivity = async (): Promise<void> => {
        if (settled || activitySeen) return;
        try {
          const controlNow = fs.existsSync(controlPath);
          let partialNow = false;
          try {
            const st = await fsp.stat(partialPath);
            partialNow = st.isFile() && st.size > 0;
          } catch {
            /* aún sin parcial */
          }
          if (controlNow || partialNow) {
            activitySeen = true;
            params.probe?.onFirstByte();
          }
        } catch {
          /* best-effort */
        }
      };
      pollTimer = setInterval(() => {
        void pollActivity();
      }, 250);
      child.stdout?.on('data', (data: Buffer) => {
        for (const line of data.toString().split(/[\r\n]+/)) {
          if (!line.includes('[#')) continue;
          const progress = parseAria2cProgressLine(line);
          if (!progress) continue;
          params.probe?.onFirstByte();
          params.probe?.onProgress(progress.fraction, progress.totalBytes);
          params.onProgress?.(progress.fraction);
        }
      });
      child.stderr?.on('data', (data: Buffer) => {
        if (stderr.length < STDERR_LIMIT) stderr += data.toString().slice(0, STDERR_LIMIT - stderr.length);
      });
      child.on('error', () => {
        this.selector.degrade(params.server);
        finish('failed');
      });
      child.on('close', async (code) => {
        if (params.signal?.aborted) {
          finish('failed');
          return;
        }
        if (code !== 0) {
          if (/(^|\D)(403|429)(\D|$)/.test(stderr)) this.selector.degrade(params.server);
          finish('failed');
          return;
        }
        try {
          const st = await fsp.stat(partialPath);
          const complete = st.isFile() && st.size > 0 && (range.totalBytes === null || st.size >= range.totalBytes);
          if (complete) {
            params.probe?.onFirstByte();
            params.probe?.onProgress(1, st.size);
            params.onProgress?.(1);
          }
          finish(complete ? 'ok' : 'failed');
        } catch {
          finish('failed');
        }
      });
    });
  }
}
```

Notas de esta adaptación (diferencias con el original, intencionales):
- `AttemptProbe` y `parseSizeToBytes` viven aquí (sin módulo de métricas).
- Sin `scheduleCleanup` (parámetro que nunca llegó a usarse) ni
  `Aria2cRequestHeaders` (interfaz sin usos).
- `onTransportSwitch` recibe `transport: string` (sin enum de métricas).

### 2.2 `DownloadService`: cablear el transporte

1. Imports: añadir
   `import { Aria2cTransport, type Aria2cSpawnFn } from './Aria2cTransport';`
   (`Aria2cSpawnFn` solo si quieres tests con spawn fake; si no, basta el valor).
   Y el tipo del probe: `import type { AttemptProbe } from './Aria2cTransport';`
   (si ya tienes probes de otra fase, reutiliza ese tipo).
2. Campo + constructor + abort:
```ts
  private readonly aria2c: Aria2cTransport;
  private aria2cMissingWarned = false;

  constructor(aria2c?: Aria2cTransport) {
    this.aria2c = aria2c ?? new Aria2cTransport();
  }
```
   En `abort()`, tras limpiar `activeChildren`, añadir `this.aria2c.abort();`
3. Reemplazar el método `downloadDirectAxios` COMPLETO por:
```ts
  // Descarga directa genérica (aria2c primario + axios fallback). La usan
  // Mediafire (tras extraer el enlace) y MP4Upload (tras resolución propia).
  async downloadDirectAxios(
    url: string,
    dest: string,
    onProgress: (p: number) => void,
    signal?: AbortSignal,
    probe?: AttemptProbe,
    server = 'direct',
    referer = DEFAULT_DOWNLOAD_REFERER,
    tools?: YtdlpRuntimeTools,
  ): Promise<boolean> {
    const destDir = path.dirname(dest);
    const cacheDir = path.join(destDir, '.cache');
    const fileName = path.basename(dest);
    const partialPath = path.join(cacheDir, fileName);
    const controlPath = `${partialPath}.aria2`;
    const sidecarPath = `${controlPath}.url`;
    const cleanupKey = path.resolve(dest).toLowerCase();
    this.cleanupTracker.begin(cleanupKey);

    // Primario aria2c multihilo (probe 206 real + resume con control).
    // 'unavailable' = sin binario, degradado, sin Range o sin budget: axios es
    // lo óptimo y se usa sin marcar switch. 'failed' = se intentó: fallback.
    const ariaOutcome = await this.aria2c.download({
      aria2cPath: tools?.aria2cPath,
      url,
      cacheDir,
      fileName,
      server,
      userAgent: DIRECT_USER_AGENT,
      referer,
      signal,
      probe,
      onProgress,
    });
    if (ariaOutcome === 'ok' && !signal?.aborted) {
      try {
        await fsp.unlink(dest).catch(() => {});
        await fsp.rename(partialPath, dest);
        await fsp.unlink(controlPath).catch(() => {});
        await fsp.unlink(sidecarPath).catch(() => {});
        const st = await fsp.stat(dest);
        if (st.isFile() && st.size > 0) return true;
      } catch {
        /* cae al fallback axios en fresco */
      }
    }
    if (signal?.aborted) return false;
    // Preparación del fallback axios, uniforme: generación nueva (cancela
    // limpiezas de la fase aria2c), anuncio de vuelta a axios (no-op si nunca
    // se spawneó) y barrido del trío — el parcial de aria2c nunca se continúa
    // con axios.
    this.cleanupTracker.begin(cleanupKey);
    probe?.onTransportSwitch('direct', 1);
    await Promise.all([
      fsp.rm(partialPath, { force: true }),
      fsp.rm(controlPath, { force: true }),
      fsp.rm(sidecarPath, { force: true }),
    ]).catch(() => undefined);
    if (ariaOutcome === 'unavailable' && !tools?.aria2cPath && !this.aria2cMissingWarned) {
      this.aria2cMissingWarned = true;
      console.warn('aria2c no disponible en tools/win: descargas directas por axios (1 conexión).');
    }

    const fallbackGeneration = this.cleanupTracker.current(cleanupKey);
    const MAX_DIRECT_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_DIRECT_ATTEMPTS; attempt += 1) {
      if (signal?.aborted) return false;
      if (attempt > 1) probe?.onRetry();
      const ok = await this.downloadDirectAxiosOnce(url, dest, onProgress, signal, probe, fallbackGeneration, referer);
      if (ok || signal?.aborted) return ok;
      if (attempt < MAX_DIRECT_ATTEMPTS) {
        await this.sleepAbortable(1000 * attempt, signal);
      }
    }
    return false;
  }
```
   (Requiere `YtdlpRuntimeTools.aria2cPath` de F1 y el tracker de F1. Sin
   probe (undefined) todo funciona: los `probe?.` son no-op.)
4. `downloadMediafire`: firma
```ts
  async downloadMediafire(
    url: string,
    dest: string,
    onProgress: (p: number) => void,
    signal?: AbortSignal,
    probe?: AttemptProbe,
    referer?: string,
    tools?: YtdlpRuntimeTools,
  ): Promise<boolean> {
```
   con `const pageReferer = typeof referer === 'string' && referer ? referer : DEFAULT_DOWNLOAD_REFERER;`
   al inicio; la llamada interna pasa a ser
   `await this.downloadDirectAxios(directUrl, dest, onProgress, signal, probe, 'Mediafire', pageReferer, tools);`
   y en su `catch`, antes del `console.error`, añadir:
   `if (typeof e?.response?.status === 'number') probe?.onHttpStatus(e.response.status);`
   (El fetch de la página conserva solo `User-Agent`; el referer va al transporte.)

### 2.3 Cómo funciona y gotchas verificados

- Orden: binario? → perfil (>0?) → probe Range (206 + Content-Range) →
  budget (mín. 4 útiles) → resume/fresco → spawn → validación por tamaño.
- Resume `-c` solo con control + parcial coherente + misma URL (sidecar).
  axios posterior siempre trunca (nunca concatena un 200 como 206).
- Progreso honesto: el parcial es **sparse** (`stat` miente el %: 3.7MB
  recibidos reportaban 19MB) y por pipe aria2c no emite readout `[#]`
  (verificado con 3 variantes de flags). Por eso: actividad para TTFB,
  100% exacto al completar. NO uses tamaño en disco como %.
- Degradación 403/429 o spawn roto; slots por servidor + budget global 24
  como doble techo (3 EPs × 16 pedirían 48 sin él).

### 2.4 Tests a crear (`tests/download-aria2c.test.ts`)

- `validateRangeProbe`: 206+válido ok; 200/malformado/null/416 no.
- `buildAria2cArgs`: `-x/-s`, `-c` solo en resume, `--auto-file-renaming=false`,
  UA/referer, URL última, clamp 1..16.
- `parseAria2cProgressLine`: línea real con CN/DL; total 0B→null; logs→null.
- `resolveAria2cResumePlan`, `Aria2cConnectionBudget` (tope + mínimo útil),
  `Aria2cProfileSelector` (default 8, escalera 8→4→0 y 16→12→8).
- `probeRangeSupport` contra `node:http` locales (206 real / 200 / caído).
- `download` con spawn fake: ok (anuncia transporte, valida tamaño),
  200→`unavailable` sin spawnear, 403→`failed` + degrada, sin binario→
  `unavailable` sin tocar probe.
- Integración `downloadMediafire` contra servidores locales: sin binario→
  axios; aria2c fallido→axios en fresco + trío limpio.
- Claim: control+sidecar coincidente se conserva; otra URL purga;
  `allowContinue=false` purga.

### 2.5 Validación F2

`build:main`, typecheck renderer, lint, format, tests. Real: contra un
MediaFire real, `range:206`, `switch:aria2c:8`, tamaño exacto.

## FASE 3 — MP4Upload: extractor directo propio → aria2c (fallback yt-dlp)

### 3.1 NUEVO `src/services/Mp4UploadResolver.ts` (contenido completo)

```ts
import axios from 'axios';

// Resolución directa propia de MP4Upload: del embed HTML se extrae
// el fichero `https://<host>.mp4upload.com:<port>/d/<id>/<file>` para
// descargarlo por aria2c/axios en vez del extractor genérico de yt-dlp.
// Optimización con fallback: si falla, el llamador usa yt-dlp. Nunca lanza.

export const MP4UPLOAD_REFERER = 'https://www.mp4upload.com/';
const MP4UPLOAD_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 10_000;

export interface Mp4UploadResolveResult {
  ok: boolean;
  directUrl?: string;
}

export type Mp4UploadResolveFn = (embedUrl: string) => Promise<Mp4UploadResolveResult>;

// Forma estricta del fichero: host mp4upload, ruta /d/, extensión de vídeo.
export function isMp4UploadFileUrl(candidate: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(String(candidate || '').trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  if (host !== 'mp4upload.com' && !host.endsWith('.mp4upload.com')) return false;
  if (!parsed.pathname.includes('/d/')) return false;
  return /\.(mp4|mkv|avi|flv|webm|m4v|mov)($|\?)/i.test(parsed.pathname);
}

// Capas de extracción, de precisa a amplia. La primera URL válida gana.
export function extractMp4UploadDirectUrl(html: string): string | null {
  const text = String(html || '');
  if (!text) return null;
  const playerSrc = text.match(/player\.src\(\s*\{[^}]{0,800}?src\s*:\s*"([^"]+)"/is);
  if (playerSrc?.[1] && isMp4UploadFileUrl(playerSrc[1])) return playerSrc[1].trim();
  const fileProps = text.matchAll(/\bfile\s*:\s*"([^"]+)"/gi);
  for (const match of fileProps) {
    if (match[1] && isMp4UploadFileUrl(match[1])) return match[1].trim();
  }
  const broad = text.match(/https?:\/\/[a-z0-9.-]*mp4upload\.com(?::\d+)?\/[^\s"'<>\\]+/gi);
  if (broad) {
    for (const candidate of broad) {
      if (isMp4UploadFileUrl(candidate)) return candidate.trim();
    }
  }
  return null;
}

export interface Mp4UploadResolverDeps {
  fetchHtml?: (url: string) => Promise<string>;
  timeoutMs?: number;
}

async function defaultFetchHtml(url: string, timeoutMs: number): Promise<string> {
  const response = await axios.get(url, {
    headers: { 'User-Agent': MP4UPLOAD_USER_AGENT, Referer: MP4UPLOAD_REFERER },
    timeout: timeoutMs,
    responseType: 'text',
    maxRedirects: 5,
    validateStatus: (status) => status >= 200 && status < 300,
  });
  return String(response.data || '');
}

export async function resolveMp4UploadDirect(
  embedUrl: string,
  deps: Mp4UploadResolverDeps = {},
): Promise<Mp4UploadResolveResult> {
  try {
    const clean = String(embedUrl || '').trim();
    if (!/^https?:\/\/(www\.)?mp4upload\.com\//i.test(clean)) return { ok: false };
    const timeoutMs =
      typeof deps.timeoutMs === 'number' && Number.isFinite(deps.timeoutMs) && deps.timeoutMs > 0
        ? Math.min(30_000, deps.timeoutMs)
        : FETCH_TIMEOUT_MS;
    const html = await (deps.fetchHtml ? deps.fetchHtml(clean) : defaultFetchHtml(clean, timeoutMs));
    const directUrl = extractMp4UploadDirectUrl(html);
    if (!directUrl) return { ok: false };
    return { ok: true, directUrl };
  } catch {
    return { ok: false };
  }
}
```

### 3.2 Rama MP4Upload en `EpisodeDownloadAttemptService`

1. Imports: añadir
```ts
import { MP4UPLOAD_REFERER, resolveMp4UploadDirect } from './Mp4UploadResolver';
import type { Mp4UploadResolveFn } from './Mp4UploadResolver';
```
2. En `EpisodeDownloadAttemptOptions`, añadir:
   `resolveMp4UploadDirect?: Mp4UploadResolveFn;`
   (`main.ts` NO se toca: el valor por defecto se resuelve en el `??`.)
3. Declarar `let skipYtdlp = false;` junto a `let success = false;` en `attempt()`.
4. Reemplazar el bloque MP4Upload existente:
```ts
        if (link.server === 'MP4Upload') {
          downloadUrl = normalizeMp4UploadUrl(downloadUrl);
          extraArgs.push('--referer', 'https://www.mp4upload.com/');
          extraArgs.push('--user-agent', this.options.userAgent);
        }
```
   por:
```ts
        if (link.server === 'MP4Upload') {
          downloadUrl = normalizeMp4UploadUrl(downloadUrl);
          extraArgs.push('--referer', MP4UPLOAD_REFERER);
          extraArgs.push('--user-agent', this.options.userAgent);
          // Resolución directa propia → aria2c/axios. Si falla, cae
          // al extractor genérico de yt-dlp (nunca punto único de fallo).
          if (!attemptAbort.signal.aborted) {
            const resolveFn = this.options.resolveMp4UploadDirect ?? resolveMp4UploadDirect;
            const resolved = await resolveFn(downloadUrl).catch(() => ({ ok: false as const }));
            if (resolved.ok && resolved.directUrl && !attemptAbort.signal.aborted) {
              let lastReportedPctDirect = -1;
              success = await this.options.downloadService.downloadDirectAxios(
                resolved.directUrl,
                dest,
                (progress) => {
                  markStarted();
                  const pct = Math.round(progress * 100);
                  callbacks.onProgress({
                    progress,
                    progressLog:
                      pct !== lastReportedPctDirect ? `   -> EP ${episode} * MP4Upload * ${pct}%` : undefined,
                  });
                  if (pct !== lastReportedPctDirect) lastReportedPctDirect = pct;
                  callbacks.updateTray(`Descargando ${item.animeTitle} - EP ${episode} (${pct}%)`);
                },
                attemptAbort.signal,
                undefined,
                'MP4Upload',
                MP4UPLOAD_REFERER,
                this.options.getRuntimeTools(),
              );
              skipYtdlp = success || attemptAbort.signal.aborted;
            }
          }
        }
```
5. Envolver la llamada existente a `downloadYtdlpCustom` en `if (!skipYtdlp) { ... }`
   (añade la condición al `if` que la contiene o envuélvela; el interior no cambia
   y NO se le pasa probe).
6. `downloadDirectAxios` pasa de `private` a `public` (una palabra; la firma
   con `server/referer/tools` ya la trae de F2).
7. En `if (!mp4Ready)`, tras `invalidMp4 = true;`, la purga ya cubre
   Mediafire por F1; extender la condición a MP4Upload:
   `if (link.server === 'Mediafire' || link.server === 'MP4Upload') await this.purgeAria2cResumeFiles(dest);`
   (línea exacta según tu `if (!mp4Ready)` actual).

### 3.3 Validación real F3

1. Obtener un embed fresco: los links caducan/rotan. Con un script temporal,
   `new AnimeAV1Provider().getLinks('<slug>', <ep>, 'SUB')` (o JkAnime) y
   filtra `server` MP4Upload (normaliza a `mp4upload` en minúsculas según tu
   normalizador).
2. Resolver: debe devolver `https://<host>.mp4upload.com:<port>/d/<id>/video.mp4`.
3. Probe Range a la directa: exige **206** con total (referer mp4upload).
   Referencia medida: 52,960,869 B y 105,720,511 B en dos episodios.
4. Descarga completa por `downloadDirectAxios` con tools reales
   (`aria2cPath` de `tools/win`): tamaño byte-exacto + ffprobe con
   vídeo+audio y duración coherente (~1400s por episodio de 24min).
5. Tests a crear: validación estricta (fichero sí; poster/página/embed/http/
   otro host/basura no), 3 capas de extracción, never-throws, rama:
   directo-ok evita yt-dlp (con server/referer/tools correctos),
   resolver-fallido y directo-fallido caen a yt-dlp con el embed.

## FASE 4 — Mega: retry 3× + resume seguro (megajs se queda)

No tocar `maxConnections: 6`, `initialChunkSize: 512K`, `maxChunkSize: 1M`.
Por qué el resume por slice es seguro (verificado en fuente `qgustavor/mega`
`lib/file.mjs`): `download({start})` acepta cualquier offset (alinea a
bloque de 16 y descarta el prefijo con StreamSkip: el stream empieza
exactamente en `start`); hay reintentos internos por chunk (hasta 8, backoff
`1000·2^tries`); la verificación MAC solo aplica a descargas completas
(parciales no la tienen: el caso lo sostienen TLS + misma URL, cuyo
contenido es inmutable por handle+key, + tamaño exacto); errores por
`loadAttributes` (API/red) y `error` del stream (chunks, 509 con `timeLimit`).

### 4.1 Helpers en `DownloadService.ts` (pegar tras los imports)

```ts
// Fachada mínima de megajs para inyectar fakes en tests. `download({start})`
// emite exactamente los bytes [start, size): megajs alinea el pedido al
// bloque de 16 y descarta el prefijo con StreamSkip (verificado en fuente).
export interface MegaDownloadStream extends NodeJS.EventEmitter {
  pipe<T extends NodeJS.WritableStream>(destination: T): T;
  destroy(error?: Error): void;
}

export interface MegaFileLike {
  size?: number;
  loadAttributes(): Promise<unknown>;
  download(options: {
    start: number;
    maxConnections: number;
    initialChunkSize: number;
    maxChunkSize: number;
  }): MegaDownloadStream;
}

export type MegaFileFactory = (url: string) => MegaFileLike;

// Parcial con nombre propio (nunca `.part` pelado: ese lo usa yt-dlp y jamás
// deben confundirse) + sidecar que liga el parcial a su URL exacta.
export function megaResumeFiles(cacheDir: string, fileName: string): { partial: string; sidecar: string } {
  const partial = path.join(cacheDir, `${fileName}.mega.part`);
  return { partial, sidecar: path.join(cacheDir, `${fileName}.mega.json`) };
}

export interface MegaResumeState {
  url: string;
  size: number;
  savedAt: number;
}

export function parseMegaResumeState(raw: unknown): MegaResumeState | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.url !== 'string' || !record.url) return null;
  if (typeof record.size !== 'number' || !Number.isFinite(record.size) || record.size <= 0) return null;
  return {
    url: record.url,
    size: Math.floor(record.size),
    savedAt: typeof record.savedAt === 'number' && Number.isFinite(record.savedAt) ? record.savedAt : 0,
  };
}

export type MegaFailureKind = 'permanent' | 'quota' | 'transient';

// Permanente: reintentar es inútil (llave/URL/acceso). Cuota 509: reintentar
// de inmediato también (se agota por horas; mejor caer al siguiente servidor).
// Transitorio: red, timeouts, chunks, respuestas inválidas.
export function classifyMegaError(error: unknown): MegaFailureKind {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'number' && Number.isInteger(code) && code < 0) return 'permanent';
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/Bandwidth limit|EOVERQUOTA|timeLimit/i.test(message)) return 'quota';
  if (
    /key isn't defined|Attributes could not be decrypted|Invalid URL|too few arguments|too many arguments|past the end of the file|folder download|EACCESS|EARGS/i.test(
      message,
    )
  ) {
    return 'permanent';
  }
  return 'transient';
}

const MAX_MEGA_ATTEMPTS = 3;
```

### 4.2 Reemplazar `downloadMega` COMPLETO (de `async downloadMega(` a su `}` de
cierre, justo antes de `async downloadYtdlpCustom`) por:

```ts
  async downloadMega(
    url: string,
    dest: string,
    onProgress?: (p: number) => void,
    signal?: AbortSignal,
    probe?: AttemptProbe,
    megaFileFactory?: MegaFileFactory,
  ): Promise<boolean> {
    const factory = megaFileFactory ?? ((u: string) => megajs.File.fromURL(u) as unknown as MegaFileLike);
    const normalizedUrl = normalizeMegaUrl(String(url || '').trim());

    const destDir = path.dirname(dest);
    const cacheDir = path.join(destDir, '.cache');
    try {
      await fsp.mkdir(cacheDir, { recursive: true });
      if (process.platform === 'win32') {
        execFile('attrib', ['+h', cacheDir], { windowsHide: true }, () => {});
      }
    } catch {}
    const { partial: tempDest, sidecar: sidecarPath } = megaResumeFiles(cacheDir, path.basename(dest));

    if (signal?.aborted) return false;

    const readResumeState = async (): Promise<{ partialSize: number; state: MegaResumeState | null }> => {
      let partialSize = 0;
      try {
        const st = await fsp.stat(tempDest);
        if (st.isFile()) partialSize = st.size;
      } catch {
        /* sin parcial */
      }
      let state: MegaResumeState | null = null;
      try {
        state = parseMegaResumeState(JSON.parse(await fsp.readFile(sidecarPath, 'utf8')));
      } catch {
        /* sin sidecar válido */
      }
      return { partialSize, state };
    };
    const purgeResume = async (): Promise<void> => {
      await Promise.all([fsp.rm(tempDest, { force: true }), fsp.rm(sidecarPath, { force: true })]).catch(
        () => undefined,
      );
    };

    for (let attempt = 1; attempt <= MAX_MEGA_ATTEMPTS; attempt += 1) {
      if (signal?.aborted) return false;
      if (attempt > 1) probe?.onRetry();
      try {
        let file: MegaFileLike;
        try {
          file = factory(normalizedUrl);
        } catch {
          return false;
        }
        const loadPromise = file.loadAttributes();
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Mega load timeout')), 10_000),
        );
        const abortPromise = signal
          ? new Promise<never>((_, reject) => {
              if (signal.aborted) reject(new Error('Aborted'));
              else signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
            })
          : null;
        const racePromises: Promise<unknown>[] = [loadPromise, timeoutPromise];
        if (abortPromise) racePromises.push(abortPromise);
        await Promise.race(racePromises);
        if (signal?.aborted) return false;

        const totalLength =
          typeof file.size === 'number' && Number.isFinite(file.size) ? Math.floor(file.size) : 0;
        if (totalLength <= 0) return false;

        const { partialSize, state } = await readResumeState();
        const coherent =
          state !== null && state.url === normalizedUrl && state.size === totalLength && partialSize <= totalLength;
        if (coherent && partialSize === totalLength) {
          try {
            await fsp.unlink(dest).catch(() => {});
            await fsp.rename(tempDest, dest);
            await fsp.rm(sidecarPath, { force: true }).catch(() => undefined);
            return !signal?.aborted;
          } catch {
            await purgeResume();
          }
        } else {
          const startOffset = coherent && partialSize > 0 ? partialSize : 0;
          if (startOffset === 0) {
            await purgeResume();
            await fsp
              .writeFile(sidecarPath, JSON.stringify({ url: normalizedUrl, size: totalLength, savedAt: Date.now() }))
              .catch(() => undefined);
          }
          const outcome = await this.downloadMegaSlice(
            file,
            tempDest,
            dest,
            sidecarPath,
            startOffset,
            totalLength,
            onProgress,
            signal,
            probe,
          );
          if (outcome === 'completed') return !signal?.aborted;
          if (outcome === 'fatal' || signal?.aborted) return false;
        }
      } catch (e) {
        if (signal?.aborted) return false;
        const kind = classifyMegaError(e);
        if (kind === 'quota') {
          console.error('Mega: cuota agotada (509); se prueba el siguiente servidor sin reintentos.');
          return false;
        }
        if (kind === 'permanent') {
          console.error(`Mega permanente, sin reintento: ${(e as Error)?.message || e}`);
          return false;
        }
        console.error(`Mega transitorio (intento ${attempt}/${MAX_MEGA_ATTEMPTS}): ${(e as Error)?.message || e}`);
      }
      if (attempt < MAX_MEGA_ATTEMPTS && !signal?.aborted) {
        await this.sleepAbortable(1000 * attempt, signal);
      }
    }
    return false;
  }
```

(`AttemptProbe` impórtalo como tipo desde `./Aria2cTransport`. Cada reintento
re-resuelve atributos frescos porque la URL temporal de descarga caduca.)

### 4.3 Añadir `downloadMegaSlice` privado (tras `downloadMega`):

```ts
  // Un slice [startOffset, total): append O_APPEND sobre tamaño verificado +
  // validación de tamaño EXACTO. Sin el exacto no hay éxito posible.
  private async downloadMegaSlice(
    file: MegaFileLike,
    tempDest: string,
    dest: string,
    sidecarPath: string,
    startOffset: number,
    totalLength: number,
    onProgress?: (p: number) => void,
    signal?: AbortSignal,
    probe?: AttemptProbe,
  ): Promise<'completed' | 'retry' | 'fatal'> {
    const internalController = new AbortController();
    this.trackController(internalController);
    let writer: fs.WriteStream | null = null;
    let readable: MegaDownloadStream | null = null;

    return await new Promise((resolve) => {
      let settled = false;
      const finish = (outcome: 'completed' | 'retry' | 'fatal') => {
        if (settled) return;
        settled = true;
        if (signal) signal.removeEventListener('abort', onExternalAbort);
        internalController.signal.removeEventListener('abort', onGlobalAbort);
        this.untrackController(internalController);
        resolve(outcome);
      };
      const onExternalAbort = () => {
        try {
          internalController.abort();
        } catch {
          /* abort is idempotent */
        }
        try {
          readable?.destroy();
        } catch {}
        try {
          writer?.destroy();
        } catch {}
        finish('retry');
      };
      const onGlobalAbort = () => {
        try {
          readable?.destroy();
        } catch {}
        try {
          writer?.destroy();
        } catch {}
        finish('retry');
      };
      if (signal) {
        if (signal.aborted) {
          this.untrackController(internalController);
          resolve('retry');
          return;
        }
        signal.addEventListener('abort', onExternalAbort, { once: true });
      }
      internalController.signal.addEventListener('abort', onGlobalAbort, { once: true });

      const fail = (error: unknown): void => {
        const kind = classifyMegaError(error);
        finish(kind === 'transient' ? 'retry' : 'fatal');
      };

      let activeWriter: fs.WriteStream;
      try {
        activeWriter = fs.createWriteStream(tempDest, { flags: 'a', highWaterMark: 1024 * 1024 });
      } catch {
        finish('retry');
        return;
      }
      writer = activeWriter;
      activeWriter.once('open', () => {
        void (async () => {
          // Puerta anti-carrera: el fd abierto debe ser el parcial de tamaño
          // exacto esperado. Sin esto, un truncado externo entre el stat
          // previo y la apertura colaría ceros sparse con tamaño final exacto.
          // (En @types/node modernos `fd`/`fstat` promesas no existen en los
          // tipos: se accede por shim + callback.)
          const fdRaw = (activeWriter as unknown as { fd?: unknown }).fd;
          const fdStat =
            typeof fdRaw === 'number'
              ? await new Promise<fs.Stats | null>((resolveStat) =>
                  fs.fstat(fdRaw, (err, stats) => resolveStat(err ? null : stats)),
                )
              : null;
          if (!fdStat || !fdStat.isFile() || fdStat.size !== startOffset) {
            try {
              activeWriter.destroy();
            } catch {}
            finish('retry');
            return;
          }
          let readableInstance: MegaDownloadStream;
          try {
            readableInstance = file.download({
              start: startOffset,
              maxConnections: 6,
              initialChunkSize: 512 * 1024,
              maxChunkSize: 1024 * 1024,
            });
          } catch (e) {
            fail(e);
            return;
          }
          readable = readableInstance;
          let downloadedLength = 0;
          readable.on('data', (chunk: Buffer) => {
            downloadedLength += chunk.length;
            probe?.onFirstByte();
            const fraction = Math.min(1, (startOffset + downloadedLength) / totalLength);
            if (onProgress) onProgress(fraction);
            probe?.onProgress(fraction, totalLength);
          });
          readable.pipe(activeWriter);
          activeWriter.on('finish', () => {
            void (async () => {
              try {
                const st = await fsp.stat(tempDest);
                if (!st.isFile() || st.size !== totalLength) {
                  if (st.isFile() && st.size > totalLength) {
                    await Promise.all([
                      fsp.rm(tempDest, { force: true }),
                      fsp.rm(sidecarPath, { force: true }),
                    ]).catch(() => undefined);
                  }
                  finish('retry');
                  return;
                }
                await fsp.unlink(dest).catch(() => {});
                await fsp.rename(tempDest, dest);
                await fsp.rm(sidecarPath, { force: true }).catch(() => undefined);
              } catch {
                finish('retry');
                return;
              }
              finish('completed');
            })();
          });
          activeWriter.on('error', () => finish('retry'));
          readable.on('error', (error: unknown) => fail(error));
        })();
      });
      activeWriter.once('error', (error: unknown) => fail(error));
    });
  }
```

Notas: append `O_APPEND` + gates hacen imposible el silencioso-corrupto
(short reanuda solo; overrun purga; abort conserva el parcial para resume).
La rama Mega de `EpisodeDownloadAttemptService` NO cambia (llama con los 4
args de siempre; el progreso ya lleva offset).

### 4.4 Claim + purga Mega en `EpisodeDownloadAttemptService`

1. Import: `import { megaResumeFiles, parseMegaResumeState } from './DownloadService';`
2. En `claimFreshDirectTemps`, añadir el trío mega junto al aria:
```ts
    const { partial: megaPartial, sidecar: megaSidecar } = megaResumeFiles(cacheDir, baseName);
    // ...
    const purgeMega = (): Promise<void> => rmAll([megaPartial, megaSidecar]);
    // con allowContinue=false: await purgeMega(); junto a purgeAria.
    let keepMega = false;
    try {
      const [partialStat, rawState] = await Promise.all([
        fsp.stat(megaPartial),
        fsp.readFile(megaSidecar, 'utf8'),
      ]);
      const state = parseMegaResumeState(JSON.parse(rawState));
      keepMega = partialStat.isFile() && state !== null && state.url === sourceUrl;
    } catch {
      keepMega = false;
    }
    // ...
    if (!keepMega) await purgeMega();
```
   (La coherencia de tamaño la verifica el transporte con `loadAttributes`.)
3. Añadir:
```ts
  private async purgeMegaResumeFiles(destPath: string): Promise<void> {
    const { partial, sidecar } = megaResumeFiles(path.join(path.dirname(destPath), '.cache'), path.basename(destPath));
    await Promise.all([fsp.rm(partial, { force: true }), fsp.rm(sidecar, { force: true })]).catch(() => undefined);
  }
```
4. En `if (!mp4Ready)`, junto a la purga aria, añadir:
   `if (link.server === 'Mega') await this.purgeMegaResumeFiles(dest);`
5. En `hasDownloadStartedOnDiskAsync` y `snapshotDownloadCandidatesAsync`,
   añadir `${cachePath}.mega.part` a los candidatos.

### 4.5 Validación real F4

Con enlace Mega real (sácalo fresco con `getLinks`, caducan las sesiones):
1. `loadAttributes` → anota `size` (referencia: 105,720,511 B en un EP).
2. Descarga con abort al ~10% → parcial `.mega.part` + `.mega.json` ligados.
3. Reintento sin abort → tamaño byte-exacto + ffprobe vídeo+audio y duración
   coherente (~1450s) + cero reintentos en la reanudación.

### 4.6 Tests a crear (`tests/download-mega.test.ts`, con `MegaFileLike` fake
sobre `PassThrough` real)

- `classifyMegaError`: cuota/permanente/transitorio (incl. código numérico
  negativo MEGA y `MEGA returned a 403` como transitorio: la URL temporal se
  re-resuelve).
- `parseMegaResumeState` + rutas `megaResumeFiles`.
- Fresco byte-exacto sin reintentos + sidecar limpio.
- Corte a mitad → resume en offset exacto, progreso monótono, 1 retry.
- Permanente y cuota: 1 intento, sin retry.
- `loadAttributes` caído 2× → backoff y completa.
- Sidecar de otra URL purga; parcial mayor que el total purga.
- Abort conserva parcial + sidecar.
- Claim: trío ligado se conserva, otra URL purga; invalidMp4 purga sidecar.

## 5. Tests del resto (recrear por archivo, casos clave)

- Prioridades/allowlist sin PDrain; `normalizeServerName('Pixeldrain')` pasa
  crudo (lo bloquea la allowlist).
- `DownloadCleanupTracker`: generaciones, schedule obsoleto ignorado,
  vigente borra, `begin` cancela pendiente.
- `isSameStemCandidate`: mismo stem + `.ext` sí; `01` vs `010` no; `.part` no.
- Baseline started/stale/crecido; `cleanEpisodeTemps` cubre `.cache`;
  cross-EP: vecino en crecimiento no se renombra (+control positivo).
- aria2c puros: `validateRangeProbe` (206+válido sí; 200/malformado/null/416
  no), `buildAria2cArgs`, parse de línea, plan resume, budget (tope 24,
  mínimo 4), selector (default 8, escalera), probe contra `node:http`
  locales, spawn fake ok/resume/403/degradado, `unavailable` sin probe.
- Integración MediaFire contra servidores locales (página `downloadButton`
  → fichero): sin binario→axios; aria2c fallido→axios en fresco + trío limpio.
- Resolver MP4Upload: validación, 3 capas, never-throws; rama: directo-ok
  evita yt-dlp; fallos caen a yt-dlp con el embed.
- Comando único: `node --require ts-node/register --test tests/*.test.ts`.

## 6. Gotchas (lecciones pagadas, no repetir)

1. Ciertos CDN exigen `Sec-Fetch-*` (403 sin ellos): verificado en zilla y
   asumido en mp4upload vía referer. Si un transporte nuevo da 403 global,
   mira headers antes que código.
2. El parcial multihilo es **sparse**: `stat` miente el % (3.7MB recibidos
   reportaban 19MB). Nunca derives progreso de tamaño en disco con
   multihilo; TTFB por actividad y 100% exacto al completar.
3. Por pipe, aria2c 1.37.0 no emite readout `[#]` (3 variantes de flags
   probadas): el parse de stdout es suplemento, no primario.
4. Resume SIEMPRE ligado a URL exacta (sidecar). Otra URL = purga, sin
   excepciones: reanudar bytes ajenos corrompe en silencio.
5. Exige **206 + Content-Range** para multihilo; `Accept-Ranges` solo no basta.
6. yt-dlp HLS nunca `--continue` (la URL caduca); el parcial HLS siempre
   empieza de cero.
7. Edit: lee con Read antes de cada edición; `oldString` con contexto amplio
   y único; tras editar, `prettier --write` del fichero + `build:main`.
8. `tests/` es gitignored: vive solo en local. Los timers con `unref` no
   cuelgan `node --test`.
9. `setup-tools --check` debe dar los 4 OK; si falla el SHA, re-calcúlalo
   del asset oficial (nunca inventes hashes).
10. NO copiar de la sesión original: `DownloadAttemptMetrics.ts`,
    `ServerRanking.ts`, `getRankingInput`/`recordAttemptMetric`,
    `getServerPriorityOrder` rankeado, `transports` en métricas, cambios en
    `ServerStatsStore`/`processor`/settings, nada de nm3u8dl (pins, código,
    UI, preferencia `hlsEngine`) ni tuning de `-N`. Todo `probe?.` que veas
    en el código de arriba funciona con `undefined`.

## 7. Validación final global

`npm run build:main` + `typecheck:renderer` + `lint` + `format:check` +
suite completa en verde. Descargas reales: MediaFire (206 + tamaño exacto),
MP4Upload (embed→206→tamaño exacto + ffprobe) y Mega (abort→resume exacto +
ffprobe). Con <8 muestras/servidor el orden sigue estático: eso es de otra
fase, aquí no se rankea nada.
