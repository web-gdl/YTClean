// Adaptador para la API de Invidious (https://docs.invidious.io/api/).
// El usuario elige la instancia; todas las peticiones van a ese origen. Las
// miniaturas se sirven a través de la instancia (/vi/ID/…), no de Google.
// Fiabilidad: /api/v1/videos/:id depende de que YouTube no bloquee la instancia;
// la búsqueda y los canales suelen seguir funcionando cuando aquello falla.
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

export class InvidiousProvider implements DataProvider {
  readonly id = 'invidious' as const;
  readonly label = 'Invidious';
  readonly hosts: readonly string[];

  constructor(private readonly instance: string) {
    if (!instance.startsWith('https://')) throw new ProviderError('not-configured', 'Instancia no configurada');
    this.hosts = [new URL(instance).host];
  }

  private async call(path: string, params: Record<string, string | number | undefined> = {}, opts?: RequestOptions): Promise<unknown> {
    try {
      return await fetchJson(buildUrl(`${this.instance}${path}`, params), { signal: opts?.signal });
    } catch (e) {
      throw mapError(e);
    }
  }

  async searchVideos(query: string, opts?: RequestOptions): Promise<Page<VideoSummary>> {
    const page = Number(opts?.page ?? '1') || 1;
    const data = asArray(await this.call('/api/v1/search', { q: query, type: 'video', page }, opts));
    const items = data.map((raw) => this.mapVideo(asRecord(raw))).filter((v): v is VideoSummary => v !== null);
    return items.length ? { items, nextPage: String(page + 1) } : { items };
  }

  async getVideo(id: string, opts?: RequestOptions): Promise<VideoDetails> {
    const data = asRecord(await this.call(`/api/v1/videos/${encodeURIComponent(id)}`, {}, opts));
    const base = this.mapVideo(data);
    if (!base) throw new ProviderError('bad-response', 'Respuesta de vídeo incompleta');
    const details: VideoDetails = { ...base };
    const description = asString(data.description);
    if (description !== undefined) details.description = description;
    const likes = asNumber(data.likeCount);
    if (likes !== undefined) details.likeCount = likes;
    const listed = asBoolean(data.isListed);
    if (listed !== undefined) details.privacy = listed ? 'public' : 'unlisted';
    // allowedRegions enumera los países permitidos; un vídeo sin restricciones
    // trae la lista completa (~250). Menos de 200 indica restricción geográfica.
    const regions = asArray(data.allowedRegions);
    if (regions.length) details.regionRestricted = regions.length < 200;
    details.captionsAvailable = asArray(data.captions).length > 0;
    return details;
  }

  async getChannel(idOrHandle: string, opts?: RequestOptions): Promise<ChannelInfo> {
    const ucid = await this.resolveChannelId(idOrHandle, opts);
    const data = asRecord(await this.call(`/api/v1/channels/${encodeURIComponent(ucid)}`, {}, opts));
    const id = asString(data.authorId) ?? ucid;
    const info: ChannelInfo = { id, title: asString(data.author) ?? '' };
    const description = asString(data.description);
    if (description) info.description = description;
    const thumb = this.absolute(pickLargest(asArray(data.authorThumbnails)));
    if (thumb) info.thumbnailUrl = thumb;
    const subs = asNumber(data.subCount);
    if (subs !== undefined) info.subscriberCount = subs;
    return info;
  }

  async getChannelVideos(channelId: string, opts?: RequestOptions): Promise<Page<VideoSummary>> {
    const ucid = await this.resolveChannelId(channelId, opts);
    const data = asRecord(await this.call(`/api/v1/channels/${encodeURIComponent(ucid)}/videos`, { continuation: opts?.page }, opts));
    const items = asArray(data.videos).map((raw) => this.mapVideo(asRecord(raw))).filter((v): v is VideoSummary => v !== null);
    const next = asString(data.continuation);
    return next ? { items, nextPage: next } : { items };
  }

