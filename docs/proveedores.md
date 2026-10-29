# Fuentes de datos: qué usa cada una, sus límites y cómo añadir otra

La búsqueda y los metadatos (vídeos, canales, listas) pasan por la interfaz `DataProvider` (`src/data/types.ts`). La interfaz no conoce ningún servicio: cada adaptador vive en `src/data/providers/` y `src/data/registry.ts` crea el elegido a partir de los ajustes. La reproducción es independiente: siempre usa el reproductor oficial y funciona sin ninguna fuente.

```ts
interface DataProvider {
  searchVideos(query, { page?, signal? }) → Page<VideoSummary>
  getVideo(id)                            → VideoDetails
  getChannel(idOrHandle)                  → ChannelInfo
  getChannelVideos(channelId, { page? })  → Page<VideoSummary>
  getPlaylist(id)                         → PlaylistInfo
  getPlaylistItems(id, { page? })         → Page<VideoSummary>
}
```

`Page.nextPage` es un testigo opaco (token de la Data API, número de página de Invidious, JSON de Piped). Los errores se normalizan en `ProviderError` con un `code` (`network`, `quota`, `auth`, `not-found`, `unavailable`, `bad-response`, `not-configured`, `aborted`) que la interfaz traduce a mensajes.

**Ninguna de estas fuentes es anónima.** Quien atiende la petición ve tu IP y lo que consultas. La diferencia está en quién es: Google directamente (Data API) o el operador de una instancia (Invidious, Piped), que a su vez habla con Google desde su propia IP.

## YouTube Data API v3

- **Base:** `https://www.googleapis.com/youtube/v3/`. Documentación: <https://developers.google.com/youtube/v3/docs>.
- **Métodos usados:** `search.list` (búsqueda; `type=video`), `videos.list` (`snippet,contentDetails,statistics,status`), `channels.list` (`id`, `forHandle`), `playlists.list`, `playlistItems.list`.
- **Vídeos de un canal:** se leen de la lista de subidas `UU` + resto del ID (`UCxxxx` → `UUxxxx`), una convención estable de YouTube que evita gastar 100 unidades en `search.list` por canal.
- **Clave:** la pone el usuario en Ajustes; se guarda en `localStorage` y solo viaja a `www.googleapis.com`. Debe restringirse por referrer en Google Cloud.
- **Cuota:** 10 000 unidades diarias por proyecto por defecto. `search.list` cuesta **100**; cada `list` de vídeos, canales o listas cuesta **1**. Una búsqueda en esta aplicación cuesta 101 (búsqueda + detalles de duración y vistas). Es decir, **unas 99 búsquedas al día**. Al agotarse, la API devuelve 403 `quotaExceeded` y la aplicación muestra el error de cuota.
- **Fiabilidad:** alta; es la vía oficial y estable. Cambios anunciados con antelación.
- **Particularidades:** los títulos de `search.list` llegan con entidades HTML (`&amp;`, `&#39;`): se decodifican. `status.embeddable=false` y `contentRating.ytRating=ytAgeRestricted` permiten avisar antes de intentar reproducir. Los vídeos borrados o privados de una lista aparecen con título fijo y se omiten.
- **Lo que no hace:** no busca canales ni listas (solo vídeos), no muestra comentarios, no accede a nada que requiera OAuth (suscripciones, historial de la cuenta). Con `safeSearch=none` no filtra resultados.

## Invidious

