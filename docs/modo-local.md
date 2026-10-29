# Modo local: reproducir sin el reproductor de YouTube

El modo local añade un pequeño servicio que corre **en tu propio equipo** y usa [yt-dlp](https://github.com/yt-dlp/yt-dlp) como motor. Con él, la aplicación puede:

- **Buscar, ver canales y listas sin clave de API ni instancias de terceros**: yt-dlp consulta YouTube desde tu máquina (sin cuenta ni cookies). Es el proveedor «Servicio local (yt-dlp)».
- **Reproducir con `<video>` nativo, sin el iframe de YouTube**: no se carga el reproductor oficial, así que no aparecen sus anuncios ni sus controles. Es el reproductor «Local».
  - Reproducción inmediata en calidad progresiva (normalmente 360p) o **solo audio** (AAC/Opus), ambos a través de un proxy local con soporte de Range (se puede saltar a cualquier punto).
  - **Alta calidad bajo demanda**: 720p, 1080p… se descargan a una caché local (vídeo + audio remuxados a un MP4 con ffmpeg, sin recodificar) y se reproducen en cuanto terminan; la segunda vez es instantáneo y funciona sin red.
  - Subtítulos (manuales y automáticos) como pistas VTT, velocidad 0,5×–2×, imagen en imagen y controles del sistema (Media Session: teclas multimedia, pantalla de bloqueo).

> **Condiciones de servicio.** YouTube no admite el acceso a sus vídeos fuera de su reproductor o de su API oficial; este modo lo hace igual que NewPipe, FreeTube o el propio yt-dlp. Está pensado para pruebas personales en tu propio equipo. El sitio estático publicado (GitHub Pages, etc.) no incluye el servicio ni puede usarlo salvo que tú lo arranques en tu máquina; por defecto, todo sigue funcionando con el reproductor oficial.

## Requisitos

| Componente | Para qué | Instalación |
|---|---|---|
| Node.js ≥ 20.11 | Ejecuta el servicio | <https://nodejs.org> |
| yt-dlp (reciente) | Consulta YouTube y resuelve los flujos | `pip install -U "yt-dlp[default]"` (incluye los scripts `yt-dlp-ejs`), o el ejecutable oficial de <https://github.com/yt-dlp/yt-dlp/releases> |
| Runtime JavaScript | yt-dlp lo necesita para resolver los desafíos de YouTube | El servicio usa el propio Node si no encuentra Deno (`--js-runtimes node`). Deno es el recomendado por yt-dlp y se usa automáticamente si está instalado |
| ffmpeg (opcional) | Remuxar vídeo + audio para las calidades altas | Sin ffmpeg solo hay reproducción progresiva, solo audio y descargas ≤ 720p de un único archivo si existe |

Actualiza yt-dlp con frecuencia (`pip install -U "yt-dlp[default]"` o `yt-dlp -U`): YouTube cambia a menudo y es yt-dlp quien absorbe esos cambios; el servicio no contiene ninguna lógica de YouTube.

## Puesta en marcha

```bash
npm ci
npm run build          # compila la web en dist/
npm run local          # http://127.0.0.1:8787  (sirve dist/ y la API /local/*)
```

Abre `http://127.0.0.1:8787/` y en **Ajustes**:

1. Fuente de datos → **Servicio local (yt-dlp)**.
2. Reproductor → **Local (servicio + yt-dlp)**.
3. Deja «Dirección del servicio local» vacía (mismo origen). Ajustes muestra la versión de yt-dlp, si hay ffmpeg, el runtime JS y el tamaño de la caché.

Ambos ajustes son independientes: puedes buscar con la Data API y reproducir en local, o al revés. En cada vídeo hay un enlace para cambiar entre el reproductor local y el oficial sin tocar los ajustes.

Opciones del servicio:

```
node local/server.mjs [--port 8787] [--host 127.0.0.1] [--dist dist] [--cache local/cache]
                      [--yt-dlp /ruta/yt-dlp] [--js-runtime node|deno] [--dev-origin http://127.0.0.1:5173]
```

También como variables de entorno: `YC_PORT`, `YC_HOST`, `YC_DIST`, `YC_CACHE`, `YC_YTDLP`, `YC_JS_RUNTIME`, `YC_DEV_ORIGIN`.

### En desarrollo

Con `npm run dev` la web se sirve en `http://127.0.0.1:5173` y el servicio en otro origen. Arranca el servicio con `npm run local:dev` (permite CORS para ese origen) y pon `http://127.0.0.1:8787` en «Dirección del servicio local».

## Cómo funciona

```
navegador ──(mismo origen)──> local/server.mjs ──spawn──> yt-dlp ──> YouTube
   <video src=/local/stream/ID/18>  ──proxy Range──>  googlevideo.com
   <video src=/local/file/ID>       ──archivo de la caché (MP4)
   <track src=/local/subs/ID/es>    ──proxy──>  subtítulos VTT
```

| Ruta | Qué hace |
|---|---|
| `GET /local/status` | Versión del servicio y de yt-dlp, ffmpeg, runtime JS, tamaño de la caché |
| `GET /local/search?q=&page=` | `yt-dlp -J --flat-playlist "ytsearchN:…"` (páginas de 20) |
| `GET /local/video/:id` | Metadatos del vídeo (`yt-dlp -J`) |
| `GET /local/channel/:id` · `/videos?page=` | Canal (`UC…` o `@handle`) y su pestaña de vídeos (30 por página) |
| `GET /local/playlist/:id` · `/items?page=` | Lista y sus vídeos (50 por página) |
| `GET /local/resolve/:id` | Opciones de reproducción: progresivas, solo audio, alturas HQ, caché, subtítulos |
| `GET /local/stream/:id/:formatId` | Proxy del flujo con Range y las cabeceras que indica yt-dlp |
| `GET /local/subs/:id/:lang?auto=1` | Subtítulos VTT |
| `GET /local/thumb/:id` · `/image?u=` | Miniaturas y avatares (solo dominios de YouTube) |
| `POST /local/download/:id?quality=720` · `GET …` | Inicia una descarga HQ a la caché / consulta su progreso |
| `GET /local/file/:id` | Archivo de la caché con Range |
| `GET /local/cache` · `DELETE /local/cache[/:id]` | Lista o vacía la caché |

La resolución de un vídeo se guarda en memoria dos horas (las URL de Google caducan en ~6 h). Se ejecutan como mucho dos procesos de yt-dlp a la vez y una descarga.

## Seguridad y privacidad

- Escucha solo en `127.0.0.1`. Rechaza peticiones cuyo `Host` no sea local (protección frente a *DNS rebinding*).
- Las rutas JSON exigen la cabecera `X-YC-Local: 1`; una web ajena abierta en tu navegador no puede enviarla sin CORS, así que no puede usar el servicio.
- No reenvía cookies ni cabeceras del navegador a YouTube; solo las que yt-dlp indica para cada formato (User-Agent).
- El proxy de imágenes solo acepta dominios de YouTube; los IDs se validan con expresiones regulares; no hay rutas que acepten URL arbitrarias.
- No escribe registros. La caché vive en `local/cache/` (ignorada por git) y se vacía desde Ajustes.
- Lo que ve YouTube: la IP de tu equipo, lo que buscas y los vídeos que reproduces; sin cuenta, sin cookies, sin clave. Lo mismo que vería con NewPipe.

## Límites

- **Directos**: no se admiten (usa el reproductor oficial para ellos).
- **Formatos**: solo se ofrecen los que un navegador reproduce (H.264/VP9/AV1 con AAC/Opus) y que yt-dlp entrega por HTTPS. Se descartan los que exigen un PO Token que yt-dlp no pudo generar (`MISSING POT`), los marcados como dañados, los SABR y los DRM. La reproducción inmediata suele ser 360p: YouTube ya no publica formatos progresivos mayores; para más calidad se usa la descarga a la caché.
- **Vídeos con restricción de edad o privados**: yt-dlp no puede acceder sin cuenta; el error se muestra y se ofrece el reproductor oficial.
- **Cambios de YouTube**: si todo empieza a fallar con «403» o «comprobación de bot», actualiza yt-dlp. Si hace falta un proveedor de PO Token externo, yt-dlp lo indicará en su salida (`detail` en el error) — consulta su wiki.
- **Safari/iOS**: puede rechazar medios desde `http://127.0.0.1` cuando la web se sirve por HTTPS; abre la web desde el propio servicio (`http://127.0.0.1:8787`).

## Pruebas

`tests/local/service.test.ts` arranca el servicio con un `yt-dlp` simulado (`tests/fixtures/fake-yt-dlp.mjs`) y un servidor de medios con Range, y comprueba búsqueda, paginación, canal, lista, resolución, proxy (Range y cabeceras, sin cookies), subtítulos, descarga con progreso, caché, CSRF, `Host` y CORS de desarrollo. `tests/LocalPlayer.test.tsx` y `tests/localProvider.test.ts` cubren el lado del navegador. Nada de esto toca la red.
