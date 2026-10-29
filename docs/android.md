# App Android nativa (APK)

`android/` es una app nativa en Kotlin, construida como NewPipe:

- **Extracción en el propio teléfono** con [NewPipeExtractor](https://github.com/TeamNewPipe/NewPipeExtractor) (la misma versión que usa NewPipe en desarrollo). Sin servidor, sin clave de API, sin cuenta y sin Termux.
- **Reproducción nativa** con ExoPlayer (Media3): sin el reproductor de YouTube y sin sus anuncios. Los flujos adaptativos se reproducen con manifiestos DASH generados en el teléfono y peticiones como las de NewPipe (POST con `rn`).
- **Tokens de integridad** (PoToken/BotGuard) generados en un WebView local, portado de NewPipe, para que YouTube no corte la reproducción.

## Qué hace

- Buscar vídeos (sin búsquedas mientras escribes, sin tendencias ni recomendaciones) con desplazamiento infinito.
- Pegar o **compartir** un enlace de YouTube con la app (o abrirlo desde el navegador) para reproducirlo directamente.
- Reproductor: calidad (360p…2160p), **solo audio**, pantalla completa al girar, **imagen en imagen**, compartir, descripción.
- Canales: vídeos del canal con paginación.
- Guardados: mantén pulsado un vídeo o usa «Guardar». Solo en el teléfono.
- Ajustes: calidad por defecto, solo audio por defecto, borrar datos.

Lo que **no** hace, a propósito: cuentas, historial, recomendaciones, comentarios, notificaciones, analítica, telemetría, publicidad. El único permiso es `INTERNET`. Los datos (guardados y ajustes) están en las preferencias privadas de la app y no se incluyen en copias de seguridad (`allowBackup=false`).

Privacidad: YouTube recibe la IP del teléfono y los vídeos que consultas, sin cuenta ni cookies de sesión (como con NewPipe). Este acceso no es conforme a las condiciones de servicio de YouTube; es un proyecto personal.

## Descargar e instalar

1. **Releases** del repositorio → la más reciente (`YT Clean 0.3.0-N`) → `YTClean-0.3.0-N.apk`. También queda como artefacto `YTClean-apk` en la ejecución de **Actions → APK Android**.
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
