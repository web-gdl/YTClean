# YouTube Clean

Interfaz web privada y minimalista para buscar y reproducir vídeos públicos de YouTube.

- **Sin anuncios propios**: la aplicación no inserta publicidad, banners, patrocinios ni recomendaciones.
- **Sin rastreo propio**: ni analítica, ni píxeles, ni cookies, ni identificadores, ni servidor propio.
- **Sin cuentas**: no hay registro ni inicio de sesión. Lo que guardas (favoritos, ajustes y, si lo activas, historial) vive solo en tu navegador y se borra con un botón.
- **Sin distracciones**: nada de tendencias, Shorts, recomendaciones algorítmicas ni notificaciones.
- **Transparente**: todas las conexiones posibles están en [docs/conexiones.json](docs/conexiones.json), la compilación falla si aparece un dominio no documentado, y la página «Privacidad» de la aplicación se genera a partir de ese mismo inventario.

Es un sitio estático (React + TypeScript + Vite) que puedes alojar en cualquier parte. No necesita backend.

> **Dos formas de reproducir, dicho claramente.**
> - **Por defecto**, los vídeos se reproducen con el reproductor oficial de YouTube en modo de privacidad mejorada (`youtube-nocookie.com`), que se carga **solo cuando pulsas ▶**. Ese reproductor corre dentro de un iframe en un origen de Google: recibe tu IP, el ID del vídeo y el origen de la página, puede guardar datos en su propio origen y **puede mostrar los anuncios de YouTube dentro del vídeo**. YouTube Clean elimina todo lo que añade una web alrededor del vídeo, pero no altera ni bloquea el reproductor oficial.
> - **Modo local (opcional)**: un servicio en tu propio equipo usa yt-dlp para obtener los flujos y la web los reproduce con `<video>` nativo, sin el reproductor de YouTube ni sus anuncios, con solo audio, descarga en alta calidad, subtítulos y velocidad. Es la vía de NewPipe/FreeTube: no es conforme a las condiciones de YouTube y queda para uso personal y local. Ver [docs/modo-local.md](docs/modo-local.md).
>
> Más detalles en [docs/privacidad.md](docs/privacidad.md).

## Cómo funciona

1. **Enlace directo** (sin configurar nada): pega un enlace o ID de YouTube y se abre el reproductor. No se consulta ningún servicio de datos.
2. **Búsqueda, canales y listas**: necesitan una *fuente de datos* que eliges en Ajustes. Hay tres adaptadores intercambiables:

| Fuente | Cómo | Privacidad | Fiabilidad |
|---|---|---|---|
| **YouTube Data API v3** | Tu propia clave de Google Cloud, guardada solo en tu navegador | Google ve tu IP, tus búsquedas y tu clave | Alta (API oficial). Cuota: 10 000 unidades/día; cada búsqueda cuesta 100 |
| **Invidious** | Una instancia pública o propia | La instancia ve tu IP y búsquedas; Google ve la IP de la instancia | Variable: YouTube bloquea instancias con frecuencia |
| **Piped** | Una instancia pública o propia (URL de la API) | Igual que Invidious | Variable |
| **Servicio local (yt-dlp)** | `npm run local` en tu equipo | Google ve la IP de tu equipo; sin cuenta, clave ni terceros | Depende de yt-dlp (actualízalo a menudo) |

La fuente se puede cambiar en cualquier momento; [docs/proveedores.md](docs/proveedores.md) documenta los límites de cada una y cómo añadir otra.

3. **Reproducción**: fachada con miniatura y botón ▶; al pulsar se inserta el reproductor oficial con `sandbox`, permisos mínimos y parámetros documentados (`rel=0`, sin anotaciones, subtítulos e idioma según tus ajustes). Controles, velocidad, calidad y subtítulos los ofrece el propio reproductor. Con el **reproductor local** (Ajustes) se usa `<video>` nativo alimentado por el servicio local.

## Modo local (NewPipe en tu navegador)

```bash
pip install -U "yt-dlp[default]"   # motor; ffmpeg opcional para 720p/1080p
npm run build && npm run local     # http://127.0.0.1:8787
```

En Ajustes elige la fuente «Servicio local (yt-dlp)» y el reproductor «Local». Obtienes búsqueda sin clave, reproducción sin el reproductor de YouTube (sin sus anuncios), solo audio, descarga a caché en alta calidad con progreso, subtítulos, velocidad, imagen en imagen y controles del sistema. El servicio solo escucha en tu máquina, no reenvía cookies y exige una cabecera propia para que ninguna web ajena pueda usarlo. Detalles, límites y API en [docs/modo-local.md](docs/modo-local.md).

