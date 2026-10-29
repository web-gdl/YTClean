# Historial de cambios

## 0.4.0 — 2026-10-29

App Android, funciones al estilo LibreTube:
- **Segundo plano**: el reproductor vive en un servicio con MediaSession; controles en la notificación y la pantalla de bloqueo (anterior/reproducir/siguiente).
- **Suscripciones locales** sin cuenta y pestaña de novedades (pestaña «Vídeos» de cada canal, en paralelo).
- **SponsorBlock** con consulta por prefijo de hash (privacidad); salta patrocinios, autopromoción, recordatorios y partes sin música. Desactivable.
- **Listas locales** (crear, añadir, quitar, reproducir todo, aleatorio) y **cola** (reproducir a continuación, añadir a la cola, ver/saltar, avance automático).
- **Subtítulos** (VTT/TTML) seleccionables en el reproductor; opción para activarlos por defecto.
- **Descargas** de audio (M4A) o vídeo MP4 hasta la calidad elegida (vídeo + audio unidos sin recodificar) a Descargas/YTClean, con progreso en la notificación.
- **Shorts** ocultables (por defecto ocultos) e **historial** opcional (desactivado por defecto).
- Navegación inferior: Buscar · Suscripciones · Biblioteca; pantalla de ajustes.

## 0.3.0 — 2026-10-29

- **App Android nativa** (`android/`, Kotlin): sustituye al envoltorio Capacitor, que no era práctico (sin fuente configurada no buscaba). Busca y reproduce al instalarla: NewPipeExtractor en el teléfono, ExoPlayer/Media3 con manifiestos DASH, PoToken por WebView y peticiones como las de NewPipe. Canales, guardados, calidad, solo audio, pantalla completa, imagen en imagen y enlaces compartidos. Licencia GPL-3.0-or-later para la app Android.

## 0.2.0 — 2026-10-29

- **APK Android** (Capacitor 8): flujo `android.yml` que compila y publica un APK firmado en Releases; botón Atrás nativo; icono propio; CSP del APK con acceso solo a `http://127.0.0.1:8787`; `npm run local:android` para el servicio en Termux. Pages pasa a ejecución manual (repositorio privado).

- **Modo local** (`local/`, `npm run local`): servicio Node sin dependencias que sirve la web y expone `/local/*` con yt-dlp como motor: búsqueda, canales y listas sin clave ni terceros; resolución de flujos; proxy con Range para reproducción inmediata y solo audio; descarga a caché en alta calidad (ffmpeg) con progreso; subtítulos VTT; miniaturas reenviadas.
- **Reproductor local** con `<video>` nativo: calidad, solo audio, descarga y reproducción, subtítulos, velocidad, imagen en imagen, Media Session; cambio por vídeo entre reproductor local y oficial.
- Nuevo proveedor «Servicio local (yt-dlp)» y ajustes de dirección del servicio, modo de reproductor y caché.
- CSP: `media-src 'self'` (antes `'none'`). Inventario y página de privacidad actualizados con el servicio local.
- Pruebas: servicio local completo con yt-dlp simulado (sin red), proveedor y reproductor local. 64 pruebas unitarias.
- Correcciones de la revisión independiente: la Data API envía solo el origen como referrer (las claves restringidas por sitio web fallaban); la fachada ya no pide miniaturas a Google con Invidious/Piped/servicio local; palabras de 11 letras («programador») ya no se toman por IDs; rutas con codificación inválida y errores de render no dejan la pantalla en blanco (ErrorBoundary); `color-scheme` sigue al tema forzado; el historial se registra al reproducir (también en modo enlace directo); guardados sin URL de miniatura persistida; deduplicación de la primera página; listas en `watch?list=`; errores 403/429 con mensajes correctos; `<noscript>` sin estilo en línea; sin `interest-cohort` en Permissions-Policy; foco al cambiar de página; Node ≥ 20.19.
- Correcciones menores: entrada de enlace directo sin validación `type=url`; respaldo de `color-mix` y `:has` para navegadores antiguos.

## 0.1.0 — 2026-10-29

Primera versión.

- Portada con búsqueda (solo al enviar) y apertura de enlaces directos sin configuración.
- Fuentes de datos intercambiables: YouTube Data API v3 (clave propia), Invidious y Piped, con prueba de conexión desde Ajustes.
- Páginas de resultados, vídeo, canal (incluidos `@handles`), lista de reproducción, guardados, ajustes y privacidad.
- Reproductor: fachada que no carga nada hasta pulsar ▶; iframe de `youtube-nocookie.com` con sandbox y permisos mínimos; reproducción de listas completas en el reproductor oficial; avisos de vídeo privado, no insertable, con restricción de edad o geográfica.
- Datos locales: ajustes, guardados e historial opcional (desactivado por defecto) en `localStorage`, con borrado total.
- Tema claro/oscuro/sistema, miniaturas desactivables, subtítulos e idioma del reproductor.
- Seguridad: CSP estricta en producción, cabeceras en `_headers`, peticiones sin credenciales ni referrer, inventario de conexiones verificado en la compilación.
- Pruebas unitarias (Vitest) y de extremo a extremo (Playwright), CI y publicación en GitHub Pages.
