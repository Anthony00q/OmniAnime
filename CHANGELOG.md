# Changelog

## [1.0.9] - 2026-09-20

### Descargas

- La cola muestra la velocidad actual de cada descarga en curso.
- Al pulsar **Saltar servidor**, la tarjeta y el episodio muestran **Cambiando servidor…** hasta completar el cambio.
- **Saltar servidor** solo afecta al elemento en curso, sin alterar el resto de la cola.
- **Mega: conexiones por archivo** permite ajustar el paralelismo de cada archivo entre **1 y 8**.

### Ajustes

- Los textos de todos los apartados utilizan explicaciones más claras y directas.
- En **Registros**, la vista muestra una tabla de sesiones de más reciente a más antigua con las opciones **Todas y Respaldos**.
- En **Registros**, cada fichero se abre en un diálogo con lo más reciente primero y aviso cuando se alcanza el límite.
- En **Registros**, los ficheros se seleccionan y se eliminan por fichero, manteniendo protegida la sesión en curso.
- En **Registros**, el tamaño de página se elige entre **5 y 20** y la sesión actual se puede copiar con aviso cuando se recorta.
- En **Registros**, la exportación incluye siempre todas las sesiones.

### Interfaz

- Los botones de minimizar, maximizar y cerrar utilizan esquinas suaves de estilo nativo con aire al borde.

## [1.0.8] - 2026-09-15

### Interfaz

- la ficha muestra el estudio solo cuando se identifica bien; si no, la fila se oculta en vez de poner desconocido.
- la ficha ya no se queda cargando si la imagen tarda: espera como mucho **2** segundos y luego muestra el contenido.
- los botones de minimizar, maximizar y cerrar tienen acabado en pastilla y dejan aire al borde para no pisar la barra de scroll.
- avisos con textos más claros en el inicio, el catálogo y la ficha cuando no hay conexión o no hay resultados.

### Ajustes

- en **Registros**, la vista abre por defecto en **Sesión actual** y puedes cambiar a **Todas las sesiones** cuando quieras ver más.
- en **Registros**, lo más reciente sale primero y las entradas se agrupan por sesión con su fecha.
- en **Registros**, ya se puede borrar cualquier entrada antigua sin esperar un día; la sesión actual sigue protegida.
- en **Registros**, se conservan hasta **50** sesiones (unos 200 MB como máximo).
- en **Descargas**, **Conexiones por archivo** ahora va por separado para **MediaFire** y **MP4Upload**.

## [1.0.7] - 2026-09-13

### Interfaz

- la ficha muestra una imagen panorámica superior cuando está disponible, que llega hasta el borde de la ventana con un acabado suave; si no hay imagen, queda en plano como antes.
- los textos de la ficha (título alternativo, datos y géneros) llevan sombra para seguir leyéndose sobre la imagen.
- las fichas abren más rápido al pulsar un póster desde el inicio, el catálogo, la franquicia u otras vistas.
- la barra de scroll de la ficha ya no deja ver la imagen por detrás al bajar.
- en la ficha, las listas de episodios que caben en pantalla ya no dejan un hueco vacío por el que se pueda seguir bajando.
- la barra lateral, las cabeceras de las vistas y los ajustes usan separadores más tenues, sin líneas marcadas.

### Descargas

- los títulos largos de la cola se recortan con un fundido solo cuando no caben; si caben, se ven completos.
- HLS ahora ensambla en una pasada: menos espera al llegar al 100%, con progreso real hasta el final y aviso **Ensamblando** mientras termina.

### Librería

- las carpetas guardan la imagen panorámica de AniList cuando vincula bien; si no, quedan sin banner en vez de reutilizar el póster.
- el banner de una carpeta también llega hasta el borde superior de la ventana, con el mismo acabado que la ficha.
- al abrir una carpeta, los marcadores de carga muestran tantos huecos como episodios hay, en vez de seis fijos.

### Ajustes

- en **Registros**, el contador muestra cuántas entradas hay seleccionadas para borrar en vez de cuántas hay cargadas.

### General

- la app ya solo incluye **ffmpeg** (sin ffprobe): menos piezas instaladas y menos avisos de antivirus; las miniaturas se siguen generando con normalidad.

## [1.0.6] - 2026-09-12

### Descargas

