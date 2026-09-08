# tools/win — binarios externos (no versionados)

`yt-dlp.exe`, `ffmpeg.exe` y `ffprobe.exe` **no se suben a git** (ver `.gitignore`):
`ffmpeg.exe` supera el limite de 100 MB por fichero de GitHub.

Se descargan con versiones fijadas y SHA256 verificado:

```bat
npm run setup:tools
```

- Fuente de verdad: `scripts/tools-versions.json` (unico lugar donde se fijan
  version + URL + SHA256 de cada binario).
- `node scripts/setup-tools.mjs --check` solo comprueba sin descargar.
- `node scripts/setup-tools.mjs --force` re-descarga aunque ya existan.
- El CI de release (`release.yml`) lo ejecuta antes de empaquetar, asi que el
  instalador los incluye igual via `extraResources` sin cambios de codigo.

Para subir de version un binario: actualiza `scripts/tools-versions.json`
(version + URL + SHA256 oficial) y ejecuta con `--force`.
`ffprobe.exe` sale del mismo paquete que `ffmpeg.exe` (ver `fromPackage`).

Licencias: ver `THIRD-PARTY-NOTICES.md` en la raiz (yt-dlp: Unlicense;
ffmpeg/ffprobe de gyan.dev: GPLv3, con URL del codigo fuente).
