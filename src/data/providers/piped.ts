// Adaptador para la API de Piped (https://docs.piped.video/docs/api-documentation/).
// Las rutas y los campos se han contrastado con el código fuente de Piped-Backend
// (ServerLauncher.java y utils/obj/*.java). El usuario indica la URL de la API
// de la instancia (p. ej. https://pipedapi.ejemplo.org). Las miniaturas llegan
// ya reescritas al proxy de la instancia.
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
import { asArray, asNumber, asRecord, asString } from '../util';

export class PipedProvider implements DataProvider {
  readonly id = 'piped' as const;
  readonly label = 'Piped';
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
    const data = asRecord(
      opts?.page
        ? await this.call('/nextpage/search', { q: query, filter: 'videos', nextpage: opts.page }, opts)
        : await this.call('/search', { q: query, filter: 'videos' }, opts),
    );
    return this.mapPage(data.items, data.nextpage);
  }

  async getVideo(id: string, opts?: RequestOptions): Promise<VideoDetails> {
    const data = asRecord(await this.call(`/streams/${encodeURIComponent(id)}`, {}, opts));
    const title = asString(data.title);
    if (title === undefined) throw new ProviderError('bad-response', 'Respuesta de vídeo incompleta');
    const details: VideoDetails = { id, title, channelTitle: asString(data.uploader) ?? '' };
    const channelId = channelIdFromUrl(asString(data.uploaderUrl));
    if (channelId) details.channelId = channelId;
    const thumb = asString(data.thumbnailUrl);
    if (thumb) details.thumbnailUrl = thumb;
    const duration = asNumber(data.duration);
    if (duration !== undefined && duration > 0) details.durationSeconds = duration;
    const uploaded = asNumber(data.uploaded);
    const uploadDate = asString(data.uploadDate);
    if (uploaded && uploaded > 0) details.publishedAt = new Date(uploaded).toISOString();
    else if (uploadDate) details.publishedAt = uploadDate;
    const views = asNumber(data.views);
    if (views !== undefined && views >= 0) details.viewCount = views;
    const likes = asNumber(data.likes);
    if (likes !== undefined && likes >= 0) details.likeCount = likes;
    const description = asString(data.description);
    if (description !== undefined) details.description = stripHtml(description);
    if (data.livestream === true) details.isLive = true;
    details.captionsAvailable = asArray(data.subtitles).length > 0;
    return details;
  }

  async getChannel(idOrHandle: string, opts?: RequestOptions): Promise<ChannelInfo> {
    const data = asRecord(await this.call(channelPath(idOrHandle), {}, opts));
    const id = asString(data.id);
    if (!id) throw new ProviderError('not-found', 'Canal no encontrado', 404);
    const info: ChannelInfo = { id, title: asString(data.name) ?? '' };
    const description = asString(data.description);
    if (description) info.description = description;
    const avatar = asString(data.avatarUrl);
    if (avatar) info.thumbnailUrl = avatar;
    const subs = asNumber(data.subscriberCount);
    if (subs !== undefined && subs >= 0) info.subscriberCount = subs;
    return info;
  }

  async getChannelVideos(channelId: string, opts?: RequestOptions): Promise<Page<VideoSummary>> {
    if (opts?.page) {
      const data = asRecord(await this.call(`/nextpage/channel/${encodeURIComponent(channelId)}`, { nextpage: opts.page }, opts));
      return this.mapPage(data.relatedStreams, data.nextpage);
    }
    const data = asRecord(await this.call(channelPath(channelId), {}, opts));
    return this.mapPage(data.relatedStreams, data.nextpage);
  }

  async getPlaylist(id: string, opts?: RequestOptions): Promise<PlaylistInfo> {
    const data = asRecord(await this.call(`/playlists/${encodeURIComponent(id)}`, {}, opts));
    const title = asString(data.name);
    if (title === undefined) throw new ProviderError('not-found', 'Lista no encontrada', 404);
    const info: PlaylistInfo = { id, title };
    const uploader = asString(data.uploader);
    if (uploader) info.channelTitle = uploader;
    const channelId = channelIdFromUrl(asString(data.uploaderUrl));
    if (channelId) info.channelId = channelId;
    const description = asString(data.description);
    if (description) info.description = description;
    const count = asNumber(data.videos);
    if (count !== undefined && count >= 0) info.itemCount = count;
    const thumb = asString(data.thumbnailUrl);
    if (thumb) info.thumbnailUrl = thumb;
    return info;
  }

  async getPlaylistItems(id: string, opts?: RequestOptions): Promise<Page<VideoSummary>> {
    const data = asRecord(
      opts?.page
        ? await this.call(`/nextpage/playlists/${encodeURIComponent(id)}`, { nextpage: opts.page }, opts)
        : await this.call(`/playlists/${encodeURIComponent(id)}`, {}, opts),
    );
    return this.mapPage(data.relatedStreams, data.nextpage);
  }

  private mapPage(items: unknown, nextpage: unknown): Page<VideoSummary> {
    const list = asArray(items)
      .map((raw) => mapStreamItem(asRecord(raw)))
      .filter((v): v is VideoSummary => v !== null);
    const next = asString(nextpage);
    return next && next !== 'null' ? { items: list, nextPage: next } : { items: list };
  }
}

function channelPath(idOrHandle: string): string {
  if (/^UC[\w-]{22}$/.test(idOrHandle)) return `/channel/${encodeURIComponent(idOrHandle)}`;
  const handle = idOrHandle.replace(/^@/, '');
  return `/@/${encodeURIComponent(handle)}`;
}

function channelIdFromUrl(url: string | undefined): string | undefined {
  const m = url ? /\/channel\/(UC[\w-]{22})/.exec(url) : null;
  return m?.[1];
}

function mapStreamItem(raw: Record<string, unknown>): VideoSummary | null {
  if (asString(raw.type) !== 'stream') return null;
  const url = asString(raw.url) ?? '';
  const m = /[?&]v=([\w-]{11})/.exec(url) ?? /\/watch\/([\w-]{11})/.exec(url);
  const id = m?.[1];
  if (!id) return null;
  const v: VideoSummary = { id, title: asString(raw.title) ?? '', channelTitle: asString(raw.uploaderName) ?? '' };
  const channelId = channelIdFromUrl(asString(raw.uploaderUrl));
  if (channelId) v.channelId = channelId;
  const thumb = asString(raw.thumbnail);
  if (thumb) v.thumbnailUrl = thumb;
  const duration = asNumber(raw.duration);
  if (duration !== undefined && duration > 0) v.durationSeconds = duration;
  else if (duration === -1) v.isLive = true;
  const uploaded = asNumber(raw.uploaded);
  if (uploaded && uploaded > 0) v.publishedAt = new Date(uploaded).toISOString();
  const uploadedDate = asString(raw.uploadedDate);
  if (uploadedDate) v.publishedText = uploadedDate;
  const views = asNumber(raw.views);
  if (views !== undefined && views >= 0) v.viewCount = views;
  return v;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function mapError(e: unknown): ProviderError {
  if (e instanceof HttpError) {
    const body = asRecord(e.body);
    const message = asString(body.message) ?? asString(body.error) ?? `HTTP ${e.status}`;
    if (e.status === 404) return new ProviderError('not-found', message, e.status);
    if (e.status === 429) return new ProviderError('unavailable', `La instancia limita las peticiones (429). ${message}`, e.status);
    return new ProviderError('unavailable', message, e.status);
  }
  return toProviderError(e);
}
