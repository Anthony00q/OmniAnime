# Binarios externos y releases por tag

## Por qué `tools/win/*.exe` no está en git

`ffmpeg.exe` pesa ~101 MB y GitHub rechaza ficheros de más de 100 MB,
así que versionar los binarios es imposible. Además engordarían el
historial en cada actualización. Por eso están en `.gitignore` y se
descargan con versiones fijadas y SHA256 verificado.

## Fuente de verdad: `scripts/tools-versions.json`

Único lugar donde se fijan versión + URL + SHA256 de cada binario:

- **yt-dlp** `2026.08.19` — release oficial `yt-dlp/yt-dlp`
  (SHA256 tomado del `SHA2-256SUMS` del release).
- **ffmpeg** `8.1.2` variante `essentials_build` — paquete versionado de
  gyan.dev con sidecar `.sha256` público.
- **ffprobe** `8.1.2` — sale del mismo paquete que ffmpeg
  (campo `fromPackage` en el JSON, sin descarga propia).

## `npm run setup:tools`

Descarga lo que falte (o no coincida en versión) a `tools/win/`:

```bat
npm run setup:tools              :: descarga lo que falte
node scripts/setup-tools.mjs --check   :: solo comprueba, sin descargar
node scripts/setup-tools.mjs --force   :: re-descarga todo
```

- Solo permite URLs `https`, sigue redirects con límite y verifica el
  SHA256 antes de colocar cada binario; después confirma la versión
  ejecutando `--version` / `-version`.
- Sin dependencias externas (solo Node). Windows únicamente, igual que
  el objetivo de distribución del proyecto.
- El CI de release lo ejecuta antes de empaquetar, así que el instalador
  incluye los binarios vía `extraResources` sin ningún cambio de código
  (`getToolsDir()` resuelve `tools/win` en dev y `resources/tools/win`
  en prod).

## Subir de versión un binario

1. Edita `scripts/tools-versions.json` (versión + URL + SHA256 oficial).
2. Ejecuta `node scripts/setup-tools.mjs --force`.
3. Comprueba la app en dev y commitea el JSON.

El formato de los fijados se valida automáticamente
(versión, URL https, SHA de 64 hex).

## Publicar una release: `git tag vX.X.X`

Flujo:

```bat
:: 1. Sube "version" en package.json a X.X.X
:: 2. Añade la sección ## [X.Y.Z] - fecha en CHANGELOG.md y commitea
git tag vX.X.X
git push origin vX.X.X
```

El workflow `.github/workflows/release.yml` (runner `windows-latest`)
hace el resto: comprueba que el tag tiene forma `vX.X.X` y coincide con
`package.json`, extrae la sección `## vX.X.X` del CHANGELOG a
`release-notes.md` (falla si no existe), `npm ci`, descarga herramientas, `lint`,
`format:check`, `build` y `build:win:publish`, que sube el instalador
NSIS + `latest.yml` a la Release de GitHub con esas notas. Solo los tags
con forma `v*.*.*` disparan el workflow. La app instalada lee esas notas
y las muestra en el modal de actualización.

Anti-instalador-vacío: `prebuild:win` y `prebuild:win:publish` ejecutan
`setup-tools --check` antes de empaquetar; si falta algún binario o no
coincide con lo fijado, el build falla en vez de producir un instalador
sin herramientas. En CI ese gate siempre pasa porque el paso anterior
acaba de descargarlas (y si la descarga falla, el job ya habría fallado).

Requisitos:

- El repositorio GitHub debe coincidir con `repository.url` de
  `package.json` (o fijar `owner`/`repo` explícitos en `build.publish`).
- `electron-updater` (ya en `dependencies`) lee ese `latest.yml` para
  el auto-update de la app instalada (servicio `AppUpdateService`,
  canales `app-update-check/download/install` + evento
  `app-update-status`; sin UI todavía).

## Avisos

- Licencias y obligaciones de redistribución: `THIRD-PARTY-NOTICES.md`
  en la raíz (viaja dentro del instalador vía `extraResources`).
- Sin firma de código, Windows mostrará aviso SmartScreen en la primera
  instalación; las actualizaciones funcionan igual.
- El instalador es asistido (`oneClick:false`): al instalar una
  actualización se verá el asistente, es lo esperado.
