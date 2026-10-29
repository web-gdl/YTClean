# Arquitectura y decisiones

## Qué es

Una aplicación de una sola página, estática, sin backend. Se compila a `dist/` (un HTML, un JS, un CSS, iconos y manifiesto) y se sirve desde cualquier alojamiento estático. Toda la lógica corre en el navegador del usuario; no hay ningún componente servidor propio que pueda ver datos de nadie.

## Pila y por qué

| Elemento | Elección | Motivo |
|---|---|---|
| Interfaz | React 19 + TypeScript estricto | Lo propone el encargo; ecosistema conocido, componentes simples. `exactOptionalPropertyTypes` y `noUncheckedIndexedAccess` activados |
| Compilación | Vite 8 | Rápido, salida estática limpia, sin código en línea (compatible con una CSP estricta) |
| Estilos | CSS propio con variables (`src/styles/global.css`) | Evita Tailwind y cualquier dependencia: el encargo pide evitar dependencias innecesarias. Tema claro/oscuro con `prefers-color-scheme` y `data-theme` |
| Enrutador | Propio (`src/app/router.ts`, ~100 líneas) | Cuatro rutas con parámetros no justifican una dependencia. Usa `history.pushState` y `useSyncExternalStore` |
| Peticiones | `fetch` nativo envuelto en `fetchJson` | Único punto de salida: `credentials: "omit"`, `referrerPolicy: "no-referrer"`, tiempo máximo, errores normalizados. ESLint prohíbe llamar a `fetch` fuera de ese archivo |
| Estado | Hooks de React + pequeños almacenes observables sobre `localStorage` | Sin librería de estado. `useSyncExternalStore` para ajustes y colecciones |
| Pruebas | Vitest + jsdom + Testing Library; Playwright para extremo a extremo | Unitarias para la lógica (análisis de URL, adaptadores, almacenamiento, CSP); e2e sobre la compilación de producción con la CSP real y sin salir a Internet |
| Calidad | ESLint 10 (typescript-eslint estricto con tipos, react-hooks), `tsc --noEmit`, `npm audit` en CI | |

Dependencias de ejecución: `react`, `react-dom`. Nada más.

## Módulos

```
src/main.tsx            arranque; aplica el tema antes del primer render
src/App.tsx             enruta a la página según la ruta actual
src/app/router.ts       parseRoute, routes.*, navigate, useRoute
src/app/strings.ts      todos los textos (español) en un objeto; traducir = otro archivo
src/app/theme.ts        applyTheme

src/data/types.ts       VideoSummary, VideoDetails, ChannelInfo, PlaylistInfo, Page, DataProvider, ProviderError
src/data/http.ts        fetchJson, buildUrl, normalizeInstanceUrl, HttpError
src/data/util.ts        parseYouTubeInput, duraciones, formato, lectura tolerante de JSON
src/data/registry.ts    createProvider(settings) → DataProvider | null
src/data/providers/     youtubeDataApi.ts, invidious.ts, piped.ts

src/storage/localStore.ts   acceso seguro a localStorage (prefijo yc:), createStore observable, clearAll
src/storage/settings.ts     modelo de ajustes y useSettings()
src/storage/collections.ts  favoritos e historial (desactivado por defecto)

src/player/embedUrl.ts      buildEmbedUrl (youtube-nocookie.com), atributos sandbox/allow
src/player/VideoPlayer.tsx  fachada → iframe

src/hooks/useAsync.ts       useAsync (una petición cancelable) y usePagedList («cargar más»)
src/components/             Layout (cabecera, navegación, pie), SearchBox, VideoCard/VideoList, Status, Link
src/pages/                  Home, Search, Watch (+WatchPlaylist), Channel, Playlist, Saved, Settings, Privacy, NotFound
```

## Flujo de datos

