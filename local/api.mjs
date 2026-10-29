// Rutas /local/*: búsqueda, canales, listas, vídeos, resolución de flujos,
// proxy de medios, subtítulos, miniaturas, descargas y caché.
import { CHANNEL_ID_RE, HANDLE_RE, LANG_RE, PLAYLIST_ID_RE, VIDEO_ID_RE, FORMAT_ID_RE, classifyFormats, listSubtitles, mapChannel, mapEntries, mapPlaylist, mapVideo } from './extract.mjs';
import { proxyMedia } from './proxy.mjs';
import { YtDlpError } from './ytdlp.mjs';

const RESOLVE_TTL_MS = 2 * 60 * 60 * 1000; // las URL de Google caducan en ~6 h
const SEARCH_PAGE = 20;
const THUMB_HOST = 'https://i.ytimg.com';

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function statusFor(code) {
  switch (code) {
    case 'not-found':
    case 'private':
      return 404;
    case 'bad-request':
      return 400;
    case 'age-restricted':
    case 'blocked':
    case 'live':
      return 403;
    case 'missing':
    case 'runtime':
      return 501;
    case 'timeout':
      return 504;
    case 'network':
      return 502;
    default:
      return 500;
  }
}

export class Api {
  /**
   * @param {{ ytdlp: import('./ytdlp.mjs').YtDlp, cache: import('./cache.mjs').Cache, version: string, ffmpeg: boolean, jsRuntime?: string }} deps
   */
  constructor(deps) {
    this.ytdlp = deps.ytdlp;
    this.cache = deps.cache;
    this.version = deps.version;
    this.ffmpeg = deps.ffmpeg;
    this.jsRuntime = deps.jsRuntime;
    /** @type {Map<string, {at: number, info: object}>} */
    this.resolved = new Map();
    this.thumbUrl = (id) => `/local/thumb/${id}`;
  }

  // ---------- consultas a yt-dlp ----------

  async flat(url, { start, end } = {}) {
    const args = ['--flat-playlist', '--ignore-errors'];
    // -I START:STOP limita las entradas (y las peticiones de continuación) de la pestaña o lista.
    if (start || end) args.push('--playlist-items', `${start ?? 1}:${end ?? ''}`);
    args.push(url);
    return this.ytdlp.json(args);
  }

  async info(id) {
    const hit = this.resolved.get(id);
    if (hit && Date.now() - hit.at < RESOLVE_TTL_MS) return hit.info;
    const info = await this.ytdlp.json(['--no-playlist', `https://www.youtube.com/watch?v=${id}`], { timeoutMs: 120_000 });
    if (this.resolved.size > 200) this.resolved.delete(this.resolved.keys().next().value);
    this.resolved.set(id, { at: Date.now(), info });
    return info;
  }

  // ---------- manejadores ----------

  async status() {
    const ytdlpVersion = await this.ytdlp.version();
    const cache = this.cache.list();
    return { ok: true, service: this.version, ytdlp: ytdlpVersion, ffmpeg: this.ffmpeg, jsRuntime: this.jsRuntime ?? 'deno (por defecto)', cache: { dir: this.cache.dir, files: cache.items.length, bytes: cache.bytes } };
  }

  async search(q, offset) {
    const query = (q ?? '').trim();
    if (!query) throw new HttpError(400, 'bad-request', 'Falta q');
    const start = Math.max(0, Number(offset) || 0);
    const total = start + SEARCH_PAGE;
    const data = await this.flat(`ytsearch${total}:${query.replace(/:/g, ' ')}`);
    const all = mapEntries(data?.entries, this.thumbUrl);
    const items = all.slice(start);
    // Si llegaron tantos como se pidieron, puede haber más.
    return all.length >= total ? { items, nextPage: String(total) } : { items };
  }

  async video(id) {
    assertVideoId(id);
    const v = mapVideo(await this.info(id), this.thumbUrl);
    if (!v) throw new HttpError(502, 'bad-response', 'Respuesta de yt-dlp incompleta');
    return v;
  }

  channelUrl(idOrHandle) {
    if (CHANNEL_ID_RE.test(idOrHandle)) return `https://www.youtube.com/channel/${idOrHandle}/videos`;
    if (HANDLE_RE.test(idOrHandle)) return `https://www.youtube.com/@${idOrHandle.replace(/^@/, '')}/videos`;
    throw new HttpError(400, 'bad-request', 'Canal no válido');
  }

  async channel(idOrHandle) {
    const data = await this.flat(this.channelUrl(idOrHandle), { start: 1, end: 1 });
    const c = mapChannel(data, (url) => `/local/image?u=${encodeURIComponent(url)}`);
    if (!c) throw new HttpError(404, 'not-found', 'Canal no encontrado');
    return c;
  }

  async channelVideos(idOrHandle, start) {
    const from = Math.max(1, Number(start) || 1);
    const count = 30;
    const data = await this.flat(this.channelUrl(idOrHandle), { start: from, end: from + count - 1 });
    const items = mapEntries(data?.entries, this.thumbUrl);
    return items.length === count ? { items, nextPage: String(from + count) } : { items };
  }

  async playlist(id) {
    if (!PLAYLIST_ID_RE.test(id)) throw new HttpError(400, 'bad-request', 'Lista no válida');
    const data = await this.flat(`https://www.youtube.com/playlist?list=${id}`, { start: 1, end: 1 });
    const p = mapPlaylist(data);
    if (!p) throw new HttpError(404, 'not-found', 'Lista no encontrada');
    return p;
  }

