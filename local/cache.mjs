// Descargas en alta calidad a una caché local (vídeo + audio remuxados a un
// único MP4 con ffmpeg a través de yt-dlp) y servicio de esos archivos con
// soporte de Range para que el navegador pueda buscar en el vídeo.
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { YtDlp, YtDlpError } from './ytdlp.mjs';
import { VIDEO_ID_RE } from './extract.mjs';

const QUALITIES = new Set([480, 720, 1080, 1440, 2160]);

export class Cache {
  /**
   * @param {{ dir: string, ytdlp: YtDlp, ffmpeg: boolean }} opts
   */
  constructor({ dir, ytdlp, ffmpeg }) {
    this.dir = resolve(dir);
    mkdirSync(this.dir, { recursive: true });
    this.downloader = new YtDlp({ bin: ytdlp.bin, jsRuntime: ytdlp.jsRuntime, extraArgs: ytdlp.extraArgs, concurrency: 1 });
    this.ffmpeg = ffmpeg;
    /** @type {Map<string, object>} */
    this.jobs = new Map();
  }

  filePath(id, quality) {
    return join(this.dir, `${id}.${quality}.mp4`);
  }

  /** Archivo cacheado de mayor calidad para un vídeo, o null. */
  find(id) {
    if (!VIDEO_ID_RE.test(id)) return null;
    const files = readdirSync(this.dir).filter((f) => f.startsWith(`${id}.`) && f.endsWith('.mp4') && !f.includes('.part') && !f.includes('.f'));
    const parsed = files
      .map((f) => ({ f, quality: Number(f.slice(id.length + 1, -4)) }))
      .filter((x) => Number.isFinite(x.quality))
      .sort((a, b) => b.quality - a.quality);
    const best = parsed[0];
    if (!best) return null;
    const path = join(this.dir, best.f);
    const st = statSync(path);
    return { id, quality: best.quality, bytes: st.size, mtime: st.mtimeMs, path, url: `/local/file/${id}` };
  }

  list() {
    const items = [];
    const seen = new Set();
    for (const f of readdirSync(this.dir)) {
      const id = f.slice(0, 11);
      if (!VIDEO_ID_RE.test(id) || seen.has(id)) continue;
      const found = this.find(id);
      if (!found) continue;
      seen.add(id);
      let meta = {};
      try {
        meta = JSON.parse(readFileSync(join(this.dir, `${id}.json`), 'utf8'));
      } catch {
        /* sin metadatos */
      }
      items.push({ id, quality: found.quality, bytes: found.bytes, mtime: found.mtime, title: meta.title, channelTitle: meta.channelTitle, durationSeconds: meta.durationSeconds });
    }
    items.sort((a, b) => b.mtime - a.mtime);
    return { items, bytes: items.reduce((n, x) => n + x.bytes, 0) };
  }

  remove(id) {
    if (!VIDEO_ID_RE.test(id)) return false;
    let removed = false;
    for (const f of readdirSync(this.dir)) {
      if (f.startsWith(`${id}.`)) {
        rmSync(join(this.dir, f), { force: true });
        removed = true;
      }
    }
    this.jobs.delete(id);
    return removed;
  }

  clear() {
    for (const f of readdirSync(this.dir)) rmSync(join(this.dir, f), { force: true });
    this.jobs.clear();
  }

  job(id) {
    return this.jobs.get(id) ?? null;
  }

  /** Selector de formato para yt-dlp: H.264 + AAC en MP4 (lo que todo navegador reproduce). */
  formatSelector(quality) {
    const q = `[height<=${quality}]`;
    if (!this.ffmpeg) return `b${q}[ext=mp4]/b${q}`;
    return `bv*${q}[vcodec^=avc1]+ba[acodec^=mp4a]/bv*${q}[ext=mp4]+ba[ext=m4a]/b${q}[ext=mp4]/bv*${q}+ba/b${q}`;
  }

  /**
   * Inicia (o devuelve) la descarga de un vídeo a la calidad pedida.
   * @param {string} id
   * @param {number} quality
   * @param {{ title?: string, channelTitle?: string, durationSeconds?: number }} meta
   */
  start(id, quality, meta = {}) {
    if (!VIDEO_ID_RE.test(id)) throw new YtDlpError('ID no válido', { code: 'bad-request' });
    if (!QUALITIES.has(quality)) throw new YtDlpError('Calidad no válida', { code: 'bad-request' });
    const existing = this.jobs.get(id);
    if (existing && (existing.status === 'queued' || existing.status === 'running')) return existing;
    const cached = this.find(id);
    if (cached && cached.quality >= quality) {
      const done = { id, status: 'done', quality: cached.quality, percent: 100, bytes: cached.bytes, total: cached.bytes, file: cached.url };
      this.jobs.set(id, done);
      return done;
    }
    const job = { id, status: 'queued', quality, percent: 0, bytes: 0, total: undefined, speed: undefined, eta: undefined, startedAt: Date.now() };
    this.jobs.set(id, job);
    try {
      writeFileSync(join(this.dir, `${id}.json`), JSON.stringify({ title: meta.title, channelTitle: meta.channelTitle, durationSeconds: meta.durationSeconds, quality, at: new Date().toISOString() }));
    } catch {
      /* los metadatos son opcionales */
    }
    const output = this.filePath(id, quality);
    const args = [
      '--no-playlist',
      '-f',
      this.formatSelector(quality),
      ...(this.ffmpeg ? ['--merge-output-format', 'mp4'] : []),
      '-o',
      output,
      '--no-part',
      '--no-mtime',
      `https://www.youtube.com/watch?v=${id}`,
    ];
    job.status = 'queued';
    this.downloader
      .download(args, (p) => {
        if (job.status !== 'running') job.status = 'running';
        job.bytes = p.downloaded;
        if (p.total) job.total = p.total;
        if (p.percent !== undefined) job.percent = p.percent;
        job.speed = p.speed;
        job.eta = p.eta;
        job.stage = p.status;
      })
      .then(() => {
        const found = this.find(id);
        if (!found) {
          job.status = 'error';
          job.error = { code: 'no-file', message: 'La descarga terminó sin producir el archivo.' };
          return;
        }
        job.status = 'done';
        job.percent = 100;
        job.bytes = found.bytes;
        job.total = found.bytes;
        job.quality = found.quality;
        job.file = found.url;
      })
      .catch((e) => {
        job.status = 'error';
        job.error = { code: e.code ?? 'ytdlp', message: e.message };
        // Elimina restos parciales.
        for (const f of readdirSync(this.dir)) {
          if (f.startsWith(`${id}.`) && (f.endsWith('.part') || /\.f\d+\./.test(f))) rmSync(join(this.dir, f), { force: true });
        }
        if (existsSync(output) && statSync(output).size === 0) rmSync(output, { force: true });
      });
    return job;
  }

  /** Sirve un archivo de la caché con Range. */
  serve(req, res, id) {
    const found = this.find(id);
    if (!found) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No está en la caché');
      return;
    }
    const size = found.bytes;
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    const headers = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=0', 'X-Content-Type-Options': 'nosniff' };
    if (range) {
      const start = range[1] === '' ? Math.max(0, size - Number(range[2])) : Number(range[1]);
      const end = range[2] === '' || range[1] === '' ? size - 1 : Math.min(size - 1, Number(range[2]));
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
        return;
      }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
      if (req.method === 'HEAD') return res.end();
      createReadStream(found.path, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Length': size });
    if (req.method === 'HEAD') return res.end();
    createReadStream(found.path).pipe(res);
  }
}
