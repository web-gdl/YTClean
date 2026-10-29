# Historial de cambios

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
