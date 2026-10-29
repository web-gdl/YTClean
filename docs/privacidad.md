# Privacidad: inventario, modelo de amenazas y límites

El inventario legible por máquina está en [`conexiones.json`](conexiones.json). Lo usan la página «Privacidad» de la aplicación y `scripts/check-connections.mjs`, que hace fallar la compilación si en el código o en `dist/` aparece un dominio que no esté documentado aquí. Este documento es la versión explicada.

## 1. Principios

1. **Ningún servidor propio.** La aplicación es un conjunto de archivos estáticos. No existe nada que pueda recibir búsquedas, historiales o IPs de los usuarios.
2. **Ninguna conexión hasta que la pides.** Abrir la portada no provoca ninguna petición fuera del propio sitio. La búsqueda requiere elegir una fuente; el reproductor se carga al pulsar ▶.
3. **Almacenamiento mínimo y bajo tu control.** `localStorage` del propio origen, con prefijo `yc:`, solo cuando cambias un ajuste, guardas un vídeo o activas el historial. Ajustes → «Borrar todos los datos locales» lo elimina.
4. **Sin cookies, sin identificadores, sin cuentas, sin sincronización, sin notificaciones, sin service worker, sin procesos en segundo plano.**
5. **Sin terceros en el código.** Solo `react` y `react-dom` en producción. Ninguna fuente, script, imagen o estilo de terceros en el sitio.

## 2. Conexiones posibles

Todas las peticiones salen con `credentials: "omit"` (sin cookies ni autenticación) y `referrerPolicy: "no-referrer"`, salvo las de la Data API, que envían solo el **origen** (`strict-origin`) para que funcione la restricción de la clave por sitio web. Las imágenes externas llevan `referrerpolicy="no-referrer"`. El iframe del reproductor usa `strict-origin-when-cross-origin` (YouTube recibe el **origen** de la página, no la ruta).

| Dominio | Tipo | Cuándo | Qué puede recibir |
|---|---|---|---|
| `www.youtube-nocookie.com` | reproductor | Al pulsar ▶ en un vídeo o abrir una lista en el reproductor oficial | IP, ID del vídeo/lista, origen de la página, parámetros del reproductor. El reproductor corre en su propio origen: puede guardar datos allí y cargar recursos de Google. Fuera de nuestro control |
| `i.ytimg.com` | imágenes | Miniaturas con la Data API y en el modo de enlace directo, si están activadas | IP e ID del vídeo |
| `yt3.ggpht.com` | imágenes | Avatar del canal con la Data API, si las miniaturas están activadas | IP e identificador de la imagen |
| `www.googleapis.com` | datos | Solo con la fuente «YouTube Data API» | IP, texto buscado o IDs, y tu clave de API (ligada a tu proyecto de Google Cloud) |
| Instancia de Invidious (la que elijas) | datos e imágenes | Solo con la fuente «Invidious» | IP, texto buscado e IDs. Las miniaturas las sirve la instancia, no Google |
| Instancia de Piped (la que elijas) | datos e imágenes | Solo con la fuente «Piped» | IP, texto buscado e IDs. Miniaturas vía el proxy de la instancia |
| `www.youtube.com`, `developers.google.com`, `console.cloud.google.com`, `docs.invidious.io`, `api.invidious.io`, `github.com`, `docs.piped.video`, `react.dev` | solo enlaces | Nunca de forma automática: enlaces de ayuda, «Ver en YouTube», URL en comentarios del código o en mensajes de error de React | Lo que recoja el sitio al visitarlo tú. Sin referrer |

Los dominios `youtube.com`, `youtu.be`, `m.youtube.com`, `music.youtube.com` aparecen en el código únicamente para **reconocer** enlaces que pegas; nunca se contactan.

## 3. Almacenamiento en el navegador

| Dónde | Qué | Cuándo | Cómo borrarlo |
|---|---|---|---|
| `localStorage`, claves `yc:settings`, `yc:saved`, `yc:history` | Ajustes (fuente, clave o instancia, tema, miniaturas, subtítulos, idioma, historial), guardados e historial | Solo al cambiar un ajuste, guardar un vídeo o reproducir con el historial activado. Volver un ajuste a su valor por defecto elimina la clave | Ajustes → «Borrar todos los datos locales», o los datos del sitio en el navegador |
| Origen `www.youtube-nocookie.com` (iframe) | Lo que decida el reproductor oficial | Al reproducir | Datos del sitio en el navegador |

La aplicación **no crea cookies**. No puede impedir las que gestione el reproductor oficial en su propio origen.

### Un aviso sobre la clave de API

La clave de la Data API se guarda en `localStorage` en texto claro, como cualquier dato local. Es una clave *pública* por diseño (se envía en cada petición), pero conviene **restringirla por referrer** en Google Cloud para que no sirva desde otros sitios, y no usar la misma clave para otros servicios.

## 4. Modelo de amenazas (qué protege y qué no)

| Frente a | Protege | No protege |
|---|---|---|
| Rastreo y perfilado por parte de esta aplicación | Sí: no hay nada que rastree | — |
| Publicidad añadida por la web | Sí | Los anuncios que YouTube inserte **dentro** del reproductor |
| Google conociendo qué vídeos ves | Parcial: no hay cuenta ni cookies de YouTube de esta página; el modo de privacidad mejorada reduce el seguimiento | Google recibe tu IP y el ID de cada vídeo reproducido; con la Data API recibe también tus búsquedas |
| Operador de una instancia Invidious/Piped | — | Ve tu IP y tus búsquedas; puede registrarlas. Una instancia no es anonimato |
| Tu proveedor de Internet o la red local | — | Ve los dominios (SNI/DNS) a los que te conectas |
| Otras pestañas o extensiones del navegador | Parcial: `localStorage` es por origen | Una extensión con permisos puede leerlo todo |
| Historial del navegador | — | Las URL visitadas, incluidas las búsquedas (`/buscar?q=…`), quedan en el historial del navegador salvo que uses una ventana privada |

## 5. Lo que nunca hace

- Cargar analítica, píxeles, scripts, fuentes o estilos de terceros.
- Crear identificadores, perfiles o cuentas; sincronizar nada.
- Enviar búsquedas, historial o ajustes a un servidor propio: no existe.
- Buscar mientras escribes, mostrar tendencias o recomendaciones algorítmicas, enviar notificaciones.
- Usar `eval`, código en línea o `postMessage` hacia el reproductor (no se carga la API JavaScript de YouTube).

## 6. Cómo comprobarlo

- `npm run check:connections` lista cada dominio encontrado en el código y en `dist/` y falla si alguno no está en el inventario.
- `npm test` incluye pruebas que verifican que las peticiones salen sin credenciales ni referrer, que la fachada no crea el iframe hasta el clic, que nada se escribe en `localStorage` hasta que cambias algo y que la CSP no permite código en línea ni enmarcar otros orígenes.
- `npm run e2e` abre la compilación de producción en un navegador real, registra toda petición que salga del origen y comprueba que la portada no hace ninguna y que no hay violaciones de la CSP.
- En tu navegador: pestaña Red de las herramientas de desarrollo con la portada abierta: no debe haber ninguna petición externa.
