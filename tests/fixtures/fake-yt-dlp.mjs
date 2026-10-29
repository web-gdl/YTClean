#!/usr/bin/env node
// yt-dlp simulado para las pruebas del servicio local. Reproduce la forma de
// la salida real (-J, --flat-playlist, progreso JSON) sin tocar la red. Las
// URL de medios apuntan al servidor de pruebas indicado en FAKE_MEDIA_BASE.
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const media = process.env.FAKE_MEDIA_BASE ?? 'http://127.0.0.1:1/media';
const url = args.filter((a) => /^https?:\/\//.test(a) || a.startsWith('ytsearch')).at(-1) ?? '';
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

function entry(i, prefix = 'vid') {
  const id = `${prefix}${String(i).padStart(8, '0')}`.slice(0, 11).padEnd(11, 'x');
  return {
    _type: 'url',
    ie_key: 'Youtube',
    id,
    url: `https://www.youtube.com/watch?v=${id}`,
    title: `Vídeo ${i}`,
    description: 'desc',
    duration: 60 + i,
    channel_id: 'UCuAXFkgsw1L7xaCfnd5JJOw',
    channel: 'Canal de prueba',
    uploader: 'Canal de prueba',
    view_count: 1000 * i,
    live_status: i === 3 ? 'is_live' : null,
    thumbnails: [{ url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, height: 360, width: 480 }],
  };
}

if (args.includes('--version')) {
  process.stdout.write('2026.10.26-fake\n');
  process.exit(0);
}

if (args.includes('-J')) {
  if (url.startsWith('ytsearch')) {
    const m = /^ytsearch(\d+):(.*)$/.exec(url);
    const n = Number(m?.[1] ?? 20);
    const q = m?.[2] ?? '';
    const entries = q.includes('nada') ? [] : Array.from({ length: Math.min(n, 45) }, (_, i) => entry(i + 1));
    process.stdout.write(JSON.stringify({ _type: 'playlist', id: url, title: url, entries }));
    process.exit(0);
  }
  if (url.includes('/videos') || url.includes('playlist?list=')) {
    const start = Number(opt('--playlist-start') ?? 1);
    const end = Number(opt('--playlist-end') ?? 60);
    const total = url.includes('playlist?list=') ? 55 : 42;
    const entries = [];
    for (let i = start; i <= Math.min(end, total); i++) entries.push(entry(i, url.includes('playlist') ? 'pl' : 'ch'));
    const base = url.includes('playlist?list=')
      ? { _type: 'playlist', id: 'PLabcdefghijklmnop', title: 'Lista de prueba', channel: 'Canal de prueba', channel_id: 'UCuAXFkgsw1L7xaCfnd5JJOw', description: 'Una lista', playlist_count: total }
      : {
          _type: 'playlist',
          id: 'UCuAXFkgsw1L7xaCfnd5JJOw',
          channel_id: 'UCuAXFkgsw1L7xaCfnd5JJOw',
          channel: 'Canal de prueba',
          uploader_id: '@prueba',
          title: 'Canal de prueba - Videos',
          description: 'Descripción del canal',
          channel_follower_count: 12345,
          playlist_count: total,
          thumbnails: [
            { id: 'avatar_uncropped', url: 'https://yt3.googleusercontent.com/avatar=s900', width: 900, height: 900 },
            { id: 'avatar_uncropped', url: 'https://yt3.googleusercontent.com/avatar=s176', width: 176, height: 176 },
            { id: 'banner_uncropped', url: 'https://yt3.googleusercontent.com/banner', width: 2560, height: 423 },
          ],
        };
    process.stdout.write(JSON.stringify({ ...base, entries }));
    process.exit(0);
  }
  const id = /v=([\w-]{11})/.exec(url)?.[1];
  if (id === 'badbadbadb1') {
    process.stderr.write(`ERROR: [youtube] ${id}: Video unavailable. This video is not available\n`);
    process.exit(1);
  }
  if (id === 'livelivelv1') {
    process.stdout.write(JSON.stringify({ id, title: 'Directo', channel: 'C', is_live: true, live_status: 'is_live', formats: [] }));
    process.exit(0);
  }
  const headers = { 'User-Agent': 'fake-agent', Accept: '*/*' };
  process.stdout.write(
    JSON.stringify({
      id,
      title: 'Vídeo de prueba',
      description: 'Descripción\ncon dos líneas',
      channel: 'Canal de prueba',
      channel_id: 'UCuAXFkgsw1L7xaCfnd5JJOw',
      uploader: 'Canal de prueba',
      duration: 125,
      view_count: 4321,
      like_count: 99,
      upload_date: '20240102',
      timestamp: 1704196800,
      availability: 'public',
      age_limit: 0,
      live_status: 'not_live',
      thumbnails: [{ url: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg` }],
      subtitles: { es: [{ ext: 'vtt', url: `${media}/sub.vtt`, name: 'Spanish' }, { ext: 'ttml', url: `${media}/sub.ttml` }] },
      automatic_captions: { en: [{ ext: 'json3', url: `${media}/auto.json3` }, { ext: 'vtt', url: `${media}/auto.vtt`, name: 'English (auto)' }] },
      formats: [
        { format_id: '18', url: `${media}/v.mp4`, ext: 'mp4', protocol: 'https', vcodec: 'avc1.42001E', acodec: 'mp4a.40.2', height: 360, width: 640, fps: 30, filesize: 1000, tbr: 500, format_note: '360p', http_headers: headers },
        { format_id: '140', url: `${media}/a.m4a`, ext: 'm4a', protocol: 'https', vcodec: 'none', acodec: 'mp4a.40.2', abr: 129, tbr: 129, filesize: 600, language: 'es', format_note: 'medium', http_headers: headers },
        { format_id: '251', url: `${media}/a.webm`, ext: 'webm', protocol: 'https', vcodec: 'none', acodec: 'opus', abr: 140, filesize: 700, http_headers: headers },
        { format_id: '137', url: `${media}/v137.mp4`, ext: 'mp4', protocol: 'https', vcodec: 'avc1.640028', acodec: 'none', height: 1080, fps: 30, container: 'mp4_dash', http_headers: headers },
        { format_id: '247', url: `${media}/v247.webm`, ext: 'webm', protocol: 'https', vcodec: 'vp9', acodec: 'none', height: 720, fps: 30, container: 'webm_dash', http_headers: headers },
        { format_id: '22', url: `${media}/v22.mp4`, ext: 'mp4', protocol: 'https', vcodec: 'avc1.64001F', acodec: 'mp4a.40.2', height: 720, fps: 30, format_note: '720p, DAMAGED', http_headers: headers },
        { format_id: '299', url: `${media}/v299.mp4`, ext: 'mp4', protocol: 'https', vcodec: 'avc1.64002a', acodec: 'none', height: 1080, fps: 60, format_note: '1080p60, MISSING POT', http_headers: headers },
        { format_id: 'sabr-1', url: `${media}/sabr`, ext: 'mp4', protocol: 'sabr', vcodec: 'avc1', acodec: 'none', height: 1440 },
        { format_id: 'drm', url: `${media}/drm.mp4`, ext: 'mp4', protocol: 'https', vcodec: 'avc1', acodec: 'mp4a', height: 480, has_drm: true },
      ],
    }),
  );
  process.exit(0);
}

// Modo descarga.
const out = opt('-o');
const id = /v=([\w-]{11})/.exec(url)?.[1];
if (!out || !id) {
  process.stderr.write('ERROR: argumentos inesperados\n');
  process.exit(2);
}
if (id === 'failfailfa1') {
  process.stderr.write('ERROR: [youtube] failfailfa1: Requested format is not available\n');
  process.exit(1);
}
const total = 2048;
const progress = (downloaded, status = 'downloading') => process.stdout.write(`yc-progress ${JSON.stringify({ status, downloaded_bytes: downloaded, total_bytes: total, filename: out, speed: 1000, eta: 1 })}\n`);
progress(512);
progress(1536);
writeFileSync(out, Buffer.alloc(total, 7));
progress(total, 'finished');
process.exit(0);
