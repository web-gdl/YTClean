// @vitest-environment node
import { createServer, request as httpRequest, type Server } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../local/server.mjs';
import { classifyFormats, mapEntry, parseProgressLine } from '../../local/extract.mjs';

const MEDIA = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));

/** Servidor que imita a googlevideo: archivos con soporte de Range. */
function startMediaServer(): Promise<{ server: Server; base: string; requests: { url: string; headers: Record<string, string | string[] | undefined> }[] }> {
  const requests: { url: string; headers: Record<string, string | string[] | undefined> }[] = [];
  const server = createServer((req, res) => {
    requests.push({ url: req.url ?? '', headers: req.headers });
    if (req.url?.endsWith('.vtt')) {
      res.writeHead(200, { 'Content-Type': 'text/vtt' }).end('WEBVTT\n\n00:00.000 --> 00:01.000\nHola\n');
      return;
    }
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
    if (range) {
      const start = Number(range[1]);
      const end = range[2] ? Number(range[2]) : MEDIA.length - 1;
      res.writeHead(206, { 'Content-Type': 'video/mp4', 'Content-Range': `bytes ${start}-${end}/${MEDIA.length}`, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes' });
      res.end(MEDIA.subarray(start, end + 1));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': MEDIA.length, 'Accept-Ranges': 'bytes' }).end(MEDIA);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ server, base: `http://127.0.0.1:${port}/media`, requests });
    });
  });
}

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      s.close(() => resolve(port));
    });
  });
}

let media: Awaited<ReturnType<typeof startMediaServer>>;
let app: ReturnType<typeof createApp>;
let base: string;
let tmp: string;

const json = async (path: string, init: { method?: string; headers?: Record<string, string> } = {}) => {
  const res = await fetch(`${base}${path}`, { ...init, headers: { 'x-yc-local': '1', ...(init.headers ?? {}) } });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};

