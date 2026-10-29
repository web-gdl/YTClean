// Utilidades puras: análisis de enlaces de YouTube, duraciones y formato.

export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
export const PLAYLIST_ID_RE = /^[A-Za-z0-9_-]{13,}$/;
export const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;

export type ParsedInput =
  | { kind: 'video'; id: string; start?: number; list?: string }
  | { kind: 'playlist'; id: string }
  | { kind: 'channel'; id: string }
  | { kind: 'handle'; handle: string };

const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);

/** Reconoce enlaces o IDs de YouTube pegados por el usuario. */
export function parseYouTubeInput(raw: string): ParsedInput | null {
  const input = raw.trim();
  if (!input) return null;
  // Un ID suelto debe parecer un ID (dígito, '-', '_' o mayúsculas y minúsculas mezcladas),
  // para no confundir palabras de 11 letras como «programador».
  if (VIDEO_ID_RE.test(input) && looksLikeId(input)) return { kind: 'video', id: input };
  if (CHANNEL_ID_RE.test(input)) return { kind: 'channel', id: input };
  if (/^@[A-Za-z0-9._-]{3,}$/.test(input)) return { kind: 'handle', handle: input.slice(1) };
  if (/^(PL|UU|OL|RD|FL)[A-Za-z0-9_-]{10,}$/.test(input) && looksLikeId(input.slice(2))) return { kind: 'playlist', id: input };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const path = url.pathname;
  const q = url.searchParams;
  const start = parseTimestamp(q.get('t') ?? q.get('start'));
  const list = q.get('list') ?? undefined;

  const video = (id: string | null | undefined): ParsedInput | null => {
    if (!id || !VIDEO_ID_RE.test(id)) return null;
    const r: ParsedInput = { kind: 'video', id };
    if (start) r.start = start;
    if (list) r.list = list;
    return r;
  };

  if (host === 'youtu.be') return video(path.split('/')[1]);
  if (!YT_HOSTS.has(host)) return null;

  if (path === '/watch') return video(q.get('v')) ?? (list ? { kind: 'playlist', id: list } : null);
  if (path === '/playlist' && list) return { kind: 'playlist', id: list };
  const seg = path.split('/').filter(Boolean);
  if (seg.length >= 2 && ['shorts', 'embed', 'live', 'v'].includes(seg[0] ?? '')) {
    if (seg[1] === 'videoseries' && list) return { kind: 'playlist', id: list };
    return video(seg[1]);
  }
  if (seg[0] === 'channel' && seg[1] && CHANNEL_ID_RE.test(seg[1])) return { kind: 'channel', id: seg[1] };
  if (seg[0]?.startsWith('@') && seg[0].length > 1) return { kind: 'handle', handle: seg[0].slice(1) };
  if ((seg[0] === 'c' || seg[0] === 'user') && seg[1]) return { kind: 'handle', handle: seg[1].replace(/^@/, '') };
  if (list && seg.length === 0) return { kind: 'playlist', id: list };
  return null;
}

function looksLikeId(s: string): boolean {
  return /[0-9_-]/.test(s) || (/[a-z]/.test(s) && /[A-Z]/.test(s.slice(1)));
}

/** "90", "1m30s", "1h2m3s" → segundos. */
export function parseTimestamp(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value) || undefined;
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/i.exec(value);
  if (!m) return undefined;
  const s = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  return s || undefined;
}

/** Duración ISO 8601 de la Data API ("PT1H2M3S", "P1DT2H") → segundos. */
export function parseIsoDuration(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (!m) return undefined;
  const [, d, h, min, s] = m;
  return Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Number(s ?? 0);
}

export function formatDuration(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

const compactFormatter = new Intl.NumberFormat('es', { notation: 'compact', maximumFractionDigits: 1 });
const plainFormatter = new Intl.NumberFormat('es');

export function formatCount(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return '';
  return n >= 10000 ? compactFormatter.format(n) : plainFormatter.format(n);
}

const dateFormatter = new Intl.DateTimeFormat('es', { year: 'numeric', month: 'short', day: 'numeric' });
const relativeFormatter = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

export function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : dateFormatter.format(d);
}

export function formatRelative(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = (d.getTime() - now.getTime()) / 1000;
  const abs = Math.abs(diff);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (abs >= size) return relativeFormatter.format(Math.round(diff / size), unit);
  }
  return relativeFormatter.format(0, 'minute');
}

/** Decodifica las entidades HTML que la Data API incluye en títulos de búsqueda. */
export function decodeHtmlEntities(text: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    const e = entity.toLowerCase();
    try {
      if (e.startsWith('#x')) return String.fromCodePoint(parseInt(e.slice(2), 16));
      if (e.startsWith('#')) return String.fromCodePoint(parseInt(e.slice(1), 10));
    } catch {
      return match;
    }
    return named[e] ?? match;
  });
}

/** Lectura tolerante de respuestas JSON desconocidas. */
export function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
export function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
export function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
export function asNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}
export function asBoolean(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

/** Miniatura estándar de YouTube para un ID (calidad media, 320×180). */
export function youtubeThumbnail(id: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/mqdefault.jpg`;
}

export function youtubeWatchUrl(id: string, start?: number): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}${start ? `&t=${start}s` : ''}`;
}
export function youtubeChannelUrl(id: string): string {
  return `https://www.youtube.com/channel/${encodeURIComponent(id)}`;
}
export function youtubePlaylistUrl(id: string): string {
  return `https://www.youtube.com/playlist?list=${encodeURIComponent(id)}`;
}
