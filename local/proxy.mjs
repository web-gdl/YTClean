// Proxy de medios con soporte de Range: el navegador pide /local/stream/… y el
// servicio reenvía la petición a la URL resuelta por yt-dlp con las cabeceras
// que yt-dlp indica. Se usa el fetch nativo de Node.
import { Readable } from 'node:stream';

const PASS_RESPONSE_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'];

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} url URL de origen
 * @param {Record<string,string>} [upstreamHeaders] cabeceras adicionales (User-Agent…)
 * @param {{ contentType?: string, cacheControl?: string }} [opts]
 */
export async function proxyMedia(req, res, url, upstreamHeaders = {}, opts = {}) {
  const controller = new AbortController();
  const onClose = () => controller.abort();
  res.on('close', onClose);
  const headers = { ...upstreamHeaders };
  if (req.headers.range) headers.Range = req.headers.range;
  // Nunca reenviar cookies ni cabeceras del navegador.
  let upstream;
  try {
    upstream = await fetch(url, { method: req.method === 'HEAD' ? 'HEAD' : 'GET', headers, redirect: 'follow', signal: controller.signal });
  } catch (e) {
    res.off('close', onClose);
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Origen inaccesible: ${e instanceof Error ? e.message : String(e)}`);
    return;
  }
  const out = {};
  for (const h of PASS_RESPONSE_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) out[h] = v;
  }
  if (opts.contentType) out['content-type'] = opts.contentType;
  out['cache-control'] = opts.cacheControl ?? 'private, max-age=0';
  out['x-content-type-options'] = 'nosniff';
  if (!out['accept-ranges']) out['accept-ranges'] = 'bytes';
  res.writeHead(upstream.status, out);
  if (req.method === 'HEAD' || !upstream.body) {
    res.end();
    return;
  }
  const body = Readable.fromWeb(upstream.body);
  body.on('error', () => {
    if (!res.writableEnded) res.end();
  });
  body.pipe(res);
}