  async playlistItems(id, start) {
    if (!PLAYLIST_ID_RE.test(id)) throw new HttpError(400, 'bad-request', 'Lista no válida');
    const from = Math.max(1, Number(start) || 1);
    const count = 50;
    const data = await this.flat(`https://www.youtube.com/playlist?list=${id}`, { start: from, end: from + count - 1 });
    const items = mapEntries(data?.entries, this.thumbUrl);
    return items.length === count ? { items, nextPage: String(from + count) } : { items };
  }

  async resolve(id) {
    assertVideoId(id);
    const info = await this.info(id);
    const video = mapVideo(info, this.thumbUrl);
    if (!video) throw new HttpError(502, 'bad-response', 'Respuesta de yt-dlp incompleta');
    if (info.is_live || info.live_status === 'is_live') throw new HttpError(403, 'live', 'Los directos no se admiten en el modo local; usa el reproductor oficial.');
    const { progressive, audio, hq } = classifyFormats(info.formats);
    const subtitles = listSubtitles(info).map((s) => ({ lang: s.lang, name: s.name, auto: s.auto, url: `/local/subs/${id}/${encodeURIComponent(s.lang)}${s.auto ? '?auto=1' : ''}` }));
    const toClient = (f) => ({ formatId: f.formatId, label: f.label, ext: f.ext, height: f.height, fps: f.fps, abr: f.abr, bytes: f.bytes, language: f.language, url: `/local/stream/${id}/${f.formatId}` });
    const cached = this.cache.find(id);
    const job = this.cache.job(id);
    return {
      video,
      progressive: progressive.map(toClient),
      audio: audio.map(toClient),
      hq: hq.map((h) => ({ ...h, available: this.ffmpeg })),
      cached: cached ? { quality: cached.quality, bytes: cached.bytes, url: cached.url } : null,
      job: job && job.status !== 'done' ? publicJob(job) : null,
      subtitles,
    };
  }

  async stream(req, res, id, formatId) {
    assertVideoId(id);
    if (!FORMAT_ID_RE.test(formatId)) throw new HttpError(400, 'bad-request', 'Formato no válido');
    const info = await this.info(id);
    const fmt = (info.formats ?? []).find((f) => f && f.format_id === formatId && typeof f.url === 'string');
    if (!fmt) throw new HttpError(404, 'not-found', 'Formato no disponible');
    const headers = fmt.http_headers && typeof fmt.http_headers === 'object' ? { ...fmt.http_headers } : {};
    delete headers.Cookie;
    delete headers.cookie;
    await proxyMedia(req, res, fmt.url, headers);
  }

  async subs(req, res, id, lang, auto) {
    assertVideoId(id);
    if (!LANG_RE.test(lang)) throw new HttpError(400, 'bad-request', 'Idioma no válido');
    const info = await this.info(id);
    const track = listSubtitles(info).find((s) => s.lang === lang && s.auto === auto);
    if (!track) throw new HttpError(404, 'not-found', 'Subtítulos no disponibles');
    await proxyMedia(req, res, track.url, {}, { contentType: 'text/vtt; charset=utf-8', cacheControl: 'private, max-age=3600' });
  }

  async thumb(req, res, id) {
    assertVideoId(id);
    await proxyMedia(req, res, `${THUMB_HOST}/vi/${id}/mqdefault.jpg`, {}, { cacheControl: 'private, max-age=86400' });
  }

  async image(req, res, url) {
    let u;
    try {
      u = new URL(url);
    } catch {
      throw new HttpError(400, 'bad-request', 'URL no válida');
    }
    // Solo imágenes de YouTube: avatares y miniaturas.
    if (u.protocol !== 'https:' || !/(^|\.)(ytimg\.com|ggpht\.com|googleusercontent\.com)$/.test(u.hostname)) throw new HttpError(400, 'bad-request', 'Origen de imagen no permitido');
    await proxyMedia(req, res, u.toString(), {}, { cacheControl: 'private, max-age=86400' });
  }

  async download(id, quality) {
    assertVideoId(id);
    const q = Number(quality);
    if (!this.ffmpeg && q > 720) throw new HttpError(400, 'no-ffmpeg', 'Sin ffmpeg solo se puede descargar un archivo ya mezclado (≤ 720p).');
    let meta = {};
    try {
      const v = mapVideo(await this.info(id), this.thumbUrl);
      meta = { title: v?.title, channelTitle: v?.channelTitle, durationSeconds: v?.durationSeconds };
    } catch {
      /* la descarga puede continuar sin metadatos */
    }
    return publicJob(this.cache.start(id, q, meta));
  }

  downloadStatus(id) {
    assertVideoId(id);
    const job = this.cache.job(id);
    if (job) return publicJob(job);
    const cached = this.cache.find(id);
    if (cached) return { id, status: 'done', quality: cached.quality, percent: 100, bytes: cached.bytes, total: cached.bytes, file: cached.url };
    return { id, status: 'idle' };
  }
}

function publicJob(job) {
  const { id, status, quality, percent, bytes, total, speed, eta, file, error, stage } = job;
  return { id, status, quality, percent: percent === undefined ? undefined : Math.round(percent * 10) / 10, bytes, total, speed, eta, file, error, stage };
}

function assertVideoId(id) {
  if (!VIDEO_ID_RE.test(id ?? '')) throw new HttpError(400, 'bad-request', 'ID de vídeo no válido');
}

/** Convierte cualquier error en {status, body}. */
export function errorResponse(e) {
  if (e instanceof HttpError) return { status: e.status, body: { error: e.code, message: e.message } };
  if (e instanceof YtDlpError) return { status: statusFor(e.code), body: { error: e.code, message: e.message, detail: e.stderr?.split('\n').filter(Boolean).slice(-3).join(' | ') } };
  return { status: 500, body: { error: 'internal', message: e instanceof Error ? e.message : String(e) } };
}
