# App Android nativa (APK)

`android/` es una app nativa en Kotlin, construida como NewPipe:

- **Extracción en el propio teléfono** con [NewPipeExtractor](https://github.com/TeamNewPipe/NewPipeExtractor) (la misma versión que usa NewPipe en desarrollo). Sin servidor, sin clave de API, sin cuenta y sin Termux.
- **Reproducción nativa** con ExoPlayer (Media3): sin el reproductor de YouTube y sin sus anuncios. Los flujos adaptativos se reproducen con manifiestos DASH generados en el teléfono y peticiones como las de NewPipe (POST con `rn`).
- **Tokens de integridad** (PoToken/BotGuard) generados en un WebView local, portado de NewPipe, para que YouTube no corte la reproducción.

## Qué hace

- **Buscar** (solo al enviar; sin tendencias ni recomendaciones), con desplazamiento infinito. Abre enlaces compartidos o pegados.
- **Reproductor nativo**: calidad 144p–2160p, solo audio, subtítulos, pantalla completa, imagen en imagen y **segundo plano con controles en la notificación**.
- **Cola**: «Reproducir a continuación», «Añadir a la cola», ver y saltar en la cola, avance automático.
- **SponsorBlock**: salta patrocinios, autopromoción, recordatorios de suscripción y partes sin música.
- **Suscripciones locales** (sin cuenta) con pestaña de novedades.
- **Biblioteca**: guardados, listas de reproducción locales, canales suscritos, historial (opcional) y descargas.
- **Descargas** de audio (M4A) o vídeo MP4 (vídeo y audio unidos sin recodificar) a Descargas/YTClean.
- **Shorts** ocultos por defecto (desactivable en Ajustes).
- **País o región** del contenido (Ajustes → Contenido): automático o cualquiera de los que admite YouTube.

Debajo del vídeo, una barra fija muestra las acciones principales (Guardar, Calidad, Audio, Descargar) y «Más» abre el resto en una hoja inferior. Mantén pulsado cualquier vídeo de una lista para ver todas sus acciones.

Lo que **no** hace, a propósito: cuentas, recomendaciones, comentarios, analítica, telemetría ni publicidad. Las notificaciones solo muestran los controles del reproductor y el progreso de las descargas. Permisos: Internet, notificaciones y servicios en primer plano (reproducción y descargas). Los datos (guardados, listas, suscripciones, historial y ajustes) están en las preferencias privadas de la app y no se incluyen en copias de seguridad (`allowBackup=false`).

Privacidad: YouTube recibe la IP del teléfono y los vídeos que consultas, sin cuenta ni cookies de sesión (como con NewPipe). Con SponsorBlock activado, sponsor.ajay.app recibe tu IP y los 4 primeros caracteres del hash SHA-256 del ID del vídeo (compartidos por muchos vídeos). Este acceso no es conforme a las condiciones de servicio de YouTube; es un proyecto personal.

## Descargar e instalar

1. **Releases** del repositorio → la más reciente (`YT Clean 0.5.x-N`) → `YTClean.apk`. También queda como artefacto `YTClean-apk` en la ejecución de **Actions → APK Android**.
2. Ábrelo en el teléfono y permite instalar apps de orígenes desconocidos.
3. Para actualizar sin desinstalar, todas las versiones deben firmarse con la misma clave. Configúrala una vez como secreto del repositorio:

   ```bash
   keytool -genkeypair -keystore ytclean.keystore -alias ytclean -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=YT Clean"
   base64 -w0 ytclean.keystore > ytclean.keystore.b64     # en macOS: base64 -i ytclean.keystore
   ```

   En GitHub: **Settings → Secrets and variables → Actions → New repository secret**: `YC_KEYSTORE_BASE64` (contenido de `ytclean.keystore.b64`), `YC_KEYSTORE_PASSWORD` y `YC_KEY_ALIAS` (`ytclean`). Guarda la clave fuera del repositorio. Sin esos secretos, cada APK lleva una clave temporal y hay que desinstalar el anterior.

## Mantenimiento

YouTube cambia a menudo. Si la reproducción deja de funcionar, actualiza la versión de NewPipeExtractor en `android/app/build.gradle.kts` a la que use NewPipe en ese momento (`gradle/libs.versions.toml` del repositorio de NewPipe, clave `teamnewpipe-newpipe-extractor`) y, si cambió, el código de `potoken/` y de `player/YtMedia.kt` con su equivalente en NewPipe.

## Compilar en local

Con el SDK de Android y Java 17+: `cd android && ./gradlew assembleRelease`.

## Licencia

La app Android incorpora NewPipeExtractor y código portado de NewPipe, ambos GPL-3.0-or-later, por lo que **la app Android se distribuye bajo GPL-3.0-or-later** (ver `android/LICENSE`). La aplicación web conserva su licencia.
