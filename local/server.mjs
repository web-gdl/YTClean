#!/usr/bin/env node
// Servicio local de YouTube Clean.
//
//   node local/server.mjs [--port 8787] [--host 127.0.0.1] [--dist dist] [--cache local/cache]
//                         [--yt-dlp yt-dlp] [--dev-origin http://127.0.0.1:5173]
//
// Sirve la web compilada (dist/) en http://127.0.0.1:8787 y, bajo /local/*, la
// API que usa yt-dlp para buscar, resolver y reproducir sin el reproductor
// oficial. Solo escucha en la máquina local. No hay cuentas, cookies ni
// registro de peticiones.
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Api, errorResponse, HttpError } from './api.mjs';
import { Cache } from './cache.mjs';
import { createStaticHandler } from './static.mjs';
import { YtDlp } from './ytdlp.mjs';
import { buildHeaderCsp, cspOptionsFromEnv, SECURITY_HEADERS } from '../scripts/csp.mjs';

const here = dirname(fileURLToPath(import.meta.url));

export function parseArgs(argv, env = process.env) {
  const opts = {
    port: Number(env.YC_PORT ?? 8787),
    host: env.YC_HOST ?? '127.0.0.1',
    dist: env.YC_DIST ?? resolve(here, '..', 'dist'),
    cache: env.YC_CACHE ?? resolve(here, 'cache'),
    ytdlp: env.YC_YTDLP ?? 'yt-dlp',
    devOrigin: env.YC_DEV_ORIGIN ?? '',
    jsRuntime: env.YC_JS_RUNTIME ?? '',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i] ?? '';
    if (a === '--port') opts.port = Number(next());
    else if (a === '--host') opts.host = next();
    else if (a === '--dist') opts.dist = resolve(next());
    else if (a === '--cache') opts.cache = resolve(next());
    else if (a === '--yt-dlp') opts.ytdlp = next();
    else if (a === '--dev-origin') opts.devOrigin = next();
    else if (a === '--js-runtime') opts.jsRuntime = next();
    else if (a === '--help' || a === '-h') {
      console.log('Uso: node local/server.mjs [--port 8787] [--host 127.0.0.1] [--dist dist] [--cache local/cache] [--yt-dlp yt-dlp] [--js-runtime node|deno] [--dev-origin http://127.0.0.1:5173]');
      process.exit(0);
    }
  }
  return opts;
}

function which(bin) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim().split('\n')[0] : null;
}

