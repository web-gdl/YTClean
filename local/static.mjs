// Servidor de archivos estáticos para dist/ con cabeceras de seguridad y
// respaldo a index.html para las rutas internas de la aplicación.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

export function createStaticHandler(distDir, securityHeaders) {
  const root = resolve(distDir);
  const index = join(root, 'index.html');
  const hasDist = existsSync(index);

  return function serveStatic(req, res, pathname) {
    for (const [k, v] of Object.entries(securityHeaders)) res.setHeader(k, v);
    if (!hasDist) {
      res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        '<!doctype html><meta charset="utf-8"><title>YouTube Clean</title><p style="font-family:sans-serif;padding:1rem">Falta <code>dist/</code>: ejecuta <code>npm run build</code> y vuelve a iniciar el servicio local.</p>',
      );
      return;
    }
    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const safe = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, '');
    let file = join(root, safe);
    if (!file.startsWith(root + sep) && file !== root) {
      res.writeHead(403).end();
      return;
    }
    if (!existsSync(file) || statSync(file).isDirectory()) {
      // Ruta interna de la aplicación (sin extensión) → index.html
      file = extname(safe) ? null : index;
    }
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');
      return;
    }
    const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Content-Length': statSync(file).size };
    headers['Cache-Control'] = file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(file).pipe(res);
  };
}
