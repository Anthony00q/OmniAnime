<p align="center">
  <a href="https://github.com/Anthony00q/OmniAnime">
    <img src="assets/icon-readme.png" alt="OmniAnime" width="96" />
  </a>
</p>

<h1 align="center"><b>OmniAnime</b></h1>

<p align="center">
  Busca, descarga y organiza tu colección de anime en tu equipo — App de escritorio para Windows
</p>

<div align="center">
  <a href="https://github.com/Anthony00q/OmniAnime/releases">
    <img src="https://img.shields.io/github/v/release/Anthony00q/OmniAnime?style=flat-square&label=version" alt="Última versión" />
  </a>
  <a href="#instalación">
    <img src="https://img.shields.io/badge/Plataforma-Windows-blue?style=flat-square" alt="Windows" />
  </a>
  <a href="#licencia">
    <img src="https://img.shields.io/badge/Licencia-GPLv3-blue?style=flat-square" alt="Licencia GPLv3" />
  </a>
</div>

<p align="center">
  <a href="https://github.com/Anthony00q/OmniAnime/releases/latest"><strong>Última versión</strong></a> ·
  <a href="CHANGELOG.md">Novedades</a> ·
  <a href="https://github.com/Anthony00q/OmniAnime/issues">Reportar un bug</a>
</p>

<!--
  Captura principal pendiente. Cuando exista (p. ej. docs/screenshot-inicio.png),
  mostrarla aquí con:
  <p align="center"><img src="docs/screenshot-inicio.png" alt="Pantalla principal de OmniAnime" width="800" /></p>
-->

## Qué es OmniAnime

**OmniAnime** es una aplicación de escritorio para **Windows** para buscar, descargar y organizar anime en una librería local. Sin cuentas ni nube: eliges la fuente, encuentras lo que quieres ver y lo guardas en tu disco con control total sobre carpetas y nombres.

Permite descargar anime subtitulado (SUB) y episodios doblados (DUB) en AnimeAV1 cuando están disponibles. JkAnime mantiene solo SUB.

