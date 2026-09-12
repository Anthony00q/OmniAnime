# Changelog

## v1.0.6

Descargas:
- el Detalle por episodio ya no despliega toda la lista: abre con **3** episodios a la vista y su barra inferior permite ver más o menos de uno en uno, hasta **7** a la vez.

Ajustes:
- en **Registros**, al seleccionar entradas para borrar, las duplicadas idénticas se marcan y se borran juntas, y el diálogo indica las filas afectadas.

Librería:
- las miniaturas de los episodios se generan de forma más fiable.

Búsqueda:
- sin conexión, el buscador avisa de que no pudo buscar en vez de decir que no hay resultados.

Interfaz:
- sin conexión, el inicio, el catálogo y la ficha muestran el aviso **Sin conexión** con **Reintentar** en vez de aparecer vacíos o como si no hubiera resultados.

## v1.0.5

Descargas:
- HLS ahora usa motor propio: descargas más rápidas y retoma los fragmentos donde quedaron al pausar y seguir.
- MediaFire y MP4Upload también reanudan donde quedaron en vez de empezar de cero.
- al reanudar, la barra muestra el progreso real desde el inicio en vez de quedarse quieta.

Ajustes:
- nueva pestaña **Registros**: visor del registro con filtros por nivel, módulo y texto, entradas largas plegables, borrado de entradas de hace más de 1 día y botones para **mostrar el archivo** o exportar el diagnóstico.
- nuevos ajustes **Registro detallado** (guarda trazas de proveedores y reintentos al diagnosticar un fallo) y **Nivel mínimo** (elige cuánto detalle se guarda).
- nuevo ajuste **Segmentos HLS en paralelo** (de **4** a **16**, recomendado: **10**) en Concurrencia.
- desaparecen el botón **Actualizar yt-dlp** y el ajuste **Timeout de red** (sin efecto): ya no hacen falta.

## v1.0.4

Descargas:
- el servidor PDrain ya no aparece en la lista porque AnimeAV1 dejó de ofrecerlo.
- MP4Upload ahora descarga en directo y en partes en paralelo, igual que MediaFire: más velocidad y progreso real por episodio.
- Mega ahora reintenta los cortes y reanuda las pausas donde quedaron, sin empezar de cero.

Interfaz:
- el botón de pausa y la insignia **Parcial** del historial usan el tono neutro, sin naranja.

Ajustes:
- **Conexiones por archivo** llega hasta **8** (recomendado: **4**) y vale para MediaFire y MP4Upload; el desplegable ya no se corta con el texto largo.

## v1.0.3

Interfaz:
- el aviso de actualización es más grande y presenta las novedades agrupadas por tema, con negritas y viñetas.
- la pausa y la cola usan tonos neutros en insignias, barras y textos; el naranja queda solo para los avisos.

Descargas:
- el Detalle por episodio se ajusta a su contenido y ya no deja hueco vacío con pocas descargas.

## v1.0.2

Actualizaciones:
- las novedades ahora se muestran en texto limpio, sin código.
- el progreso de descarga muestra el porcentaje en números enteros.
- la actualización solo se instala al pulsar **Reiniciar para instalar**; cerrar la app ya no la instala sola.
- el aviso de la barra lateral ahora se distingue como botón azul.

Librería:
- al reordenar o renombrar episodios, las miniaturas siguen a su episodio al momento, sin salir y volver a entrar.
- en JkAnime, los animes largos (p. ej. One Piece) ya muestran miniatura en los episodios de la cola al bajar hasta ellos.

Ajustes:
- las carpetas ahora se pueden reordenar también con los botones **Subir** y **Bajar**, manejables por teclado.

Interfaz:
- la lista de episodios de Detalles ya no salta al hacer scroll en listas largas.

## v1.0.1

- Interfaz: el botón **Volver** de Detalles ahora anima su flecha al pasar el cursor, igual que en Librería.

## v1.0.0

- General: Primera versión pública con búsqueda, catálogo con filtros y fichas con episodios para AnimeAV1 y JkAnime (solo **SUB**).
- Descargas: reintentos por servidor, pausa/cancelación total y por episodio, historial y reintento de fallidos.
- Librería: hasta **3 carpetas** con renombrado, reordenado, miniaturas y escáner de carpetas huérfanas.
- Interfaz: temas Oscuro, OLED y Quantum, notificaciones y atajos de teclado.
