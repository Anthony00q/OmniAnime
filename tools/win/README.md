# tools/win — binarios externos (no versionados)

`ffmpeg.exe` **no se sube a git** (ver `.gitignore`):
supera el limite de 100 MB por fichero de GitHub.

Se descarga con version fijada y SHA256 verificado:

```bat
npm run setup:tools
```

- Fuente de verdad: `scripts/tools-versions.json` (unico lugar donde se fijan
  version + URL + SHA256 del binario).
- `node scripts/setup-tools.mjs --check` solo comprueba sin descargar.
- `node scripts/setup-tools.mjs --force` re-descarga aunque ya exista.
- El CI de release (`release.yml`) lo ejecuta antes de empaquetar, asi que el
  instalador lo incluye igual via `extraResources` sin cambios de codigo.

Para subir de version el binario: actualiza `scripts/tools-versions.json`
(version + URL + SHA256 oficial) y ejecuta con `--force`.

Licencias: ver `THIRD-PARTY-NOTICES.md` en la raiz (ffmpeg de gyan.dev: GPLv3, con URL del codigo fuente).