> OmniAnime no aloja nada — solo busca en sitios públicos como [AnimeAV1](https://animeav1.com/) y [JkAnime](https://jkanime.net/). Úsalo con responsabilidad.

## Contenido

- [Características](#características)
- [Instalación](#instalación)
- [Uso rápido](#uso-rápido)
- [Datos, actualización y desinstalación](#datos-actualización-y-desinstalación)
- [Dudas comunes](#dudas-comunes)
- [Seguridad](#seguridad)
- [Desarrollo y Build](#desarrollo-y-build)
- [Licencia](#licencia)

## Características

### Buscar

- **Dos fuentes a elegir**: **AnimeAV1** y **JkAnime** desde la barra lateral. Todo el contenido (inicio, catálogo, búsqueda y fichas) se adapta a la que tengas activa.
- **Catálogo con filtros**: por género, estado, año, tipo, temporada y más, con búsqueda y scroll infinito.
- **Fichas completas**: sinopsis, imagen panorámica, póster, episodios, géneros y relaciones con otras temporadas.

### Descargar

- **Descargas que insisten**: cada episodio prueba varios servidores en orden hasta completarse. Si uno falla, pasa al siguiente sin que hagas nada.
- **Cola de descargas**: pausa, cancela, reintenta solo lo que falló o salta al siguiente servidor. Si cambia el enlace, la descarga puede empezar de nuevo.
- **Conexiones adaptativas** (Ajustes → Descargas): ajustan el número de conexiones según el rendimiento en MediaFire, MP4Upload y Voe. Puedes desactivarlas por servidor para recuperar el ajuste manual. Las instalaciones nuevas las tienen activadas; las existentes conservan su configuración.

### Organizar

- **Biblioteca local**: organiza en hasta **3 carpetas**, filtra por destino y busca dentro de tu colección. Solo se reconocen archivos de video (`.mp4`, `.mkv`, `.avi`, `.flv`, `.webm`).
- **Gestión de archivos**: renombra y reordena episodios con vista previa, y abre o elimina archivos desde la app. En Ajustes → Descargas puedes revisar y renombrar varias carpetas a la vez.
- **Historial**: todo lo que has descargado, agrupado por anime y carpeta.
- **Ajustes completos**: carpetas, descargas, almacenamiento, apariencia con 3 temas (`Oscuro`, `OLED`, `Quantum`), notificaciones y atajos.
- **Miniaturas y caché**: genera portadas automáticamente y te deja limpiar temporales cuando quieras.
- **Interfaz cuidada**: animaciones suaves, estados de carga y notificaciones discretas.

## Instalación

1. Abre **[Última versión](https://github.com/Anthony00q/OmniAnime/releases/latest)** y descarga `OmniAnime-Setup-<versión>.exe`.
2. Ejecuta el instalador. Es una instalación por usuario, en español, sin permisos de administrador: crea accesos en el Escritorio y el menú Inicio y no te pide elegir carpeta.
3. Al abrir la app por primera vez, prepara su base de datos local y verifica sus herramientas internas. Tu carpeta inicial es `Descargas\OmniAnime`; puedes cambiarla en Ajustes.

**Requisito:** Windows 10 u 11 (x64).

> Node.js y npm solo hacen falta si vas a desarrollar (ver [Desarrollo y Build](#desarrollo-y-build)). Para usar la app instalada no necesitas nada más.

## Uso rápido

1. **Elige la fuente** arriba en la barra lateral (`AnimeAV1` o `JkAnime`). Puedes cambiarla cuando quieras.
2. **Revisa tu carpeta** en Ajustes si no quieres usar la de por defecto (`Descargas\OmniAnime`). Puedes tener hasta 3.
3. **Busca** en Inicio por título o pega el enlace a una ficha del proveedor activo. También puedes explorar el Catálogo con filtros.
4. **Descarga**: elige episodios y mándalos a la cola. Sigue el progreso en **Descargas**: ahí puedes pausar, cancelar, reintentar fallidos o saltar de servidor.
5. **Organiza**: lo descargado aparece en **Librería** (reproducir, renombrar, reordenar, eliminar) y queda registrado en **Historial**.

| Vista | Para qué sirve |
|-------|----------------|
| **Inicio** | Buscar anime en la fuente activa |
| **Catálogo** | Explorar con filtros |
| **Horarios** | Consultar la programación semanal de la fuente activa |
| **Detalles** | Ver sinopsis, episodios y relaciones |
| **Descargas** | Seguir el progreso: pausar, cancelar, reintentar fallidos o saltar de servidor |
| **Librería** | Reproducir, renombrar, reordenar y eliminar lo descargado |
| **Historial** | Ver todo lo descargado, agrupado por anime y carpeta |
| **Escáner** | Revisar qué anime está vinculado a cada carpeta, cambiar el vínculo o actualizar sus datos e imágenes sin modificar los vídeos |

## Datos, actualización y desinstalación

### Dónde se guarda todo

- **Tus videos**: en las carpetas que configures (por defecto `Descargas\OmniAnime`). Cada carpeta guarda su info en un archivo oculto `.omnianime`.
- **Base de datos y ajustes**: en tu carpeta de datos de Windows (`%APPDATA%\OmniAnime\omnianime.db`). Ahí viven la cola, el historial y la configuración.
- **Temporales**: durante la descarga se usan archivos `.part`/`.ytdl` en una subcarpeta oculta `.cache/` dentro del destino. Puedes limpiarlos desde Ajustes → Almacenamiento.

### Actualizar

La app instalada busca actualizaciones al arrancar. Si hay una disponible, abre el aviso o selecciona **Actualizar** en la barra lateral. Pulsa **Descargar e instalar** y, cuando termine la descarga, **Reiniciar para instalar**.

También puedes descargar y ejecutar el instalador de la [última versión](https://github.com/Anthony00q/OmniAnime/releases/latest). Ambas opciones conservan tus carpetas, historial y ajustes.

### Desinstalar

Usa Agregar o quitar programas de Windows. Tus videos y la base de datos de `%APPDATA%\OmniAnime` **no se borran**; elimínalos a mano si ya no los quieres.

## Dudas comunes

### ¿Tiene doblaje?

Sí, en AnimeAV1. Selecciona DUB en la ficha para comprobar los episodios disponibles. Las versiones SUB y DUB se guardan en carpetas separadas.

### ¿Necesito cuenta?

No. No hay cuentas, nube ni inicio de sesión: la imagen de la ficha viene de un catálogo público y tampoco pide cuenta.

### ¿Una descarga falla o va lenta?

La app prueba con el siguiente servidor automáticamente. Si algo queda como fallido, reinténtalo desde Descargas.

### ¿El antivirus bloquea algo?

`ffmpeg` va incluido en la app. Si tu antivirus lo marca, revisa su aviso antes de permitirlo.

### ¿Puedo cambiar la carpeta después?

Sí, en Ajustes. El cambio solo afecta a las nuevas descargas: lo ya descargado no se mueve solo.

### ¿Puedo tener más de 3 carpetas?

No, el máximo es 3.

## Seguridad

- Las operaciones sobre vídeos y carpetas de la librería y las descargas se limitan a los destinos que configures. Los datos internos de la app se guardan por separado.
- Los enlaces de fichas se abren por HTTPS en [AnimeAV1](https://animeav1.com/), [JkAnime](https://jkanime.net/) o [AniList](https://anilist.co/). Las notas de versión tienen una política aparte para enlaces HTTPS a dominios públicos, incluida la página de la versión en GitHub.
- La interfaz admite imágenes remotas de `cdn.animeav1.com`, `cdn.jkdesa.com` y `s4.anilist.co`, además de las imágenes locales de la app.

## Desarrollo y Build

<details>
<summary>Ver instrucciones para desarrolladores</summary>

### Requisitos

```bash
node ^22.18.0 || ^24.11.0 || >=26.0.0
npm  11.21.0
```

### Correr en desarrollo

```bash
npm install --global npm@11.21.0  # solo si tu versión de npm es distinta
npm ci
npx --no-install install-electron
npm run setup:tools   # descarga ffmpeg verificado a tools/win/
npm run dev:vite      # terminal 1: servidor de interfaz
npm start             # terminal 2: motor Electron
```

### Modo experimental (concurrencia)

Solo para experimentación: `OMNIANIME_CONCURRENCY_EXPERIMENT=learned|cold` registra las decisiones
del modo adaptativo en `concurrency-experiments.json` sin tocar el aprendizaje real. En uso normal no
hace falta ninguna variable de entorno.

### Build

```bash
npm ci
npm run setup:tools  # obligatorio en clon fresco (los .exe no van en git)
npm run build:win  # verifica herramientas, compila y genera el instalador en release/
```

Antes de publicar: `npm run lint` y `npm run format:check`.

Consulta la [guía de binarios y releases](docs/binarios-y-releases.md) para el proceso de publicación.

### Herramientas de desarrollo

Vite+ se instala localmente con npm; no requiere una CLI global. Los scripts de interfaz usan
Vite, el lint usa Oxlint y el formato usa Oxfmt. La configuración está en `vite.config.mts`;
`scripts/format-options.mjs` comparte el estilo con el generador de preloads.

Se mantienen TypeScript y `ts-node` para el motor Electron. El plugin de React conserva únicamente
las reglas `prop-types` y `no-deprecated`, todavía sin equivalente nativo en Oxlint; ESLint satisface
el requisito de ese plugin, pero no se ejecuta como linter independiente.

`npm run build` sigue siendo la compilación completa. Ejecutar `vp build` directamente solo
compila la interfaz y no sustituye la generación de preloads ni la compilación del motor.

`packageManager` fija npm 11.21.0, también en CI y release. La política `allowScripts` bloquea
únicamente los scripts de instalación de `better-sqlite3`, que ya distribuye el binario de Windows x64.
Así `npm ci` evita la recompilación innecesaria causada por un
[fallo conocido de npm](https://github.com/npm/cli/issues/9837), sin desactivar los demás scripts
ni cambiar la versión de SQLite. No hace falta usar `--ignore-scripts`.

Electron se prepara explícitamente con `npx --no-install install-electron` para el desarrollo local;
el empaquetador obtiene su propio ejecutable al construir el instalador.

### Pruebas

La lógica usa `node:test`; Playwright controla Electron real con perfil y destinos temporales,
sin acceder a los datos del usuario ni a Internet. Preparación desde la raíz con Node/npm de
`package.json`:

```powershell
npm ci
npx --no-install install-electron
npm run test:all
```

`npm test` ejecuta los contratos críticos versionados en `checks/unit/`. `test:all` compila y
ejecuta esos checks y el piloto de Electron; funciona sin la colección privada `tests/`.
Tras un build actualizado, `npm run test:electron` ejecuta solo el piloto y
`npm run test:performance` mide navegación vacía y una cola simulada de 1.000 episodios,
con tres procesos nuevos por escenario. No se necesita `playwright install`: se usa el Chromium
incluido en Electron, cuyo soporte en Playwright es
experimental. CI y release ejecutan los checks y el piloto; las mediciones son voluntarias.

`npm run typecheck:checks` comprueba los tipos publicados y `npm run format:checks`, el formato
del harness y runner. `npm run test:coverage` genera `coverage/critical.lcov` solo para módulos
cargados por los checks, no un porcentaje global de la app.

Los resultados se guardan en `test-results/` y el informe de Playwright, en `playwright-report/`.
Las mediciones usan datos simulados: no representan transferencias reales ni certifican ausencia
de fugas. El piloto no sustituye las pruebas del instalador ni de los proveedores externos.

### Stack tecnológico

| Capa | Tecnología |
|------|------------|
| **App** | [Electron](https://www.electronjs.org/) |
| **Interfaz** | [React](https://react.dev/) + [Vite+](https://viteplus.dev/) + [Tailwind CSS](https://tailwindcss.com/) + TypeScript |
| **Estado** | [Jotai](https://jotai.org/) + [TanStack Query](https://tanstack.com/query) |
| **UI** | [Radix UI](https://www.radix-ui.com/) + [lucide-react](https://lucide.dev/) + [sonner](https://sonner.emilkowal.ski/) |
| **Datos / Descargas** | `better-sqlite3` + `axios` + `cheerio` + `megajs` |
| **Binarios** | `ffmpeg` en `tools/win/` (descargado con `setup:tools`) |

### Estructura del proyecto

```
OmniAnime/
├─ index.js              # entrada de Electron
├─ LICENSE               # GPL-3.0-or-later
├─ THIRD-PARTY-NOTICES.md # licencia de ffmpeg
├─ .github/workflows/    # validación y publicación por tags vX.X.X
├─ package.json          # scripts y configuración del instalador NSIS
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
├─ scripts/              # herramientas de desarrollo y publicación
├─ tools/win/            # ffmpeg (no versionado)
```

</details>

## Licencia

Código bajo licencia **GNU General Public License v3.0 o posterior**
(ver [LICENSE](./LICENSE)). El binario incluido
(`ffmpeg`) tiene su propia licencia, documentada
en [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md) (ambos archivos viajan dentro del instalador).
Quien reciba el instalador tiene derecho a obtener el código fuente completo correspondiente.

---

<p align="center"><sub>Full IA 😈</sub></p>
