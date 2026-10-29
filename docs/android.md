# App Android (APK)

El APK es la misma aplicación web empaquetada con [Capacitor](https://capacitorjs.com) en un WebView de Android. Lo compila GitHub Actions (`.github/workflows/android.yml`) en cada push a `main` o a mano desde la pestaña **Actions → APK Android → Run workflow**.

## Descargar e instalar

1. En el repositorio, **Releases** → la más reciente («YT Clean 0.2.0-N») → descarga `YTClean-0.2.0-N.apk`. También está como artefacto `YTClean-apk` en la ejecución del flujo.
2. En el teléfono, abre el APK y permite instalar apps de «orígenes desconocidos» para el navegador o el gestor de archivos.
3. Para que las versiones siguientes se instalen **encima** de la anterior (sin perder ajustes), todas deben firmarse con la misma clave. Configúrala una vez como secreto del repositorio:

   ```bash
   keytool -genkeypair -keystore ytclean.keystore -alias ytclean -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=YT Clean"
   base64 -w0 ytclean.keystore > ytclean.keystore.b64     # en macOS: base64 -i ytclean.keystore
   ```

   En GitHub: **Settings → Secrets and variables → Actions → New repository secret**:
   - `YC_KEYSTORE_BASE64`: el contenido de `ytclean.keystore.b64`
   - `YC_KEYSTORE_PASSWORD`: la contraseña que elegiste
   - `YC_KEY_ALIAS`: `ytclean`

   Guarda `ytclean.keystore` fuera del repositorio (nunca lo subas). Sin esos secretos, cada APK se firma con una clave temporal distinta y para instalar uno nuevo hay que desinstalar el anterior.

## Qué funciona dentro del APK

| Función | Requisito |
|---|---|
| Reproductor oficial (youtube-nocookie.com) | Ninguno |
| Búsqueda con Data API, Invidious o Piped | Configurarlo en Ajustes, igual que en la web |
| **Modo local: búsqueda sin clave y reproducción sin anuncios** (solo audio, HQ, subtítulos…) | El servicio local en marcha en el propio teléfono con Termux (abajo) o en un PC de tu red |

En el APK, «Dirección del servicio local» viene ya rellenada con `http://127.0.0.1:8787`.

## Modo local en el teléfono (Termux)

Termux ejecuta Node, Python, yt-dlp y ffmpeg en Android. Instálalo desde F-Droid o GitHub (la versión de Google Play está desactualizada).

```bash
pkg update && pkg install git nodejs python ffmpeg
pip install -U "yt-dlp[default]"
git clone https://github.com/web-gdl/YTClean.git   # repositorio privado: usa un token o gh auth login
cd YTClean && npm ci
npm run local:android        # sirve la API en http://127.0.0.1:8787 para la app
```

Después, en YT Clean: Ajustes → fuente «Servicio local (yt-dlp)» y reproductor «Local». Deja Termux abierto mientras usas la app (o `termux-wake-lock` para que Android no lo suspenda). Actualiza yt-dlp de vez en cuando con `pip install -U "yt-dlp[default]"`.

`npm run local:android` no necesita compilar la web: la app ya la lleva dentro; el servicio solo responde a `/local/*` con CORS para el origen de la app (`http://localhost`).

## Detalles técnicos

- `capacitor.config.json`: `appId com.webgdl.ytclean`, origen `http://localhost` (`androidScheme: "http"`) y tráfico en claro permitido, necesario para hablar con `http://127.0.0.1:8787`. La app no carga nada en claro fuera de esa dirección: la CSP del APK solo añade `http://127.0.0.1:8787` a `connect-src`, `img-src` y `media-src` (`npm run build:android`).
- Botón Atrás: navega por el historial de la app y sale desde la portada (`@capacitor/app`).
- Permisos Android: solo `INTERNET`.
- Compilación local, si tienes Android Studio o el SDK: `npm run build:android && cd android && ./gradlew assembleRelease`.

## Límites conocidos (sin probar todavía en un teléfono)

- El reproductor oficial dentro de un WebView depende de que YouTube acepte el origen `http://localhost`; si muestra un error de configuración del reproductor (152/153), usa el reproductor local.
- La pantalla completa del `<video>` nativo la gestiona el WebView de Capacitor; en algunos fabricantes puede no girar la pantalla automáticamente.
- Si Android suspende Termux, el modo local dejará de responder hasta que vuelvas a abrirlo.
