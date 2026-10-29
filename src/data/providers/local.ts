// Cliente del servicio local (local/server.mjs): proveedor de datos y API de
// reproducción. El servicio corre en la máquina del usuario y usa yt-dlp; esta
// capa solo habla con él. Las rutas JSON llevan la cabecera X-YC-Local para
// que ninguna web ajena pueda invocarlas desde el navegador.
import { buildUrl, fetchJson, HttpError } from '../http';
import {
  ProviderError,
  toProviderError,
  type ChannelInfo,
  type DataProvider,
  type Page,
  type PlaylistInfo,
  type RequestOptions,
  type VideoDetails,
  type VideoSummary,
} from '../types';
import { asArray, asBoolean, asNumber, asRecord, asString } from '../util';

const HEADERS = { 'X-YC-Local': '1' };

/** Origen del servicio: el configurado o el mismo que sirve la web. */
export function localBase(configured: string): string {
  const base = configured.trim().replace(/\/+$/, '');
  if (base) return base;
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export interface LocalStreamOption {
  formatId: string;
  label: string;
  ext: string;
  height?: number;
  fps?: number;
  abr?: number;
  bytes?: number;
  language?: string;
  url: string;
}
export interface LocalResolved {
  video: VideoDetails;
  progressive: LocalStreamOption[];
  audio: LocalStreamOption[];
  hq: { quality: number; label: string; available: boolean }[];
  cached: { quality: number; bytes: number; url: string } | null;
  job: LocalJob | null;
  subtitles: { lang: string; name: string; auto: boolean; url: string }[];
}
export interface LocalJob {
  id: string;
  status: 'idle' | 'queued' | 'running' | 'done' | 'error';
  quality?: number;
  percent?: number;
  bytes?: number;
  total?: number;
  speed?: number;
  eta?: number;
  file?: string;
  error?: { code: string; message: string };
}
export interface LocalStatus {
  ok: boolean;
  service: string;
  ytdlp: string | null;
  ffmpeg: boolean;
  jsRuntime: string;
  cache: { dir: string; files: number; bytes: number };
}

export class LocalClient {
  readonly base: string;
  constructor(configured: string) {
    this.base = localBase(configured);
  }

  /** Convierte una ruta relativa del servicio ("/local/…") en URL absoluta. */
  absolute(path: string): string {
    return path.startsWith('/') ? `${this.base}${path}` : path;
  }

  async call(path: string, params: Record<string, string | number | undefined> = {}, opts: RequestOptions & { method?: 'GET' | 'POST' | 'DELETE'; timeoutMs?: number } = {}): Promise<unknown> {
    try {
      return await fetchJson(buildUrl(`${this.base}${path}`, params), { signal: opts.signal, headers: HEADERS, method: opts.method ?? 'GET', timeoutMs: opts.timeoutMs ?? 130_000 });
    } catch (e) {
      throw mapError(e);
    }
  }

  status(opts?: RequestOptions): Promise<LocalStatus> {
    return this.call('/local/status', {}, { ...opts, timeoutMs: 15_000 }) as Promise<LocalStatus>;
  }

  async resolve(id: string, opts?: RequestOptions): Promise<LocalResolved> {
    const data = asRecord(await this.call(`/local/resolve/${encodeURIComponent(id)}`, {}, opts));
    const video = mapVideo(asRecord(data.video), this);
    if (!video) throw new ProviderError('bad-response', 'Respuesta del servicio incompleta');
    const opt = (raw: unknown): LocalStreamOption | null => {
      const r = asRecord(raw);
      const formatId = asString(r.formatId);
      const url = asString(r.url);
      if (!formatId || !url) return null;
      const o: LocalStreamOption = { formatId, label: asString(r.label) ?? formatId, ext: asString(r.ext) ?? '', url: this.absolute(url) };
      const height = asNumber(r.height);
      if (height !== undefined) o.height = height;
      const fps = asNumber(r.fps);
      if (fps !== undefined) o.fps = fps;
      const abr = asNumber(r.abr);
      if (abr !== undefined) o.abr = abr;
      const bytes = asNumber(r.bytes);
      if (bytes !== undefined) o.bytes = bytes;
      const language = asString(r.language);
      if (language) o.language = language;
      return o;
    };
    const cachedRaw = asRecord(data.cached);
    const cachedUrl = asString(cachedRaw.url);
    const jobRaw = data.job ? mapJob(asRecord(data.job), this) : null;
    return {
      video,
      progressive: asArray(data.progressive).map(opt).filter((x): x is LocalStreamOption => x !== null),
      audio: asArray(data.audio).map(opt).filter((x): x is LocalStreamOption => x !== null),
      hq: asArray(data.hq).map((h) => {
        const r = asRecord(h);
        return { quality: asNumber(r.quality) ?? 0, label: asString(r.label) ?? '', available: asBoolean(r.available) ?? true };
      }),
      cached: cachedUrl ? { quality: asNumber(cachedRaw.quality) ?? 0, bytes: asNumber(cachedRaw.bytes) ?? 0, url: this.absolute(cachedUrl) } : null,
      job: jobRaw,
      subtitles: asArray(data.subtitles).map((s) => {
        const r = asRecord(s);
        return { lang: asString(r.lang) ?? '', name: asString(r.name) ?? '', auto: asBoolean(r.auto) ?? false, url: this.absolute(asString(r.url) ?? '') };
      }),
    };
  }

  async startDownload(id: string, quality: number, opts?: RequestOptions): Promise<LocalJob> {
    return mapJob(asRecord(await this.call(`/local/download/${encodeURIComponent(id)}`, { quality }, { ...opts, method: 'POST' })), this);
  }

  async downloadStatus(id: string, opts?: RequestOptions): Promise<LocalJob> {
    return mapJob(asRecord(await this.call(`/local/download/${encodeURIComponent(id)}`, {}, { ...opts, timeoutMs: 15_000 })), this);
  }

  async cacheList(opts?: RequestOptions): Promise<{ items: { id: string; title?: string; channelTitle?: string; quality: number; bytes: number; durationSeconds?: number }[]; bytes: number }> {
    const data = asRecord(await this.call('/local/cache', {}, { ...opts, timeoutMs: 15_000 }));
    return {
      bytes: asNumber(data.bytes) ?? 0,
      items: asArray(data.items).map((raw) => {
        const r = asRecord(raw);
        const item: { id: string; title?: string; channelTitle?: string; quality: number; bytes: number; durationSeconds?: number } = {
          id: asString(r.id) ?? '',
          quality: asNumber(r.quality) ?? 0,
          bytes: asNumber(r.bytes) ?? 0,
        };
        const title = asString(r.title);
        if (title) item.title = title;
        const channelTitle = asString(r.channelTitle);
        if (channelTitle) item.channelTitle = channelTitle;
        const duration = asNumber(r.durationSeconds);
        if (duration !== undefined) item.durationSeconds = duration;
        return item;
      }),
    };
  }

  async cacheRemove(id?: string, opts?: RequestOptions): Promise<void> {
    await this.call(id ? `/local/cache/${encodeURIComponent(id)}` : '/local/cache', {}, { ...opts, method: 'DELETE', timeoutMs: 15_000 });
  }
}

function mapJob(r: Record<string, unknown>, client: LocalClient): LocalJob {
  const status = asString(r.status);
  const job: LocalJob = { id: asString(r.id) ?? '', status: status === 'queued' || status === 'running' || status === 'done' || status === 'error' ? status : 'idle' };
  const quality = asNumber(r.quality);
  if (quality !== undefined) job.quality = quality;
  const percent = asNumber(r.percent);
  if (percent !== undefined) job.percent = percent;
  const bytes = asNumber(r.bytes);
  if (bytes !== undefined) job.bytes = bytes;
  const total = asNumber(r.total);
  if (total !== undefined) job.total = total;
  const speed = asNumber(r.speed);
  if (speed !== undefined) job.speed = speed;
  const eta = asNumber(r.eta);
  if (eta !== undefined) job.eta = eta;
  const file = asString(r.file);
  if (file) job.file = client.absolute(file);
  const error = asRecord(r.error);
  if (asString(error.message)) job.error = { code: asString(error.code) ?? 'error', message: asString(error.message) ?? '' };
  return job;
}

function mapSummary(r: Record<string, unknown>, client: LocalClient): VideoSummary | null {
  const id = asString(r.id);
  if (!id) return null;
  const v: VideoSummary = { id, title: asString(r.title) ?? '', channelTitle: asString(r.channelTitle) ?? '' };
  const channelId = asString(r.channelId);
  if (channelId) v.channelId = channelId;
  const thumb = asString(r.thumbnailUrl);
  if (thumb) v.thumbnailUrl = client.absolute(thumb);
  const duration = asNumber(r.durationSeconds);
  if (duration !== undefined) v.durationSeconds = duration;
  const published = asString(r.publishedAt);
  if (published) v.publishedAt = published;
  const views = asNumber(r.viewCount);
  if (views !== undefined) v.viewCount = views;
  if (r.isLive === true) v.isLive = true;
  return v;
}

function mapVideo(r: Record<string, unknown>, client: LocalClient): VideoDetails | null {
  const base = mapSummary(r, client);
  if (!base) return null;
  const v: VideoDetails = { ...base };
  const description = asString(r.description);
  if (description !== undefined) v.description = description;
  const embeddable = asBoolean(r.embeddable);
  if (embeddable !== undefined) v.embeddable = embeddable;
  const privacy = asString(r.privacy);
  if (privacy === 'public' || privacy === 'unlisted' || privacy === 'private') v.privacy = privacy;
  const age = asBoolean(r.ageRestricted);
  if (age !== undefined) v.ageRestricted = age;
  const captions = asBoolean(r.captionsAvailable);
  if (captions !== undefined) v.captionsAvailable = captions;
  const likes = asNumber(r.likeCount);
  if (likes !== undefined) v.likeCount = likes;
  return v;
}

function mapPage(data: unknown, client: LocalClient): Page<VideoSummary> {
  const r = asRecord(data);
  const items = asArray(r.items)
    .map((x) => mapSummary(asRecord(x), client))
    .filter((v): v is VideoSummary => v !== null);
  const next = asString(r.nextPage);
  return next ? { items, nextPage: next } : { items };
}

function mapError(e: unknown): ProviderError {
  if (e instanceof HttpError) {
    const body = asRecord(e.body);
    const code = asString(body.error) ?? '';
    const message = asString(body.message) ?? `HTTP ${e.status}`;
    if (code === 'not-found' || code === 'private') return new ProviderError('not-found', message, e.status);
    if (code === 'missing' || code === 'runtime') return new ProviderError('not-configured', message, e.status);
    if (code === 'network') return new ProviderError('network', message, e.status);
    if (code === 'live' || code === 'age-restricted' || code === 'blocked' || code === 'no-format' || code === 'no-ffmpeg') return new ProviderError('unavailable', message, e.status);
    if (e.status === 404) return new ProviderError('not-configured', 'El servicio local no está activo en esta dirección (404).', e.status);
    return new ProviderError('unavailable', message, e.status);
  }
  return toProviderError(e);
}

export class LocalProvider implements DataProvider {
  readonly id = 'local' as const;
  readonly label = 'Servicio local (yt-dlp)';
  readonly hosts: readonly string[];
  readonly client: LocalClient;

  constructor(configured: string) {
    this.client = new LocalClient(configured);
    let host = this.client.base;
    try {
      host = new URL(this.client.base).host;
    } catch {
      /* mismo origen */
    }
    this.hosts = [host];
  }

  async searchVideos(query: string, opts?: RequestOptions): Promise<Page<VideoSummary>> {
    return mapPage(await this.client.call('/local/search', { q: query, page: opts?.page }, opts ?? {}), this.client);
  }

  async getVideo(id: string, opts?: RequestOptions): Promise<VideoDetails> {
    const v = mapVideo(asRecord(await this.client.call(`/local/video/${encodeURIComponent(id)}`, {}, opts ?? {})), this.client);
    if (!v) throw new ProviderError('bad-response', 'Respuesta del servicio incompleta');
    return v;
  }

  async getChannel(idOrHandle: string, opts?: RequestOptions): Promise<ChannelInfo> {
    const r = asRecord(await this.client.call(`/local/channel/${encodeURIComponent(idOrHandle)}`, {}, opts ?? {}));
    const id = asString(r.id);
    if (!id) throw new ProviderError('not-found', 'Canal no encontrado', 404);
    const info: ChannelInfo = { id, title: asString(r.title) ?? '' };
    const description = asString(r.description);
    if (description) info.description = description;
    const thumb = asString(r.thumbnailUrl);
    if (thumb) info.thumbnailUrl = this.client.absolute(thumb);
    const subs = asNumber(r.subscriberCount);
    if (subs !== undefined) info.subscriberCount = subs;
    const count = asNumber(r.videoCount);
    if (count !== undefined) info.videoCount = count;
    return info;
  }

  async getChannelVideos(channelId: string, opts?: RequestOptions): Promise<Page<VideoSummary>> {
    return mapPage(await this.client.call(`/local/channel/${encodeURIComponent(channelId)}/videos`, { page: opts?.page }, opts ?? {}), this.client);
  }

  async getPlaylist(id: string, opts?: RequestOptions): Promise<PlaylistInfo> {
    const r = asRecord(await this.client.call(`/local/playlist/${encodeURIComponent(id)}`, {}, opts ?? {}));
    const pid = asString(r.id);
    if (!pid) throw new ProviderError('not-found', 'Lista no encontrada', 404);
    const info: PlaylistInfo = { id: pid, title: asString(r.title) ?? '' };
    const channelTitle = asString(r.channelTitle);
    if (channelTitle) info.channelTitle = channelTitle;
    const channelId = asString(r.channelId);
    if (channelId) info.channelId = channelId;
    const description = asString(r.description);
    if (description) info.description = description;
    const count = asNumber(r.itemCount);
    if (count !== undefined) info.itemCount = count;
    return info;
  }

  async getPlaylistItems(id: string, opts?: RequestOptions): Promise<Page<VideoSummary>> {
    return mapPage(await this.client.call(`/local/playlist/${encodeURIComponent(id)}/items`, { page: opts?.page }, opts ?? {}), this.client);
  }
}