1. El usuario escribe y **envía** (nunca se busca al teclear). `SearchBox` reconoce enlaces de YouTube (`parseYouTubeInput`) y navega directamente al vídeo, lista o canal; si no, a `/buscar?q=`.
2. La página pide a `createProvider(settings)` un adaptador. Si no hay ninguno configurado, muestra un error con enlace a Ajustes.
3. `usePagedList`/`useAsync` llaman al adaptador con un `AbortSignal` que se cancela al cambiar de ruta o desmontar. El estado «cargando» se deriva de que el resultado guardado no pertenece a las dependencias actuales, sin escribir estado dentro de efectos.
4. Los adaptadores convierten JSON desconocido al modelo común leyendo cada campo de forma tolerante (`asString`, `asNumber`…). Un campo ausente nunca rompe la vista.
5. La página de vídeo renderiza la fachada con la miniatura; al pulsar ▶, `VideoPlayer` construye la URL de `youtube-nocookie.com` con los parámetros de los ajustes y crea el iframe. Los metadatos son independientes: si fallan, el reproductor sigue funcionando.

## Estado local

- `createStore` guarda un objeto por clave y **solo escribe** cuando el valor difiere del anterior; si el resultado es igual a los valores por defecto, borra la clave. Así una visita sin interacción no deja rastro.
- `favorites` escribe al guardar; `watchHistory.record` no hace nada salvo que `keepHistory` esté activado.
- `clearAll` elimina únicamente las claves con prefijo `yc:` (y `sessionStorage`), sin tocar nada de otros orígenes ni del iframe.
- Los cambios en otra pestaña se propagan por el evento `storage`.

## Seguridad

- **CSP** definida una sola vez en `scripts/csp.mjs`; `vite.config.ts` la inserta como `<meta>` en la compilación de producción y `scripts/postbuild.mjs` genera `dist/_headers` (versión completa con `frame-ancestors`). En desarrollo no hay CSP porque el refresco rápido de Vite usa código en línea; por eso las pruebas e2e corren sobre `vite preview`.
- `script-src 'self'`, `style-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `frame-src` solo `youtube-nocookie.com`. `connect-src`/`img-src` permiten `https:` por defecto porque la instancia la elige el usuario; se restringen con `YC_CSP_CONNECT`/`YC_CSP_IMG` en despliegues fijos.
- El iframe lleva `sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"` (sin `allow-top-navigation` ni `allow-forms`) y `allow="autoplay; encrypted-media; fullscreen; picture-in-picture"`.
- Sin `eval`, sin `dangerouslySetInnerHTML`, sin `document.cookie` (regla de ESLint). Las descripciones se muestran como texto plano.
- `npm run check:connections` recorre `src/`, `public/`, `index.html` y `dist/` buscando `https?://host` y exige que cada host esté en `docs/conexiones.json` (o sea un marcador como `ejemplo.org`).

## Accesibilidad

HTML semántico (cabecera, navegación, `main`, `article`, `aside`), enlace «saltar al contenido», etiquetas en todos los campos, `role="status"`/`alert` para estados, `aria-pressed` en botones conmutables, `aria-current` en la navegación, foco visible, fuentes del sistema, contraste alto en ambos temas, `prefers-reduced-motion`.

## Rendimiento

Un solo bundle (~290 KB, ~89 KB gzip, casi todo React), sin fuentes ni imágenes propias, miniaturas con `loading="lazy"`, el reproductor solo bajo demanda. No hay service worker: evita caché persistente y mantiene el principio de almacenamiento mínimo; el coste es que la aplicación no funciona sin red (no tendría sentido sin ella).

## Qué queda fuera a propósito

- Backend o proxy propio (ver `proveedores.md`): se añadirá solo si aporta una función concreta.
- Comentarios, recomendaciones, tendencias, Shorts, suscripciones remotas.
- Control programático del reproductor (velocidad, calidad, subtítulos) mediante la API JavaScript de YouTube: exigiría cargar un script de Google; el reproductor ya ofrece esos controles en su interfaz.
- Descarga o extracción de flujos de vídeo.