/** Crea el servidor sin escuchar (para pruebas). */
export function createApp(opts) {
  const ffmpeg = Boolean(which('ffmpeg'));
  // Deno es el runtime por defecto de yt-dlp; si no está, usamos el propio Node.
  let jsRuntime = opts.jsRuntime || undefined;
  if (!jsRuntime && !which('deno')) jsRuntime = `node:${process.execPath}`;
  const ytdlp = new YtDlp({ bin: opts.ytdlp, jsRuntime });
  const cache = new Cache({ dir: opts.cache, ytdlp, ffmpeg });
  const version = readVersion();
  const api = new Api({ ytdlp, cache, version, ffmpeg, jsRuntime });
  const securityHeaders = { 'Content-Security-Policy': buildHeaderCsp(cspOptionsFromEnv()), ...SECURITY_HEADERS };
  delete securityHeaders['Strict-Transport-Security']; // el servicio es http://127.0.0.1
  const serveStatic = createStaticHandler(opts.dist, securityHeaders);
  const allowedHosts = new Set([`${opts.host}:${opts.port}`, `localhost:${opts.port}`, `127.0.0.1:${opts.port}`, `[::1]:${opts.port}`]);
  const devOrigin = opts.devOrigin ? opts.devOrigin.replace(/\/$/, '') : '';

  const server = createServer((req, res) => {
    handle(req, res).catch((e) => {
      const { status, body } = errorResponse(e);
      if (!res.headersSent) sendJson(res, status, body);
      else res.end();
    });
  });

  async function handle(req, res) {
    const host = req.headers.host ?? '';
    if (!allowedHosts.has(host)) {
      sendJson(res, 421, { error: 'bad-host', message: 'Host no permitido' });
      return;
    }
    const url = new URL(req.url ?? '/', `http://${host}`);
    const path = url.pathname;

    if (devOrigin) {
      const origin = req.headers.origin;
      if (origin === devOrigin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'x-yc-local, content-type, range');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Expose-Headers', 'content-length, content-range, accept-ranges');
        if (req.method === 'OPTIONS') {
          res.writeHead(204).end();
          return;
        }
      }
    }

    if (!path.startsWith('/local/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405).end();
        return;
      }
      serveStatic(req, res, path);
      return;
    }

    const parts = path.split('/').filter(Boolean).slice(1); // sin "local"
    const [resource, a, b] = parts.map((p) => {
      try {
        return decodeURIComponent(p);
      } catch {
        return '';
      }
    });
    const media = resource === 'stream' || resource === 'file' || resource === 'subs' || resource === 'thumb' || resource === 'image';

    // Las rutas JSON exigen una cabecera propia: una web ajena no puede
    // llamarlas (el navegador exigiría CORS para enviarla).
    if (!media && req.headers['x-yc-local'] !== '1') {
      throw new HttpError(403, 'forbidden', 'Falta la cabecera X-YC-Local');
    }
    if (media && req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method', 'Método no permitido');

    switch (resource) {
      case 'status':
        return sendJson(res, 200, await api.status());
      case 'search':
        return sendJson(res, 200, await api.search(url.searchParams.get('q'), url.searchParams.get('page')));
      case 'video':
        return sendJson(res, 200, await api.video(a));
      case 'channel':
        if (b === 'videos') return sendJson(res, 200, await api.channelVideos(a, url.searchParams.get('page')));
        return sendJson(res, 200, await api.channel(a));
      case 'playlist':
        if (b === 'items') return sendJson(res, 200, await api.playlistItems(a, url.searchParams.get('page')));
        return sendJson(res, 200, await api.playlist(a));
      case 'resolve':
        return sendJson(res, 200, await api.resolve(a));
      case 'stream':
        return api.stream(req, res, a, b);
      case 'subs':
        return api.subs(req, res, a, b, url.searchParams.get('auto') === '1');
      case 'thumb':
        return api.thumb(req, res, a);
      case 'image':
        return api.image(req, res, url.searchParams.get('u') ?? '');
      case 'file':
        return cache.serve(req, res, a);
      case 'download':
        if (req.method === 'POST') return sendJson(res, 202, await api.download(a, url.searchParams.get('quality') ?? '720'));
        return sendJson(res, 200, api.downloadStatus(a));
      case 'cache':
        if (req.method === 'DELETE' && a) return sendJson(res, 200, { ok: cache.remove(a) });
        if (req.method === 'DELETE') {
          cache.clear();
          return sendJson(res, 200, { ok: true });
        }
        return sendJson(res, 200, cache.list());
      default:
        throw new HttpError(404, 'not-found', 'Ruta desconocida');
    }
  }

  return { server, api, cache, ytdlp, ffmpeg, jsRuntime, opts };
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(text);
}

function readVersion() {
  try {
    return JSON.parse(readFileSync(resolve(here, '..', 'package.json'), 'utf8')).version ?? '0';
  } catch {
    return '0';
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const opts = parseArgs(process.argv.slice(2));
  const app = createApp(opts);
  app.server.listen(opts.port, opts.host, async () => {
    const v = await app.ytdlp.version();
    console.log(`YouTube Clean · servicio local en http://${opts.host}:${opts.port}/`);
    console.log(`  yt-dlp: ${v ?? 'NO ENCONTRADO (' + opts.ytdlp + ')'}  ffmpeg: ${app.ffmpeg ? 'sí' : 'no (sin descargas HQ)'}  runtime JS: ${app.jsRuntime ?? 'deno (por defecto)'}`);
    console.log(`  web: ${existsSync(resolve(opts.dist, 'index.html')) ? opts.dist : 'falta dist/ (ejecuta npm run build)'}  caché: ${opts.cache}`);
    if (opts.devOrigin) console.log(`  CORS permitido para ${opts.devOrigin}`);
  });
}