  async getPlaylist(id: string, opts?: RequestOptions): Promise<PlaylistInfo> {
    const data = asRecord(await this.call(`/api/v1/playlists/${encodeURIComponent(id)}`, { page: 1 }, opts));
    const pid = asString(data.playlistId) ?? id;
    const info: PlaylistInfo = { id: pid, title: asString(data.title) ?? '' };
    const author = asString(data.author);
    if (author) info.channelTitle = author;
    const authorId = asString(data.authorId);
    if (authorId) info.channelId = authorId;
    const description = asString(data.description);
    if (description) info.description = description;
    const count = asNumber(data.videoCount);
    if (count !== undefined) info.itemCount = count;
    const thumb = this.absolute(asString(data.playlistThumbnail));
    if (thumb) info.thumbnailUrl = thumb;
    return info;
  }

  async getPlaylistItems(id: string, opts?: RequestOptions): Promise<Page<VideoSummary>> {
    const page = Number(opts?.page ?? '1') || 1;
    const data = asRecord(await this.call(`/api/v1/playlists/${encodeURIComponent(id)}`, { page }, opts));
    const items = asArray(data.videos).map((raw) => this.mapVideo(asRecord(raw))).filter((v): v is VideoSummary => v !== null);
    // Invidious pagina de 100 en 100; si llegó una página completa puede haber más.
    return items.length >= 100 ? { items, nextPage: String(page + 1) } : { items };
  }

  private async resolveChannelId(idOrHandle: string, opts?: RequestOptions): Promise<string> {
    if (/^UC[\w-]{22}$/.test(idOrHandle)) return idOrHandle;
    const handle = idOrHandle.startsWith('@') ? idOrHandle : `@${idOrHandle}`;
    const data = asRecord(await this.call('/api/v1/resolveurl', { url: `https://www.youtube.com/${handle}` }, opts));
    const ucid = asString(data.ucid);
    if (!ucid) throw new ProviderError('not-found', 'Canal no encontrado', 404);
    return ucid;
  }

  private mapVideo(raw: Record<string, unknown>): VideoSummary | null {
    const id = asString(raw.videoId);
    if (!id) return null;
    const v: VideoSummary = { id, title: asString(raw.title) ?? '', channelTitle: asString(raw.author) ?? '' };
    const channelId = asString(raw.authorId);
    if (channelId) v.channelId = channelId;
    const thumb = this.absolute(pickThumb(asArray(raw.videoThumbnails))) ?? `${this.instance}/vi/${encodeURIComponent(id)}/mqdefault.jpg`;
    v.thumbnailUrl = thumb;
    const length = asNumber(raw.lengthSeconds);
    if (length !== undefined && length > 0) v.durationSeconds = length;
    const published = asNumber(raw.published);
    if (published) v.publishedAt = new Date(published * 1000).toISOString();
    const publishedText = asString(raw.publishedText);
    if (publishedText) v.publishedText = publishedText;
    const views = asNumber(raw.viewCount);
    if (views !== undefined) v.viewCount = views;
    if (raw.liveNow === true) v.isLive = true;
    return v;
  }

  private absolute(url: string | undefined): string | undefined {
    if (!url) return undefined;
    if (url.startsWith('//')) return `https:${url}`;
    if (url.startsWith('/')) return `${this.instance}${url}`;
    return url;
  }
}

function pickThumb(thumbs: unknown[]): string | undefined {
  const list = thumbs.map(asRecord);
  for (const quality of ['medium', 'high', 'sddefault', 'default', 'maxres']) {
    const t = list.find((x) => asString(x.quality) === quality);
    const url = t ? asString(t.url) : undefined;
    if (url) return url;
  }
  return asString(list[0]?.url);
}

function pickLargest(thumbs: unknown[]): string | undefined {
  let best: { url: string; width: number } | undefined;
  for (const raw of thumbs) {
    const t = asRecord(raw);
    const url = asString(t.url);
    const width = asNumber(t.width) ?? 0;
    if (url && (!best || (width > best.width && width <= 176))) best = { url, width };
  }
  return best?.url;
}

function mapError(e: unknown): ProviderError {
  if (e instanceof HttpError) {
    const body = asRecord(e.body);
    const message = asString(body.error) ?? `HTTP ${e.status}`;
    if (e.status === 404) return new ProviderError('not-found', message, e.status);
    if (e.status === 429) return new ProviderError('quota', message, e.status);
    return new ProviderError('unavailable', message, e.status);
  }
  return toProviderError(e);
}
