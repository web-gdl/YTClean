// Modelo de datos común a todas las fuentes. Los adaptadores convierten las
// respuestas de cada servicio a estas estructuras; la interfaz no conoce ningún
// formato concreto.

export interface VideoSummary {
  id: string;
  title: string;
  channelTitle: string;
  channelId?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  /** Fecha ISO 8601 cuando se conoce. */
  publishedAt?: string;
  /** Texto relativo tal como lo da la fuente ("hace 2 años"), si no hay fecha. */
  publishedText?: string;
  viewCount?: number;
  isLive?: boolean;
}

export interface VideoDetails extends VideoSummary {
  description?: string;
  /** false cuando el propietario prohíbe insertar el vídeo. */
  embeddable?: boolean;
  privacy?: 'public' | 'unlisted' | 'private';
  ageRestricted?: boolean;
  /** Hay restricciones por país (listas blancas o negras). */
  regionRestricted?: boolean;
  captionsAvailable?: boolean;
  likeCount?: number;
}

export interface ChannelInfo {
  id: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  subscriberCount?: number;
  videoCount?: number;
}

export interface PlaylistInfo {
  id: string;
  title: string;
  channelTitle?: string;
  channelId?: string;
  description?: string;
  itemCount?: number;
  thumbnailUrl?: string;
}

export interface Page<T> {
  items: T[];
  /** Testigo opaco para pedir la página siguiente; undefined si no hay más. */
  nextPage?: string;
}

export interface RequestOptions {
  page?: string | undefined;
  signal?: AbortSignal | undefined;
}

export type ProviderId = 'none' | 'youtube-data-api' | 'invidious' | 'piped';

export interface DataProvider {
  readonly id: ProviderId;
  readonly label: string;
  /** Hosts a los que este proveedor puede conectarse (para informar al usuario). */
  readonly hosts: readonly string[];
  searchVideos(query: string, opts?: RequestOptions): Promise<Page<VideoSummary>>;
  getVideo(id: string, opts?: RequestOptions): Promise<VideoDetails>;
  getChannel(idOrHandle: string, opts?: RequestOptions): Promise<ChannelInfo>;
  getChannelVideos(channelId: string, opts?: RequestOptions): Promise<Page<VideoSummary>>;
  getPlaylist(id: string, opts?: RequestOptions): Promise<PlaylistInfo>;
  getPlaylistItems(id: string, opts?: RequestOptions): Promise<Page<VideoSummary>>;
}

export type ProviderErrorCode =
  | 'network'
  | 'not-configured'
  | 'quota'
  | 'auth'
  | 'not-found'
  | 'unavailable'
  | 'bad-response'
  | 'aborted'
  | 'unsupported';

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly status: number | undefined;
  constructor(code: ProviderErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.status = status;
  }
}

export function toProviderError(e: unknown): ProviderError {
  if (e instanceof ProviderError) return e;
  if (e instanceof DOMException && e.name === 'AbortError') return new ProviderError('aborted', 'Cancelado');
  if (e instanceof TypeError) return new ProviderError('network', e.message);
  return new ProviderError('bad-response', e instanceof Error ? e.message : String(e));
}
