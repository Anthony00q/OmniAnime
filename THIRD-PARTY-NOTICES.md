# Avisos de terceros — binarios redistribuidos en `tools/win/`

Este archivo cubre únicamente los binarios externos que OmniAnime
redistribuye dentro del instalador (`resources/tools/win/`).
Las versiones fijadas viven en `scripts/tools-versions.json`
(única fuente de verdad); este archivo documenta sus licencias y
cómo cumplir las condiciones de redistribución.

## yt-dlp 2026.08.19 (`yt-dlp.exe`)

- Origen: release oficial `yt-dlp/yt-dlp`
  (`https://github.com/yt-dlp/yt-dlp/releases/tag/2026.08.19`).
- Binario: `https://github.com/yt-dlp/yt-dlp/releases/download/2026.08.19/yt-dlp.exe`
  (standalone x64 para Windows), SHA-256 fijado en `tools-versions.json`.
- Licencia: **Unlicense** (dominio público). El proyecto dedica todo el
  copyright al dominio público; permite copiar, modificar, publicar, usar
  y distribuir el binario con cualquier fin, comercial o no.
- Código fuente: el propio repositorio
  (`https://github.com/yt-dlp/yt-dlp`, tag `2026.08.19`).
- Las dependencias internas del ejecutable viajan con sus avisos dentro
  del propio binario (`THIRD_PARTY_LICENSES.txt` según las notas del
  release oficial).

## ffmpeg 8.1.2 + ffprobe 8.1.2 (`ffmpeg.exe`, `ffprobe.exe`)

- Origen: Gyan Doshi (gyan.dev), variante **`essentials_build`**.
- Paquete:
  `https://www.gyan.dev/ffmpeg/builds/packages/ffmpeg-8.1.2-essentials_build.zip`
  (SHA-256 fijado en `tools-versions.json`); de él se extraen
  `bin/ffmpeg.exe` y `bin/ffprobe.exe`.
- Licencia: **GPLv3** (build estático; según la página oficial de builds,
  todos los builds son de 64-bit, estáticos y GPLv3).
- Código fuente correspondiente: tarball oficial
  `https://ffmpeg.org/releases/ffmpeg-8.1.2.tar.xz`
  (espejo del desarrollo en `https://github.com/FFmpeg/FFmpeg`).
- Obligaciones al distribuir el instalador de OmniAnime:
  1. Conservar este aviso junto a los binarios (este archivo viaja en el
     instalador vía `extraResources`).
  2. Ofrecer el código fuente correspondiente: la URL del tarball de
     arriba es la vía documentada para obtenerlo.

## Dónde terminan en la app instalada

`electron-builder` copia `tools/win/` a `resources/tools/win/` y este
archivo a `resources/THIRD-PARTY-NOTICES.md`. La app los resuelve con
`getToolsDir()` (`src/main/runtimePaths.ts`) y nunca ejecuta copias
globales del sistema como primera opción.
