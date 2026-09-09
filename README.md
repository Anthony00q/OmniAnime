<p align="center">
  <a href="https://github.com/Anthony00q/OmniAnime">
    <img src="assets/icon-128.png" alt="OmniAnime" width="96" />
  </a>
</p>

<h1 align="center">OmniAnime</h1>

<p align="center">
  Busca, descarga y organiza tu colección de anime en tu equipo — App de escritorio para Windows
</p>

<div align="center">
  <a href="https://github.com/Anthony00q/OmniAnime/releases">
    <img src="https://img.shields.io/github/v/release/Anthony00q/OmniAnime?style=flat-square&label=version" alt="Última versión" />
  </a>
  <img src="https://img.shields.io/badge/Plataforma-Windows-blue?style=flat-square" alt="Windows" />
  <img src="https://img.shields.io/badge/Licencia-ISC-blue?style=flat-square" alt="Licencia ISC" />
</div>

<p align="center">
  <a href="https://github.com/Anthony00q/OmniAnime/releases"><strong>Última versión</strong></a> ·
  <a href="https://github.com/Anthony00q/OmniAnime/issues">Reportar un bug</a>
</p>

<!--
  Captura principal pendiente. Cuando exista (p. ej. docs/screenshot-inicio.png),
  mostrarla aquí con:
  <p align="center"><img src="docs/screenshot-inicio.png" alt="Pantalla principal de OmniAnime" width="800" /></p>
-->

## Qué es OmniAnime

**OmniAnime** es una aplicación de escritorio para **Windows** para buscar, descargar y organizar anime en una librería local. Sin cuentas ni nube: eliges la fuente, encuentras lo que quieres ver y lo guardas en tu disco con control total sobre carpetas y nombres.

Solo maneja anime con subtítulos (SUB). No hay doblaje.

> OmniAnime no aloja nada — solo busca en sitios públicos como AnimeAV1 y JkAnime. Úsalo con responsabilidad.

## Contenido

