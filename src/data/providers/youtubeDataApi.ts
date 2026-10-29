// Adaptador para la API oficial YouTube Data API v3.
// Documentación: https://developers.google.com/youtube/v3/docs
// Límites: cuota diaria (10 000 unidades por defecto; search.list cuesta 100,
// el resto de métodos list cuesta 1). La clave la pone el usuario en Ajustes y
// se envía solo a www.googleapis.com.
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
import { asArray, asNumber, asRecord, asString, decodeHtmlEntities, parseIsoDuration } from '../util';

const API = 'https://www.googleapis.com/youtube/v3';
const PAGE_SIZE = 20;

export class YouTubeDataApiProvider implements DataProvider {
  readonly id = 'youtube-data-api' as const;
  readonly label = 'YouTube Data API v3';
  readonly hosts = ['www.googleapis.com', 'i.ytimg.com', 'yt3.ggpht.com'] as const;

  constructor(private readonly apiKey: string) {
    if (!apiKey.trim()) throw new ProviderError('not-configured', 'Falta la clave de API');
  }

  private async call(method: string, params: Record<string, string | number | undefined>, opts?: RequestOptions): Promise<Record<string, unknown>> {
    const url = buildUrl(`${API}/${method}`, { ...params, key: this.apiKey });
    try {
      return asRecord(await fetchJson(url, { signal: opts?.signal }));
    } catch (e) {
      throw mapError(e);
    }
  }

  async searchVideos(query: string, opts?: RequestOptions): Promise<Page<VideoSummary>> {
    const data = await this.call(
      'search',
      {
        part: 'snippet',
        type: 'video',
        q: query,
        maxResults: PAGE_SIZE,
        pageToken: opts?.page,
        safeSearch: 'none',
      },
      opts,
    );
    const items = asArray(data.items).map(asRecord);
    const ids = items.map((it) => asString(asRecord(it.id).videoId)).filter((v): v is string => Boolean(v));
    // Un segundo método (1 unidad) aporta duración y visualizaciones.
    const details = ids.length ? await this.videosById(ids, opts) : new Map<string, Record<string, unknown>>();
    const videos: VideoSummary[] = [];
    for (const it of items) {
      const id = asString(asRecord(it.id).videoId);
      if (!id) continue;
      const snippet = asRecord(it.snippet);
      const extra = details.get(id);
      videos.push({
        ...mapSnippet(id, snippet, true),
        ...(extra ? mapVideoExtras(extra) : {}),
      });
    }
    const next = asString(data.nextPageToken);
    return next ? { items: videos, nextPage: next } : { items: videos };
  }

  private async videosById(ids: string[], opts?: RequestOptions): Promise<Map<string, Record<string, unknown>>> {
    const data = await this.call('videos', { part: 'snippet,contentDetails,statistics,status', id: ids.join(','), maxResults: 50 }, opts);
    const map = new Map<string, Record<string, unknown>>();
    for (const raw of asArray(data.items)) {
      const it = asRecord(raw);
      const id = asString(it.id);
      if (id) map.set(id, it);
    }
    return map;
  }

  async getVideo(id: string, opts?: RequestOptions): Promise<VideoDetails> {
    const map = await this.videosById([id], opts);
    const it = map.get(id);
    if (!it) throw new ProviderError('not-found', 'Vídeo no encontrado', 404);
    const snippet = asRecord(it.snippet);
    const status = asRecord(it.status);
    const content = asRecord(it.contentDetails);
    const region = asRecord(content.regionRestriction);
    const rating = asRecord(content.contentRating);
    const privacy = asString(status.privacyStatus);
    const details: VideoDetails = {
      ...mapSnippet(id, snippet, false),
      ...mapVideoExtras(it),
    };
    const description = asString(snippet.description);
    if (description !== undefined) details.description = description;
    const embeddable = status.embeddable;
    if (typeof embeddable === 'boolean') details.embeddable = embeddable;
    if (privacy === 'public' || privacy === 'unlisted' || privacy === 'private') details.privacy = privacy;
    details.ageRestricted = asString(rating.ytRating) === 'ytAgeRestricted';
    details.regionRestricted = asArray(region.allowed).length > 0 || asArray(region.blocked).length > 0;
    details.captionsAvailable = asString(content.caption) === 'true';
    return details;
  }

  async getChannel(idOrHandle: string, opts?: RequestOptions): Promise<ChannelInfo> {
    const selector = idOrHandle.startsWith('@')
      ? { forHandle: idOrHandle }
      : /^UC[\w-]{22}$/.test(idOrHandle)
        ? { id: idOrHandle }
        : { forHandle: `@${idOrHandle}` };
    const data = await this.call('channels', { part: 'snippet,statistics', ...selector }, opts);
    const it = asRecord(asArray(data.items)[0]);
    const id = asString(it.id);
    if (!id) throw new ProviderError('not-found', 'Canal no encontrado', 404);
    const snippet = asRecord(it.snippet);
    const stats = asRecord(it.statistics);
    const info: ChannelInfo = { id, title: asString(snippet.title) ?? '' };
    const description = asString(snippet.description);
    if (description) info.description = description;
    const thumb = pickThumbnail(asRecord(snippet.thumbnails));
    if (thumb) info.thumbnailUrl = thumb;
    const subs = asNumber(stats.subscriberCount);
    if (subs !== undefined && stats.hiddenSubscriberCount !== true) info.subscriberCount = subs;
    const videos = asNumber(stats.videoCount);
    if (videos !== undefined) info.videoCount = videos;
    return info;
  }