- el Detalle por episodio ya no despliega toda la lista: abre con **3** episodios a la vista y su barra inferior permite ver más o menos de uno en uno, hasta **7** a la vez.

### Ajustes

- en **Registros**, al seleccionar entradas para borrar, las duplicadas idénticas se marcan y se borran juntas, y el diálogo indica las filas afectadas.

### Librería

- las miniaturas de los episodios se generan de forma más fiable.

### Búsqueda

- sin conexión, el buscador avisa de que no pudo buscar en vez de decir que no hay resultados.

### Interfaz

- sin conexión, el inicio, el catálogo y la ficha muestran el aviso **Sin conexión** con **Reintentar** en vez de aparecer vacíos o como si no hubiera resultados.

## [1.0.5] - 2026-09-11

### Descargas

- HLS ahora usa motor propio: descargas más rápidas y retoma los fragmentos donde quedaron al pausar y seguir.
- MediaFire y MP4Upload también reanudan donde quedaron en vez de empezar de cero.
- al reanudar, la barra muestra el progreso real desde el inicio en vez de quedarse quieta.

### Ajustes

- nueva pestaña **Registros**: visor del registro con filtros por nivel, módulo y texto, entradas largas plegables, borrado de entradas de hace más de 1 día y botones para **mostrar el archivo** o exportar el diagnóstico.
- nuevos ajustes **Registro detallado** (guarda trazas de proveedores y reintentos al diagnosticar un fallo) y **Nivel mínimo** (elige cuánto detalle se guarda).
- nuevo ajuste **Segmentos HLS en paralelo** (de **4** a **16**, recomendado: **10**) en Concurrencia.
- desaparecen el botón **Actualizar yt-dlp** y el ajuste **Timeout de red** (sin efecto): ya no hacen falta.

## [1.0.4] - 2026-09-10

### Descargas

- el servidor PDrain ya no aparece en la lista porque AnimeAV1 dejó de ofrecerlo.
- MP4Upload ahora descarga en directo y en partes en paralelo, igual que MediaFire: más velocidad y progreso real por episodio.
- Mega ahora reintenta los cortes y reanuda las pausas donde quedaron, sin empezar de cero.

### Interfaz

- el botón de pausa y la insignia **Parcial** del historial usan el tono neutro, sin naranja.

### Ajustes

- **Conexiones por archivo** llega hasta **8** (recomendado: **4**) y vale para MediaFire y MP4Upload; el desplegable ya no se corta con el texto largo.

## [1.0.3] - 2026-09-09

### Interfaz

- el aviso de actualización es más grande y presenta las novedades agrupadas por tema, con negritas y viñetas.
- la pausa y la cola usan tonos neutros en insignias, barras y textos; el naranja queda solo para los avisos.

### Descargas

- el Detalle por episodio se ajusta a su contenido y ya no deja hueco vacío con pocas descargas.

## [1.0.2] - 2026-09-09

### Actualizaciones

- las novedades ahora se muestran en texto limpio, sin código.
- el progreso de descarga muestra el porcentaje en números enteros.
- la actualización solo se instala al pulsar **Reiniciar para instalar**; cerrar la app ya no la instala sola.
- el aviso de la barra lateral ahora se distingue como botón azul.

### Librería

- al reordenar o renombrar episodios, las miniaturas siguen a su episodio al momento, sin salir y volver a entrar.
- en JkAnime, los animes largos (p. ej. One Piece) ya muestran miniatura en los episodios de la cola al bajar hasta ellos.

### Ajustes

- las carpetas ahora se pueden reordenar también con los botones **Subir** y **Bajar**, manejables por teclado.

### Interfaz

- la lista de episodios de Detalles ya no salta al hacer scroll en listas largas.

## [1.0.1] - 2026-09-08

### Interfaz

- el botón **Volver** de Detalles ahora anima su flecha al pasar el cursor, igual que en Librería.

## [1.0.0] - 2026-09-08

### General

- Primera versión pública con búsqueda, catálogo con filtros y fichas con episodios para AnimeAV1 y JkAnime (solo **SUB**).

### Descargas

- reintentos por servidor, pausa/cancelación total y por episodio, historial y reintento de fallidos.

### Librería

- hasta **3 carpetas** con renombrado, reordenado, miniaturas y escáner de carpetas huérfanas.

### Interfaz

- temas Oscuro, OLED y Quantum, notificaciones y atajos de teclado.
