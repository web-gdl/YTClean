// Conversión de la salida JSON de yt-dlp (-J) al modelo de datos de la web.
// Funciones puras, sin red: se prueban con fixtures.

export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
export const CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;
export const PLAYLIST_ID_RE = /^[A-Za-z0-9_-]{13,}$/;
export const HANDLE_RE = /^@?[A-Za-z0-9._-]{3,}$/;
export const LANG_RE = /^[A-Za-z0-9-]{2,20}$/;
export const FORMAT_ID_RE = /^[A-Za-z0-9_.-]{1,40}$/;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
const str = (v) => (typeof v === 'string' ? v : undefined);

/** YYYYMMDD → ISO 8601 (medianoche UTC). */
export function uploadDateToIso(raw) {
  const s = str(raw);
  if (!s || !/^\d{8}$/.test(s)) return undefined;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00.000Z`;
}

/** Entrada plana (ytsearch, canal, lista) → VideoSummary. */
export function mapEntry(entry, thumbUrl) {
  if (!entry || typeof entry !== 'object') return null;
  const id = str(entry.id);
  if (!id || !VIDEO_ID_RE.test(id)) return null;
  const v = { id, title: str(entry.title) ?? '', channelTitle: str(entry.channel) ?? str(entry.uploader) ?? '' };
  const channelId = str(entry.channel_id);
  if (channelId && CHANNEL_ID_RE.test(channelId)) v.channelId = channelId;
  v.thumbnailUrl = thumbUrl(id);
  const duration = num(entry.duration);
  if (duration !== undefined && duration > 0) v.durationSeconds = Math.round(duration);
  const timestamp = num(entry.timestamp);
  if (timestamp) v.publishedAt = new Date(timestamp * 1000).toISOString();
  else {
    const iso = uploadDateToIso(entry.upload_date);
    if (iso) v.publishedAt = iso;
  }
  const views = num(entry.view_count) ?? num(entry.concurrent_view_count);
  if (views !== undefined) v.viewCount = views;
  if (entry.live_status === 'is_live') v.isLive = true;
  return v;
}

export function mapEntries(entries, thumbUrl) {
  return (Array.isArray(entries) ? entries : []).map((e) => mapEntry(e, thumbUrl)).filter(Boolean);
}

/** Resultado completo de un vídeo (-J) → VideoDetails. */
export function mapVideo(info, thumbUrl) {
  const id = str(info?.id);
  if (!id || !VIDEO_ID_RE.test(id)) return null;
  const v = mapEntry(info, thumbUrl);
  const description = str(info.description);
  if (description !== undefined) v.description = description;
  const likes = num(info.like_count);
  if (likes !== undefined) v.likeCount = likes;
  const availability = str(info.availability);
  if (availability === 'public' || availability === 'unlisted' || availability === 'private') v.privacy = availability;
  const age = num(info.age_limit);
  v.ageRestricted = age !== undefined && age >= 18;
  v.embeddable = true;
  v.captionsAvailable = Object.keys(info.subtitles ?? {}).length > 0 || Object.keys(info.automatic_captions ?? {}).length > 0;
  return v;
}

const BROWSER_VIDEO = /^(avc1|av01|vp09|vp9|vp8)/;
const BROWSER_AUDIO = /^(mp4a|opus|vorbis)/;

/**
 * Clasifica los formatos de yt-dlp en opciones reproducibles por un navegador.
 *  - progressive: vídeo+audio en un solo archivo (https), p. ej. itag 18.
 *  - audio: solo audio (https), p. ej. itag 140/251.
 *  - hq: alturas disponibles como vídeo adaptativo (para descargar y remuxar).
 */
export function classifyFormats(formats) {
  const list = Array.isArray(formats) ? formats : [];
  const progressive = [];
  const audio = [];
  const heights = new Set();
  for (const f of list) {
    if (!f || typeof f !== 'object') continue;
    const formatId = str(f.format_id);
    if (!formatId || !FORMAT_ID_RE.test(formatId)) continue;
    if (f.has_drm) continue;
    const protocol = str(f.protocol) ?? '';
    const vcodec = str(f.vcodec) ?? 'none';
    const acodec = str(f.acodec) ?? 'none';
    const hasVideo = vcodec !== 'none';
    const hasAudio = acodec !== 'none';
    const height = num(f.height);
    const ext = str(f.ext) ?? '';
    const note = str(f.format_note) ?? '';
    if (/MISSING POT|DAMAGED/i.test(note)) continue;
    if (!/^https?$/.test(protocol) || !str(f.url)) continue;
    if (hasVideo && height) heights.add(height);
    const base = { formatId, ext, bytes: num(f.filesize) ?? num(f.filesize_approx), bitrateKbps: num(f.tbr), note };
    if (hasVideo && hasAudio && BROWSER_VIDEO.test(vcodec) && BROWSER_AUDIO.test(acodec) && (ext === 'mp4' || ext === 'webm')) {
      progressive.push({ ...base, height: height ?? 0, fps: num(f.fps), vcodec, acodec, label: `${height ?? '?'}p${num(f.fps) && num(f.fps) > 30 ? Math.round(num(f.fps)) : ''}` });
    } else if (hasAudio && !hasVideo && BROWSER_AUDIO.test(acodec) && (ext === 'm4a' || ext === 'webm' || ext === 'mp4')) {
      const abr = num(f.abr) ?? num(f.tbr);
      const language = str(f.language);
      audio.push({ ...base, acodec, abr, language, label: `${acodec.startsWith('mp4a') ? 'AAC' : 'Opus'} ${abr ? `${Math.round(abr)} kb/s` : ''}${language ? ` · ${language}` : ''}`.trim() });
    }
  }
  progressive.sort((a, b) => b.height - a.height || (b.bitrateKbps ?? 0) - (a.bitrateKbps ?? 0));
  audio.sort((a, b) => (b.abr ?? 0) - (a.abr ?? 0));
  const hq = [...heights].filter((h) => h > 360).sort((a, b) => a - b).map((h) => ({ quality: h, label: `${h}p` }));
  return { progressive, audio, hq };
}

/** Pistas de subtítulos (manuales y automáticas) con URL VTT. */
export function listSubtitles(info) {
  const out = [];
  const collect = (table, auto) => {
    if (!table || typeof table !== 'object') return;
    for (const [lang, tracks] of Object.entries(table)) {
      if (!LANG_RE.test(lang) || !Array.isArray(tracks)) continue;
      const vtt = tracks.find((t) => t && t.ext === 'vtt' && typeof t.url === 'string');
      if (!vtt) continue;
      out.push({ lang, name: str(vtt.name) ?? lang, auto, url: vtt.url });
    }
  };
  collect(info?.subtitles, false);
  collect(info?.automatic_captions, true);
  return out;
}

/** Metadatos de un canal a partir de la extracción plana de su pestaña de vídeos. */
export function mapChannel(info, thumbUrl) {
  const id = str(info?.channel_id) ?? str(info?.id);
  if (!id || !CHANNEL_ID_RE.test(id)) return null;
  const c = { id, title: str(info.channel) ?? str(info.uploader) ?? str(info.title)?.replace(/ - Videos$/, '') ?? '' };
  const description = str(info.description);
  if (description) c.description = description;
  const followers = num(info.channel_follower_count);
  if (followers !== undefined) c.subscriberCount = followers;
  const count = num(info.playlist_count);
  if (count !== undefined) c.videoCount = count;
  const avatar = pickAvatar(info.thumbnails);
  if (avatar) c.thumbnailUrl = thumbUrl ? thumbUrl(avatar) : avatar;
  return c;
}

export function mapPlaylist(info) {
  const id = str(info?.id);
  if (!id || !PLAYLIST_ID_RE.test(id)) return null;
  const p = { id, title: str(info.title) ?? '' };
  const channelTitle = str(info.channel) ?? str(info.uploader);
  if (channelTitle) p.channelTitle = channelTitle;
  const channelId = str(info.channel_id);
  if (channelId && CHANNEL_ID_RE.test(channelId)) p.channelId = channelId;
  const description = str(info.description);
  if (description) p.description = description;
  const count = num(info.playlist_count);
  if (count !== undefined) p.itemCount = count;
  return p;
}

function pickAvatar(thumbnails) {
  if (!Array.isArray(thumbnails)) return undefined;
  const avatars = thumbnails.filter((t) => t && typeof t.url === 'string' && /avatar/i.test(String(t.id ?? '')));
  const pool = avatars.length ? avatars : thumbnails.filter((t) => t && typeof t.url === 'string');
  pool.sort((a, b) => (num(b.width) ?? 0) - (num(a.width) ?? 0));
  const best = pool.find((t) => (num(t.width) ?? 0) <= 240) ?? pool.at(-1);
  return best?.url;
}

/** Analiza una línea de progreso emitida con --progress-template "download:yc-progress %(progress)j". */
export function parseProgressLine(line) {
  const m = /^yc-progress (\{.*\})\s*$/.exec(line);
  if (!m) return null;
  try {
    const p = JSON.parse(m[1]);
    const downloaded = num(p.downloaded_bytes) ?? 0;
    const total = num(p.total_bytes) ?? num(p.total_bytes_estimate);
    return {
      status: str(p.status) ?? 'downloading',
      downloaded,
      total,
      percent: total ? Math.min(100, (downloaded / total) * 100) : num(p._percent),
      speed: num(p.speed),
      eta: num(p.eta),
      filename: str(p.filename),
    };
  } catch {
    return null;
  }
}