  async getChannelVideos(channelId: string, opts?: RequestOptions): Promise<Page<VideoSummary>> {
    // Los vídeos subidos están en la lista "UU" + resto del ID del canal; una
    // consulta a playlistItems cuesta 1 unidad frente a las 100 de search.
    if (!/^UC[\w-]{22}$/.test(channelId)) {
      const ch = await this.getChannel(channelId, opts);
      channelId = ch.id;
    }
    return this.getPlaylistItems(`UU${channelId.slice(2)}`, opts);
  }

  async getPlaylist(id: string, opts?: RequestOptions): Promise<PlaylistInfo> {
    const data = await this.call('playlists', { part: 'snippet,contentDetails', id }, opts);
    const it = asRecord(asArray(data.items)[0]);
    const pid = asString(it.id);
    if (!pid) throw new ProviderError('not-found', 'Lista no encontrada', 404);
    const snippet = asRecord(it.snippet);
    const info: PlaylistInfo = { id: pid, title: asString(snippet.title) ?? '' };
    const channelTitle = asString(snippet.channelTitle);
    if (channelTitle) info.channelTitle = channelTitle;
    const channelId = asString(snippet.channelId);
    if (channelId) info.channelId = channelId;
    const description = asString(snippet.description);
    if (description) info.description = description;
    const count = asNumber(asRecord(it.contentDetails).itemCount);
    if (count !== undefined) info.itemCount = count;
    const thumb = pickThumbnail(asRecord(snippet.thumbnails));
    if (thumb) info.thumbnailUrl = thumb;
    return info;
  }

  async getPlaylistItems(id: string, opts?: RequestOptions): Promise<Page<VideoSummary>> {
    const data = await this.call('playlistItems', { part: 'snippet,contentDetails', playlistId: id, maxResults: 50, pageToken: opts?.page }, opts);
    const items: VideoSummary[] = [];
    const ids: string[] = [];
    for (const raw of asArray(data.items)) {
      const it = asRecord(raw);
      const snippet = asRecord(it.snippet);
      const vid = asString(asRecord(snippet.resourceId).videoId) ?? asString(asRecord(it.contentDetails).videoId);
      if (!vid) continue;
      const title = asString(snippet.title) ?? '';
      // Entradas de vídeos borrados o privados: la lista los conserva con un título fijo.
      if (title === 'Deleted video' || title === 'Private video') continue;
      ids.push(vid);
      const v: VideoSummary = {
        id: vid,
        title,
        channelTitle: asString(snippet.videoOwnerChannelTitle) ?? asString(snippet.channelTitle) ?? '',
      };
      const ownerId = asString(snippet.videoOwnerChannelId);
      if (ownerId) v.channelId = ownerId;
      const thumb = pickThumbnail(asRecord(snippet.thumbnails));
      if (thumb) v.thumbnailUrl = thumb;
      const published = asString(asRecord(it.contentDetails).videoPublishedAt);
      if (published) v.publishedAt = published;
      items.push(v);
    }
    if (ids.length) {
      const details = await this.videosById(ids, opts);
      for (const v of items) {
        const extra = details.get(v.id);
        if (extra) Object.assign(v, mapVideoExtras(extra));
      }
    }
    const next = asString(data.nextPageToken);
    return next ? { items, nextPage: next } : { items };
  }
}

function mapSnippet(id: string, snippet: Record<string, unknown>, htmlEscaped: boolean): VideoSummary {
  const rawTitle = asString(snippet.title) ?? '';
  const rawChannel = asString(snippet.channelTitle) ?? '';
  const v: VideoSummary = {
    id,
    title: htmlEscaped ? decodeHtmlEntities(rawTitle) : rawTitle,
    channelTitle: htmlEscaped ? decodeHtmlEntities(rawChannel) : rawChannel,
  };
  const channelId = asString(snippet.channelId);
  if (channelId) v.channelId = channelId;
  const thumb = pickThumbnail(asRecord(snippet.thumbnails));
  if (thumb) v.thumbnailUrl = thumb;
  const published = asString(snippet.publishedAt);
  if (published) v.publishedAt = published;
  if (asString(snippet.liveBroadcastContent) === 'live') v.isLive = true;
  return v;
}

function mapVideoExtras(it: Record<string, unknown>): Partial<VideoSummary> {
  const out: Partial<VideoSummary> = {};
  const duration = parseIsoDuration(asString(asRecord(it.contentDetails).duration));
  if (duration !== undefined) out.durationSeconds = duration;
  const views = asNumber(asRecord(it.statistics).viewCount);
  if (views !== undefined) out.viewCount = views;
  return out;
}

function pickThumbnail(thumbs: Record<string, unknown>): string | undefined {
  for (const key of ['medium', 'high', 'default', 'standard']) {
    const url = asString(asRecord(thumbs[key]).url);
    if (url) return url;
  }
  return undefined;
}

function mapError(e: unknown): ProviderError {
  if (e instanceof HttpError) {
    const body = asRecord(e.body);
    const error = asRecord(body.error);
    const first = asRecord(asArray(error.errors)[0]);
    const reason = asString(first.reason) ?? asString(error.status) ?? '';
    const message = asString(error.message) ?? `HTTP ${e.status}`;
    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded' || reason === 'rateLimitExceeded') {
      return new ProviderError('quota', message, e.status);
    }
    if (e.status === 400 && /key/i.test(reason)) return new ProviderError('auth', message, e.status);
    if (e.status === 401 || e.status === 403) return new ProviderError('auth', message, e.status);
    if (e.status === 404) return new ProviderError('not-found', message, e.status);
    return new ProviderError('unavailable', message, e.status);
  }
  return toProviderError(e);
}