beforeAll(async () => {
  media = await startMediaServer();
  process.env.FAKE_MEDIA_BASE = media.base;
  tmp = mkdtempSync(join(tmpdir(), 'yc-local-'));
  const dist = join(tmp, 'dist');
  mkdirSync(join(dist, 'assets'), { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>app</title><div id="root"></div>');
  writeFileSync(join(dist, 'assets', 'app.js'), 'console.log(1)');
  const port = await freePort();
  app = createApp({ port, host: '127.0.0.1', dist, cache: join(tmp, 'cache'), ytdlp: join(process.cwd(), 'tests/fixtures/fake-yt-dlp.mjs'), devOrigin: 'http://127.0.0.1:5173', jsRuntime: '' });
  await new Promise<void>((resolve) => app.server.listen(port, '127.0.0.1', () => resolve()));
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise((resolve) => app.server.close(resolve));
  await new Promise((resolve) => media.server.close(resolve));
  rmSync(tmp, { recursive: true, force: true });
});

describe('extract.mjs', () => {
  it('clasifica formatos: progresivos reproducibles, audio y alturas HQ; descarta DRM, SABR, dañados y sin PoToken', () => {
    const r = classifyFormats([
      { format_id: '18', url: 'u', ext: 'mp4', protocol: 'https', vcodec: 'avc1', acodec: 'mp4a', height: 360 },
      { format_id: '22', url: 'u', ext: 'mp4', protocol: 'https', vcodec: 'avc1', acodec: 'mp4a', height: 720, format_note: 'DAMAGED' },
      { format_id: '140', url: 'u', ext: 'm4a', protocol: 'https', vcodec: 'none', acodec: 'mp4a.40.2', abr: 129 },
      { format_id: '137', url: 'u', ext: 'mp4', protocol: 'https', vcodec: 'avc1', acodec: 'none', height: 1080 },
      { format_id: '299', url: 'u', ext: 'mp4', protocol: 'https', vcodec: 'avc1', acodec: 'none', height: 1080, format_note: 'MISSING POT' },
      { format_id: 's', url: 'u', ext: 'mp4', protocol: 'sabr', vcodec: 'avc1', acodec: 'none', height: 1440 },
      { format_id: 'd', url: 'u', ext: 'mp4', protocol: 'https', vcodec: 'avc1', acodec: 'mp4a', height: 480, has_drm: true },
    ]);
    expect(r.progressive.map((f) => f.formatId)).toEqual(['18']);
    expect(r.audio.map((f) => f.formatId)).toEqual(['140']);
    expect((r.hq as { quality: number }[]).map((h) => h.quality)).toEqual([1080]);
  });
  it('mapea entradas planas y líneas de progreso', () => {
    expect(mapEntry({ id: 'dQw4w9WgXcQ', title: 'T', channel: 'C', duration: 61.4, view_count: '5', upload_date: '20240102' }, (id: string) => `/t/${id}`)).toMatchObject({
      id: 'dQw4w9WgXcQ',
      durationSeconds: 61,
      viewCount: 5,
      publishedAt: '2024-01-02T00:00:00.000Z',
      thumbnailUrl: '/t/dQw4w9WgXcQ',
    });
    expect(mapEntry({ id: 'corto' }, () => '')).toBeNull();

    expect(parseProgressLine('yc-progress {"status":"downloading","downloaded_bytes":50,"total_bytes":200}')).toMatchObject({ percent: 25, downloaded: 50, total: 200 });
    expect(parseProgressLine('otra línea')).toBeNull();
  });
});

describe('servicio local', () => {
  it('informa del estado y exige la cabecera propia en las rutas JSON', async () => {
    const { status, body } = await json('/local/status');
    expect(status).toBe(200);
    expect(body.ytdlp).toBe('2026.10.26-fake');
    const sin = await fetch(`${base}/local/status`);
    expect(sin.status).toBe(403);
    // fetch no permite cambiar Host: se usa http.request.
    const hostStatus = await new Promise<number>((resolve) => {
      const req = httpRequest(`${base}/local/status`, { headers: { 'x-yc-local': '1', host: 'evil.example:80' } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.end();
    });
    expect(hostStatus).toBe(421);
  });

  it('sirve la web con cabeceras de seguridad y respaldo a index.html', async () => {
    const home = await fetch(`${base}/`);
    expect(home.status).toBe(200);
    expect(home.headers.get('content-security-policy')).toContain("media-src 'self'");
    expect(home.headers.get('referrer-policy')).toBe('no-referrer');
    const inner = await fetch(`${base}/ver/dQw4w9WgXcQ`);
    expect(inner.status).toBe(200);
    expect(await inner.text()).toContain('id="root"');
    const asset = await fetch(`${base}/assets/app.js`);
    expect(asset.headers.get('cache-control')).toContain('immutable');
    expect((await fetch(`${base}/assets/nada.js`)).status).toBe(404);
    expect((await fetch(`${base}/..%2F..%2Fpackage.json`)).status).toBe(404);
  });

  it('busca con paginación y mapea los resultados', async () => {
    const p1 = await json('/local/search?q=gatos');
    expect(p1.status).toBe(200);
    const items = p1.body.items as { id: string; isLive?: boolean; thumbnailUrl: string }[];
    expect(items).toHaveLength(20);
    expect(items[0]?.thumbnailUrl).toMatch(/^\/local\/thumb\//);
    expect(items[2]?.isLive).toBe(true);
    expect(p1.body.nextPage).toBe('20');
    const p2 = await json(`/local/search?q=gatos&page=${String(p1.body.nextPage)}`);
    expect((p2.body.items as unknown[]).length).toBe(20);
    const p3 = await json('/local/search?q=gatos&page=40');
    expect((p3.body.items as unknown[]).length).toBe(5);
    expect(p3.body.nextPage).toBeUndefined();
    const vacio = await json('/local/search?q=nada');
    expect(vacio.body).toEqual({ items: [] });
    expect((await json('/local/search?q=')).status).toBe(400);
  });

  it('devuelve canal, lista y sus vídeos', async () => {
    const ch = await json('/local/channel/%40prueba');
    expect(ch.body).toMatchObject({ id: 'UCuAXFkgsw1L7xaCfnd5JJOw', title: 'Canal de prueba', subscriberCount: 12345, videoCount: 42 });
    expect(String(ch.body.thumbnailUrl)).toContain('/local/image?u=');
    const vids = await json('/local/channel/UCuAXFkgsw1L7xaCfnd5JJOw/videos');
    expect((vids.body.items as unknown[]).length).toBe(30);
    expect(vids.body.nextPage).toBe('31');
    const vids2 = await json('/local/channel/UCuAXFkgsw1L7xaCfnd5JJOw/videos?page=31');
    expect((vids2.body.items as unknown[]).length).toBe(12);
    expect(vids2.body.nextPage).toBeUndefined();
    const pl = await json('/local/playlist/PLabcdefghijklmnop');
    expect(pl.body).toMatchObject({ id: 'PLabcdefghijklmnop', title: 'Lista de prueba', itemCount: 55 });
    const plItems = await json('/local/playlist/PLabcdefghijklmnop/items');
    expect((plItems.body.items as unknown[]).length).toBe(50);
    expect(plItems.body.nextPage).toBe('51');
    expect((await json('/local/channel/ab')).status).toBe(400);
  });

  it('resuelve un vídeo: opciones de reproducción, subtítulos y errores', async () => {
    const r = await json('/local/resolve/dQw4w9WgXcQ');
    expect(r.status).toBe(200);
    expect(r.body.video).toMatchObject({ id: 'dQw4w9WgXcQ', title: 'Vídeo de prueba', durationSeconds: 125, viewCount: 4321, captionsAvailable: true, embeddable: true });
    expect((r.body.progressive as { formatId: string; url: string }[]).map((f) => f.formatId)).toEqual(['18']);
    expect((r.body.audio as { formatId: string }[]).map((f) => f.formatId)).toEqual(['251', '140']);
    expect((r.body.hq as { quality: number }[]).map((h) => h.quality)).toEqual([720, 1080]);
    expect(r.body.subtitles).toEqual([
      { lang: 'es', name: 'Spanish', auto: false, url: '/local/subs/dQw4w9WgXcQ/es' },
      { lang: 'en', name: 'English (auto)', auto: true, url: '/local/subs/dQw4w9WgXcQ/en?auto=1' },
    ]);
    const v = await json('/local/video/dQw4w9WgXcQ');
    expect(v.body).toMatchObject({ publishedAt: '2024-01-02T12:00:00.000Z', description: 'Descripción\ncon dos líneas' });
    const bad = await json('/local/resolve/badbadbadb1');
    expect(bad.status).toBe(404);
    expect(bad.body.error).toBe('not-found');
    const live = await json('/local/resolve/livelivelv1');
    expect(live.status).toBe(403);
    expect(live.body.error).toBe('live');
    expect((await json('/local/resolve/corto')).status).toBe(400);
  });

  it('reenvía los flujos con Range y las cabeceras de yt-dlp, sin cookies', async () => {
    const res = await fetch(`${base}/local/stream/dQw4w9WgXcQ/18`, { headers: { Range: 'bytes=100-199', Cookie: 'secreta=1' } });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 100-199/1000');
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBe(100);
    expect(buf[0]).toBe(100);
    const upstream = media.requests.at(-1);
    expect(upstream?.headers['user-agent']).toBe('fake-agent');
    expect(upstream?.headers.cookie).toBeUndefined();
    expect(upstream?.headers.range).toBe('bytes=100-199');
    const full = await fetch(`${base}/local/stream/dQw4w9WgXcQ/18`);
    expect(full.status).toBe(200);
    expect((await full.arrayBuffer()).byteLength).toBe(1000);
    expect((await fetch(`${base}/local/stream/dQw4w9WgXcQ/999`)).status).toBe(404);
    const subs = await fetch(`${base}/local/subs/dQw4w9WgXcQ/es`);
    expect(subs.headers.get('content-type')).toContain('text/vtt');
    expect(await subs.text()).toContain('WEBVTT');
    expect((await fetch(`${base}/local/image?u=https://evil.example/x.jpg`)).status).toBe(400);
  });

  it('descarga a la caché con progreso y sirve el archivo con Range', async () => {
    const start = await json('/local/download/dQw4w9WgXcQ?quality=720', { method: 'POST' });
    expect(start.status).toBe(202);
    expect(['queued', 'running', 'done']).toContain(start.body.status);
    let job = start.body;
    for (let i = 0; i < 50 && job.status !== 'done' && job.status !== 'error'; i++) {
      await new Promise((r) => setTimeout(r, 50));
      job = (await json('/local/download/dQw4w9WgXcQ')).body;
    }
    expect(job.status).toBe('done');
    expect(job.percent).toBe(100);
    expect(job.file).toBe('/local/file/dQw4w9WgXcQ');
    const file = await fetch(`${base}/local/file/dQw4w9WgXcQ`, { headers: { Range: 'bytes=0-9' } });
    expect(file.status).toBe(206);
    expect(file.headers.get('content-range')).toBe('bytes 0-9/2048');
    expect((await file.arrayBuffer()).byteLength).toBe(10);
    const list = await json('/local/cache');
    expect((list.body.items as { id: string; quality: number }[])[0]).toMatchObject({ id: 'dQw4w9WgXcQ', quality: 720 });
    const r = await json('/local/resolve/dQw4w9WgXcQ');
    expect(r.body.cached).toMatchObject({ quality: 720, url: '/local/file/dQw4w9WgXcQ' });
    const again = await json('/local/download/dQw4w9WgXcQ?quality=480', { method: 'POST' });
    expect(again.body.status).toBe('done');
    const del = await json('/local/cache/dQw4w9WgXcQ', { method: 'DELETE' });
    expect(del.body).toEqual({ ok: true });
    expect((await fetch(`${base}/local/file/dQw4w9WgXcQ`)).status).toBe(404);
    expect((await json('/local/download/dQw4w9WgXcQ?quality=999', { method: 'POST' })).status).toBe(400);
  });

  it('informa del fallo de una descarga', async () => {
    await json('/local/download/failfailfa1?quality=720', { method: 'POST' });
    let job: Record<string, unknown> = {};
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 50));
      job = (await json('/local/download/failfailfa1')).body;
      if (job.status === 'error' || job.status === 'done') break;
    }
    expect(job.status).toBe('error');
    expect((job.error as { code: string }).code).toBe('no-format');
  });

  it('responde al preflight CORS del origen de desarrollo', async () => {
    const res = await fetch(`${base}/local/status`, { method: 'OPTIONS', headers: { Origin: 'http://127.0.0.1:5173', 'Access-Control-Request-Headers': 'x-yc-local' } });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:5173');
    const other = await fetch(`${base}/local/status`, { method: 'OPTIONS', headers: { Origin: 'http://evil.example' } });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
  });
});
