# Despliegue

`npm run build` deja en `dist/` un sitio estático: `index.html`, `404.html` (copia para rutas internas), `assets/`, `favicon.svg`, `manifest.webmanifest`, `robots.txt`, `.nojekyll` y `_headers`. Sirve `dist/` desde cualquier alojamiento estático con HTTPS.

## Variables de compilación

| Variable | Uso | Ejemplo |
|---|---|---|
| `BASE_PATH` | Ruta base cuando el sitio no cuelga de la raíz | `/youtube-clean/` (GitHub Pages de proyecto) |
| `YC_CSP_CONNECT` | Orígenes permitidos en `connect-src` (separados por espacio). Por defecto `https:` | `https://www.googleapis.com` |
| `YC_CSP_IMG` | Orígenes permitidos en `img-src`. Por defecto `https:` | `https://i.ytimg.com https://yt3.ggpht.com` |

Si tu despliegue usa siempre la misma fuente, restringe la CSP: por ejemplo, solo Data API:

```bash
YC_CSP_CONNECT="https://www.googleapis.com" \
YC_CSP_IMG="https://i.ytimg.com https://yt3.ggpht.com" \
npm run build
```

Con una instancia fija de Invidious, añade su origen a ambas variables. Con la CSP restringida, elegir otra fuente en Ajustes fallará (el navegador bloquea la petición): es el comportamiento deseado para un despliegue cerrado.

## Cabeceras de seguridad

`dist/_headers` contiene la política completa (la CSP de la `<meta>` más `frame-ancestors 'none'`) y:

```
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()
Cross-Origin-Opener-Policy: same-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

- **Netlify** y **Cloudflare Pages** leen `_headers` tal cual.
- **GitHub Pages** no permite cabeceras: queda la CSP de la `<meta>` (todo menos `frame-ancestors`) y el resto de cabeceras no se aplica. Sigue siendo seguro para el usuario; solo no impide que otro sitio enmarque la aplicación.
- **nginx**:

```nginx
server {
    listen 443 ssl http2;
    server_name clean.ejemplo.org;
    root /var/www/youtube-clean/dist;

    add_header Content-Security-Policy "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; connect-src 'self' https:; frame-src https://www.youtube-nocookie.com; font-src 'self'; manifest-src 'self'; media-src 'none'; object-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'self'; upgrade-insecure-requests; frame-ancestors 'none'" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()" always;
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Sin registros de acceso: no hace falta saber quién usa la aplicación.
    access_log off;

    location / {
        try_files $uri $uri/ /index.html;
    }
    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
```

- **Caddy**:

```
clean.ejemplo.org {
    root * /var/www/youtube-clean/dist
    file_server
    try_files {path} /index.html
    header {
        Content-Security-Policy "…(la misma de arriba)…"
        Referrer-Policy "no-referrer"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
        Cross-Origin-Opener-Policy "same-origin"
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
    }
    log {
        output discard
    }
}
```

Copia la CSP exacta de `dist/_headers` para que coincida con la de la compilación (cambia si usas `YC_CSP_*`).

## Rutas internas

La aplicación usa rutas reales (`/ver/ID`, `/buscar?q=`). El servidor debe devolver `index.html` para cualquier ruta desconocida (`try_files` en nginx/Caddy; `404.html` en GitHub Pages; en Netlify/Cloudflare, una regla `/* /index.html 200` en `_redirects` si hiciera falta).

## GitHub Pages

1. Sube el repositorio y activa **Settings → Pages → Source: GitHub Actions**.
2. El flujo `.github/workflows/pages.yml` compila con `BASE_PATH=/<repositorio>/` y publica en cada push a `main`.
3. La URL será `https://<usuario>.github.io/<repositorio>/`.

## Registros del servidor

El encargo pide no registrar consultas ni IPs sin necesidad justificada. Las búsquedas van en la URL (`/buscar?q=…`) y, aunque el servidor solo sirve archivos estáticos, un registro de acceso las guardaría. Desactívalo (`access_log off`) o filtra la cadena de consulta.

## Indexación

`index.html` lleva `<meta name="robots" content="noindex">` y `robots.txt` deshabilita el rastreo. Es la opción por defecto para un despliegue personal; quita ambas si quieres que el sitio aparezca en buscadores.

## Actualizaciones y auditoría

- `npm run check` antes de publicar: lint, tipos, pruebas, build y comprobación del inventario de conexiones.
- `npm audit --omit=dev` revisa las dependencias de producción (solo React). El CI lo ejecuta con `--audit-level=high`.
- Si una actualización de dependencias añadiera una conexión, `check:connections` la detectaría.
