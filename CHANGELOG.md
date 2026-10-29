# Historial de cambios

## 0.2.0 — 2026-10-29

- **Modo local** (`local/`, `npm run local`): servicio Node sin dependencias que sirve la web y expone `/local/*` con yt-dlp como motor: búsqueda, canales y listas sin clave ni terceros; resolución de flujos; proxy con Range para reproducción inmediata y solo audio; descarga a caché en alta calidad (ffmpeg) con progreso; subtítulos VTT; miniaturas reenviadas.
- **Reproductor local** con `<video>` nativo: calidad, solo audio, descarga y reproducción, subtítulos, velocidad, imagen en imagen, Media Session; cambio por vídeo entre reproductor local y oficial.
- Nuevo proveedor «Servicio local (yt-dlp)» y ajustes de dirección del servicio, modo de reproductor y caché.
- CSP: `media-src 'self'` (antes `'none'`). Inventario y página de privacidad actualizados con el servicio local.
- Pruebas: servicio local completo con yt-dlp simulado (sin red), proveedor y reproductor local. 64 pruebas unitarias.
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