- [Características](#características)
- [Instalación](#instalación)
- [Uso rápido](#uso-rápido)
- [Datos, actualización y desinstalación](#datos-actualización-y-desinstalación)
- [Preguntas frecuentes](#preguntas-frecuentes)
- [Seguridad](#seguridad)
- [Desarrollo y Build](#desarrollo-y-build)
- [Licencia](#licencia)

## Características

### Buscar

- **Dos fuentes a elegir**: **AnimeAV1** y **JkAnime** desde la barra lateral. Todo el contenido (inicio, catálogo, búsqueda y fichas) se adapta a la que tengas activa.
- **Catálogo con filtros**: por género, estado, año, tipo, temporada y más, con búsqueda y scroll infinito.
- **Fichas completas**: sinopsis, póster, episodios, géneros y relaciones con otras temporadas.

### Descargar

- **Descargas que insisten**: cada episodio prueba varios servidores en orden hasta completarse. Si uno falla, pasa al siguiente sin que hagas nada.
- **Cola con control total**: pausa, cancela, reintenta solo lo que falló o salta de servidor sin perder el progreso.

### Organizar

- **Biblioteca local**: organiza en hasta **3 carpetas**, filtra por destino y busca dentro de tu colección. Solo se reconocen archivos de video (`.mp4`, `.mkv`, `.avi`, `.flv`, `.webm`).
- **Gestión de archivos**: renombra y reordena episodios con vista previa, y abre o elimina archivos desde la app.
- **Historial**: todo lo que has descargado, agrupado por anime y carpeta.
- **Ajustes completos**: carpetas, descargas (incluida actualización de `yt-dlp`), almacenamiento, apariencia con 3 temas (`Oscuro`, `OLED`, `Quantum`), notificaciones y atajos.
- **Miniaturas y caché**: genera portadas automáticamente y te deja limpiar temporales cuando quieras.
- **Interfaz cuidada**: animaciones suaves, estados de carga y notificaciones discretas.

## Instalación

1. Ve a **[Releases](https://github.com/Anthony00q/OmniAnime/releases)**.
2. Descarga `OmniAnime-Setup-X.Y.Z.exe` (la `X.Y.Z` es la última versión publicada).
3. Ejecuta el instalador y pulsa **Instalar**. Es una instalación por usuario, en español, sin permisos de administrador: crea accesos en Escritorio y Menú Inicio y no te pide elegir carpeta.
4. Al abrirlo por primera vez, la app prepara su base de datos local y verifica sus herramientas internas. Tu carpeta inicial es `Descargas\OmniAnime`, cambiable en Ajustes.

**Requisito:** Windows 10/11 de 64 bits.

> Node.js y npm solo hacen falta si vas a desarrollar (ver [Desarrollo y Build](#desarrollo-y-build)). Para usar la app instalada no necesitas nada más.

## Uso rápido

1. **Elige la fuente** arriba en la barra lateral (`AnimeAV1` o `JkAnime`). Puedes cambiarla cuando quieras.
2. **Revisa tu carpeta** en Ajustes si no quieres usar la de por defecto (`Descargas\OmniAnime`). Puedes tener hasta 3.
3. **Busca** en Inicio o explora el Catálogo con filtros. Abre la ficha para ver sinopsis, episodios y relaciones.
4. **Descarga**: elige episodios y mándalos a la cola. Sigue el progreso en **Descargas**: ahí puedes pausar, cancelar, reintentar fallidos o saltar de servidor.
5. **Organiza**: lo descargado aparece en **Librería** (reproducir, renombrar, reordenar, eliminar) y queda registrado en **Historial**.

| Vista | Para qué sirve |
|-------|----------------|
| **Inicio** | Buscar anime en la fuente activa |
| **Catálogo** | Explorar con filtros |
| **Detalles** | Ver sinopsis, episodios y relaciones |
| **Descargas** | Seguir el progreso: pausar, cancelar, reintentar fallidos o saltar de servidor |
| **Librería** | Reproducir, renombrar, reordenar y eliminar lo descargado |
| **Historial** | Ver todo lo descargado, agrupado por anime y carpeta |
| **Escáner** | Vincular las carpetas de tus destinos con su anime |

## Datos, actualización y desinstalación

### Dónde se guarda todo

- **Tus videos**: en las carpetas que configures (por defecto `Descargas\OmniAnime`). Cada carpeta guarda su info en un archivo oculto `.omnianime`.
- **Base de datos y ajustes**: en tu carpeta de datos de Windows (`%APPDATA%\OmniAnime\omnianime.db`). Ahí viven la cola, el historial y la configuración.
- **Temporales**: durante la descarga se usan archivos `.part`/`.ytdl` en una subcarpeta oculta `.cache/` dentro del destino. Puedes limpiarlos desde Ajustes → Almacenamiento.

### Actualizar

Descarga el nuevo `OmniAnime-Setup-X.Y.Z.exe` de Releases y ejecútalo. Conserva tus carpetas, historial y ajustes.

### Desinstalar

Usa Agregar o quitar programas de Windows. Tus videos y la base de datos de `%APPDATA%\OmniAnime` **no se borran**; elimínalos a mano si ya no los quieres.

## Preguntas frecuentes

### ¿Tiene doblaje?

No, solo subtítulos (SUB).

### ¿Necesito cuenta?

No. No hay cuentas, nube ni inicio de sesión.

### ¿Una descarga falla o va lenta?

La app prueba con el siguiente servidor automáticamente. Si algo queda como fallido, reinténtalo desde Descargas. Si falla mucho, ve a Ajustes → Descargas y pulsa **Actualizar yt-dlp**.

### ¿El antivirus bloquea algo?

`yt-dlp`, `ffmpeg` y `ffprobe` van incluidos en la app. Si tu antivirus los marca, revisa su aviso antes de permitirlos.

### ¿Puedo cambiar la carpeta después?

Sí, en Ajustes. El cambio solo afecta a las nuevas descargas: lo ya descargado no se mueve solo.

### ¿Puedo tener más de 3 carpetas?

No, el máximo es 3.

## Seguridad

- La app solo lee, escribe o borra dentro de las carpetas que configures. Nunca toca otras rutas.
- Los enlaces externos solo pueden abrir `animeav1.com` y `jkanime.net`.
- Las imágenes solo se cargan desde `cdn.animeav1.com` y `cdn.jkdesa.com`.

## Desarrollo y Build

<details>
<summary>Ver instrucciones para desarrolladores</summary>

### Requisitos

```bash
node >=22.13.10
npm  >=10.0.0
```

### Correr en desarrollo

```bash
npm install
npm run setup:tools   # descarga yt-dlp/ffmpeg/ffprobe verificados a tools/win/
npm run dev:vite      # terminal 1: servidor de interfaz
npm start             # terminal 2: motor Electron
```

### Build

```bash
npm install
npm run setup:tools  # obligatorio en clon fresco (los .exe no van en git)
npm run build          # compila renderer + main + typecheck
npm run build:win      # verifica herramientas y genera el instalador en release/
```

Antes de publicar: `npm run lint` y `npm run format:check`.

### Stack tecnológico

| Capa | Tecnología |
|------|------------|
| **App** | [Electron](https://www.electronjs.org/) |
| **Interfaz** | [React](https://react.dev/) + [Vite](https://vite.dev/) + [Tailwind CSS](https://tailwindcss.com/) + TypeScript |
| **Estado** | [Jotai](https://jotai.org/) + [TanStack Query](https://tanstack.com/query) |
| **UI** | [Radix UI](https://www.radix-ui.com/) + [lucide-react](https://lucide.dev/) + [sonner](https://sonner.emilkowal.ski/) |
| **Datos / Descargas** | `better-sqlite3` + `axios` + `cheerio` + `megajs` |
| **Binarios** | `yt-dlp` + `ffmpeg`/`ffprobe` en `tools/win/` (descargados con `setup:tools`) |

### Estructura del proyecto

```
OmniAnime/
├─ index.js              # entrada de Electron
├─ LICENSE               # ISC (código propio)
├─ THIRD-PARTY-NOTICES.md # licencias de yt-dlp/ffmpeg/ffprobe
├─ .github/workflows/    # CI: release por tags vX.X.X
├─ docs/                 # binarios-y-releases.md (pipeline de tools)
├─ src/
│  ├─ main/              # proceso principal (ventanas, IPC)
│  │  └─ ipc/handlers/   # canales IPC por dominio
│  ├─ services/          # base de datos, descargas, librería
│  │  └─ providers/      # AnimeAV1 / JkAnime
│  ├─ renderer/          # interfaz React (views, components, hooks, store)
│  ├─ types/             # tipos compartidos
│  └─ utils/             # utilidades
├─ assets/               # iconos y recursos del instalador
├─ scripts/              # instalador NSIS + setup-tools.mjs/tools-versions.json
├─ tools/win/            # yt-dlp + ffmpeg + ffprobe (no versionados)
```

</details>

## Licencia

Código bajo licencia **ISC** (ver [LICENSE](./LICENSE)). Los binarios incluidos
(`yt-dlp`, `ffmpeg`/`ffprobe`) tienen sus propias licencias, documentadas
en [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md) (ambos archivos viajan dentro del instalador).

---

<p align="center"><sub>Hecho por <strong>Anthony</strong> con ayuda de IA — gran parte del proyecto fue <em>vibe coding</em>.</sub></p>