## App Android

GitHub Actions compila un APK firmado en cada push a `main` y lo publica en **Releases**. Dentro funcionan el reproductor oficial y las fuentes de datos; el modo local sin anuncios necesita Termux en el teléfono (`npm run local:android`). Instalación y detalles en [docs/android.md](docs/android.md).

## Uso rápido

```bash
npm ci
npm run dev        # http://127.0.0.1:5173
npm run check      # lint + tipos + pruebas + build + inventario de conexiones
npm run preview    # sirve dist/ con la CSP de producción
npm run local      # modo local: sirve dist/ + API yt-dlp en http://127.0.0.1:8787
```

Para publicar, copia `dist/` a cualquier alojamiento estático; [docs/despliegue.md](docs/despliegue.md) explica las cabeceras de seguridad, GitHub Pages y cómo restringir la CSP a los proveedores que uses.

### Obtener una clave de la Data API (opcional)

1. En [Google Cloud Console](https://console.cloud.google.com/apis/library/youtube.googleapis.com) crea un proyecto y activa «YouTube Data API v3».
2. Crea una **clave de API** y restríngela por «sitios web» (referrer HTTP) al dominio donde alojes la aplicación.
3. Pégala en Ajustes → Fuente de datos → YouTube Data API. Se guarda solo en tu navegador y solo se envía a `www.googleapis.com`.

## Funciones

- Búsqueda de vídeos (solo al pulsar Buscar o Intro; nunca mientras escribes) con paginación.
- Página de vídeo: reproductor, título, canal, fecha, visualizaciones, duración, descripción plegable, avisos de vídeo privado, no insertable, con restricción de edad o geográfica.
- Canales (incluidos `@handles`) y listas de reproducción, con «reproducir toda la lista» en el reproductor oficial.
- Guardados (favoritos) e historial opcional (desactivado por defecto), solo locales.
- Tema claro, oscuro o como el sistema; miniaturas desactivables; subtítulos e idioma del reproductor.
- Diseño adaptable (móvil, tableta, escritorio), navegación por teclado, `prefers-reduced-motion`, sin fuentes externas.
- Instalable como aplicación web (manifiesto) sin service worker ni caché persistente.

## Privacidad y seguridad

- Sin servidor propio, sin analítica, sin cookies, sin identificadores. Una visita sin interacción no escribe nada en el navegador.
- Todas las peticiones salen con `credentials: "omit"` y `referrerPolicy: "no-referrer"` (la Data API, con solo el origen, por la restricción de la clave); las imágenes externas tampoco envían referrer.
- CSP estricta en producción (`script-src 'self'`, sin código en línea, `frame-src` limitado a `youtube-nocookie.com`, `object-src 'none'`), más `Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options` y otras cabeceras en `dist/_headers`.
- `npm run check:connections` compara los dominios presentes en el código y en `dist/` con el inventario; cualquier dominio nuevo rompe la compilación.
- Dependencias de ejecución: solo `react` y `react-dom`. Sin Tailwind, sin enrutador externo, sin librería de peticiones.

Lee [docs/privacidad.md](docs/privacidad.md) para el inventario completo, el modelo de amenazas y los límites.

## Estructura

```
local/        servicio local opcional (Node sin dependencias): yt-dlp, proxy, caché
src/
  app/        enrutador propio, textos, tema
  data/       modelo de datos, interfaz DataProvider, adaptadores (providers/), HTTP, utilidades
  storage/    localStorage con espacio de nombres: ajustes, guardados, historial
  player/     URL del embed, fachada del reproductor oficial y reproductor local
  pages/      inicio, búsqueda, ver, canal, lista, guardados, ajustes, privacidad
  components/ cabecera, buscador, tarjetas, estados
scripts/      csp.mjs (política única), postbuild.mjs, check-connections.mjs
docs/         conexiones.json (inventario), privacidad, proveedores, arquitectura, despliegue, modo-local
tests/        pruebas unitarias y de componentes (Vitest + jsdom)
e2e/          pruebas de extremo a extremo (Playwright, sin salir a Internet)
```

[docs/arquitectura.md](docs/arquitectura.md) explica las decisiones.

## Licencia

Dominio público ([Unlicense](LICENSE)). YouTube Clean no está afiliado a YouTube ni a Google; YouTube es una marca de Google LLC. Usar la aplicación implica aceptar las condiciones de los servicios a los que decidas conectarte.