- **Base:** la instancia elegida (`https://…`). Documentación: <https://docs.invidious.io/api/>.
- **Rutas usadas:** `GET /api/v1/search?q=&type=video&page=`, `GET /api/v1/videos/:id`, `GET /api/v1/channels/:ucid`, `GET /api/v1/channels/:ucid/videos?continuation=`, `GET /api/v1/playlists/:plid?page=`, `GET /api/v1/resolveurl?url=` (para `@handles`).
- **Miniaturas:** la instancia las reenvía (`/vi/ID/mqdefault.jpg`), así que con Invidious no se contacta con Google ni siquiera para imágenes (hasta pulsar ▶).
- **Fiabilidad:** variable. YouTube bloquea las IP de muchas instancias públicas; el síntoma típico es que la **búsqueda funciona pero `/api/v1/videos/:id` falla** (error 500 «Sign in to confirm you're not a bot»). La aplicación lo contempla: la página de vídeo muestra el reproductor aunque no consiga los metadatos. Para fiabilidad real, una instancia propia.
- **Paginación:** la búsqueda y las listas usan `page`; los canales usan `continuation`. Invidious no indica si hay más páginas de búsqueda, así que la aplicación ofrece «cargar más» mientras lleguen resultados.
- **Restricción geográfica:** se infiere de `allowedRegions` (un vídeo sin restricciones trae la lista completa, ~250 países). Es una heurística.
- **Dónde encontrar instancias:** <https://api.invidious.io/>. La aplicación no consulta esa lista por sí misma.

## Piped

- **Base:** la URL de la **API** de la instancia (p. ej. `https://pipedapi.ejemplo.org`, no la de la web). Documentación: <https://docs.piped.video/docs/api-documentation/>; rutas contrastadas con `ServerLauncher.java` de Piped-Backend.
- **Rutas usadas:** `GET /search?q=&filter=videos`, `GET /nextpage/search?q=&filter=videos&nextpage=`, `GET /streams/:id`, `GET /channel/:id`, `GET /@/:handle`, `GET /nextpage/channel/:id?nextpage=`, `GET /playlists/:id`, `GET /nextpage/playlists/:id?nextpage=`.
- **Miniaturas:** llegan reescritas al proxy de la instancia.
- **Fiabilidad:** la misma problemática que Invidious (`/streams/:id` es lo primero que falla cuando YouTube bloquea la instancia).
- **Paginación:** `nextpage` es un JSON opaco que se devuelve tal cual; `"null"` significa fin.
- **Dónde encontrar instancias:** <https://github.com/TeamPiped/Piped/wiki/Instances>.

## Enlace directo (sin fuente)

Con la fuente «Ninguna», la aplicación sigue reproduciendo cualquier enlace o ID de vídeo y cualquier lista (`/embed/videoseries?list=`) con el reproductor oficial, que muestra título y controles por sí mismo. No hay búsqueda, canales ni metadatos. Es el modo con menos conexiones: solo `youtube-nocookie.com` al pulsar ▶ (y `i.ytimg.com` para la miniatura de la fachada, si las miniaturas están activadas).

## Lo que no se puede hacer desde el navegador

- Llamar a la API interna de YouTube (`youtubei`) o a los RSS de canales: no envían cabeceras CORS, el navegador bloquea la respuesta.
- Leer `oembed` de YouTube: tampoco admite CORS.
- Descargar o reproducir los flujos de vídeo sin el reproductor oficial: además de CORS, YouTube exige firmas, tokens de integridad y su protocolo SABR; no es una vía admitida ni estable.

Por eso la única opción sin terceros y conforme a las condiciones de YouTube es la Data API con una clave propia; las instancias son el compromiso para quien no quiere hablar con Google directamente.

## Añadir una fuente (por ejemplo, un proxy propio)

1. Crea `src/data/providers/miFuente.ts` implementando `DataProvider`. Usa `fetchJson` de `src/data/http.ts` (sin credenciales ni referrer) y las utilidades `asRecord/asString/asNumber` para leer JSON desconocido sin confiar en él.
2. Añade el identificador a `ProviderId` (`src/data/types.ts`) y el caso en `createProvider` (`src/data/registry.ts`).
3. Añade los ajustes necesarios en `src/storage/settings.ts` y su formulario en `src/pages/SettingsPage.tsx`, con una nota de privacidad honesta.
4. Documenta los dominios en `docs/conexiones.json` (si son fijos) o en `userConfigured` (si los elige el usuario); `npm run check:connections` lo exigirá.
5. Escribe pruebas con `fetch` simulado en `tests/providers.test.ts`.

Un proxy propio (un pequeño servicio que consulte YouTube desde tu servidor y devuelva este mismo modelo de datos) eliminaría la dependencia de instancias públicas y mantendría la clave fuera del navegador. Queda fuera de esta versión a propósito: la aplicación no incluye backend hasta que haga falta.
