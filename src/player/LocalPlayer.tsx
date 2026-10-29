// Reproductor local: pide al servicio local (yt-dlp) los flujos del vídeo y los
// reproduce con <video> nativo, sin el reproductor de YouTube. Ofrece calidad
// inmediata (progresiva), solo audio, descarga en alta calidad a la caché
// local, subtítulos, velocidad, imagen en imagen y Media Session.
import { useEffect, useMemo, useRef, useState } from 'react';
import { S } from '../app/strings';
import { LocalClient, type LocalJob, type LocalResolved } from '../data/providers/local';
import { toProviderError, type ProviderError, type VideoDetails } from '../data/types';
import { formatCount } from '../data/util';
import { useSettings } from '../storage/settings';

interface Props {
  videoId: string;
  title: string;
  start?: number | undefined;
  thumbnailUrl?: string | undefined;
  onUseOfficial: () => void;
  onVideoInfo?: ((v: VideoDetails) => void) | undefined;
}

interface Source {
  key: string;
  url: string;
  label: string;
  audioOnly: boolean;
}

type Phase = { status: 'facade' } | { status: 'resolving' } | { status: 'ready'; resolved: LocalResolved; source: Source } | { status: 'error'; error: ProviderError };

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function pickInitial(r: LocalResolved): Source | null {
  if (r.cached) return { key: `file`, url: r.cached.url, label: `${r.cached.quality}p · ${S.local.cachedTag}`, audioOnly: false };
  const p = r.progressive[0];
  if (p) return { key: `p:${p.formatId}`, url: p.url, label: p.label, audioOnly: false };
  const a = r.audio[0];
  if (a) return { key: `a:${a.formatId}`, url: a.url, label: `${S.local.audioOnly} · ${a.label}`, audioOnly: true };
  return null;
}

function formatBytes(n: number | undefined): string {
  if (!n) return '';
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} GB`;
  if (n >= 1_000_000) return `${Math.round(n / 1_000_000)} MB`;
  return `${Math.round(n / 1000)} kB`;
}

export function LocalPlayer({ videoId, title, start, thumbnailUrl, onUseOfficial, onVideoInfo }: Props) {
  const settings = useSettings();
  const client = new LocalClient(settings.localServiceUrl);
  const crossOrigin = typeof window !== 'undefined' && client.base !== window.location.origin;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phaseFor, setPhaseFor] = useState<{ id: string; phase: Phase }>({ id: videoId, phase: { status: 'facade' } });
  const phase: Phase = useMemo(() => (phaseFor.id === videoId ? phaseFor.phase : { status: 'facade' }), [phaseFor, videoId]);
  const setPhase = (p: Phase) => setPhaseFor({ id: videoId, phase: p });
  const [job, setJob] = useState<LocalJob | null>(null);
  const [speed, setSpeed] = useState(1);
  const [startApplied, setStartApplied] = useState<string | null>(null);
  const resumeAt = useRef<{ time: number; playing: boolean } | null>(null);

  const resolve = async () => {
    setPhase({ status: 'resolving' });
    try {
      const resolved = await client.resolve(videoId);
      onVideoInfo?.(resolved.video);
      const source = pickInitial(resolved);
      if (!source) throw toProviderError(new Error(S.local.noFormats));
      setJob(resolved.job);
      setPhase({ status: 'ready', resolved, source });
    } catch (e) {
      setPhase({ status: 'error', error: toProviderError(e) });
    }
  };

  // Sondeo de una descarga en curso.
  useEffect(() => {
    if (!job || (job.status !== 'queued' && job.status !== 'running')) return;
    const timer = setInterval(() => {
      client.downloadStatus(videoId).then(
        (j) => {
          setJob(j);
          if (j.status === 'done' && j.file) {
            const v = videoRef.current;
            resumeAt.current = v ? { time: v.currentTime, playing: !v.paused } : null;
            setPhaseFor((prev) => (prev.phase.status === 'ready' ? { ...prev, phase: { ...prev.phase, source: { key: 'file', url: j.file ?? '', label: `${j.quality ?? ''}p · ${S.local.cachedTag}`, audioOnly: false } } } : prev));
          }
        },
        () => {
          /* se reintenta en el siguiente tic */
        },
      );
    }, 1000);
    return () => {
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status, videoId]);

  // Aplica velocidad y punto de reanudación al cambiar de fuente.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.playbackRate = speed;
    const resume = resumeAt.current;
    if (resume) {
      resumeAt.current = null;
      const onMeta = () => {
        v.currentTime = resume.time;
        if (resume.playing) void v.play().catch(() => undefined);
      };
      v.addEventListener('loadedmetadata', onMeta, { once: true });
      return () => v.removeEventListener('loadedmetadata', onMeta);
    }
    return undefined;
  });

  // Media Session: controles del sistema (pantalla de bloqueo, teclado multimedia).
  useEffect(() => {
    if (phase.status !== 'ready' || !('mediaSession' in navigator)) return;
    const v = videoRef.current;
    const info = phase.resolved.video;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: info.title, artist: info.channelTitle, artwork: info.thumbnailUrl ? [{ src: info.thumbnailUrl }] : [] });
      navigator.mediaSession.setActionHandler('play', () => void v?.play());
      navigator.mediaSession.setActionHandler('pause', () => v?.pause());
      navigator.mediaSession.setActionHandler('seekbackward', () => {
        if (v) v.currentTime = Math.max(0, v.currentTime - 10);
      });
      navigator.mediaSession.setActionHandler('seekforward', () => {
        if (v) v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 10);
      });
    } catch {
      /* navegador sin Media Session */
    }
    return () => {
      try {
        navigator.mediaSession.metadata = null;
      } catch {
        /* ignorar */
      }
    };
  }, [phase]);

  if (phase.status === 'facade' || phase.status === 'resolving') {
    const showThumb = settings.thumbnails === 'show' && thumbnailUrl;
    return (
      <div className="player">
        <button type="button" className="player__facade" onClick={() => void resolve()} disabled={phase.status === 'resolving'} aria-label={S.video.playAria(title)}>
          {showThumb ? <img className="player__poster" src={thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="player__poster player__poster--empty" aria-hidden="true" />}
          <span className="player__play" aria-hidden="true">
            {phase.status === 'resolving' ? <span className="spinner" /> : (
              <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
            <span>{phase.status === 'resolving' ? S.local.resolving : S.video.play}</span>
          </span>
          <span className="player__note">{S.local.facadeNote}</span>
        </button>
      </div>
    );
  }

  if (phase.status === 'error') {
    const text = S.status.errors[phase.error.code] ?? phase.error.message;
    return (
      <div className="player player--blocked" role="alert">
        <div>
          <p>
            <strong>{S.local.failed}</strong> {phase.error.message || text}
          </p>
          <div className="watch__actions" style={{ justifyContent: 'center' }}>
            <button type="button" className="button" onClick={() => void resolve()}>
              {S.status.retry}
            </button>
            <button type="button" className="button button--primary" onClick={onUseOfficial}>
              {S.local.useOfficial}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { resolved, source } = phase;
  const changeSource = (key: string) => {
    const v = videoRef.current;
    resumeAt.current = v ? { time: v.currentTime, playing: !v.paused } : null;
    if (key === 'file' && resolved.cached) setPhase({ status: 'ready', resolved, source: { key, url: resolved.cached.url, label: `${resolved.cached.quality}p · ${S.local.cachedTag}`, audioOnly: false } });
    else if (key.startsWith('p:')) {
      const f = resolved.progressive.find((x) => `p:${x.formatId}` === key);
      if (f) setPhase({ status: 'ready', resolved, source: { key, url: f.url, label: f.label, audioOnly: false } });
    } else if (key.startsWith('a:')) {
      const f = resolved.audio.find((x) => `a:${x.formatId}` === key);
      if (f) setPhase({ status: 'ready', resolved, source: { key, url: f.url, label: `${S.local.audioOnly} · ${f.label}`, audioOnly: true } });
    } else if (key.startsWith('hq:')) {
      resumeAt.current = null;
      const quality = Number(key.slice(3));
      client.startDownload(videoId, quality).then(setJob, (e: unknown) => {
        const err = toProviderError(e);
        setJob({ id: videoId, status: 'error', quality, error: { code: err.code, message: err.message } });
      });
    }
  };

  const downloading = job && (job.status === 'queued' || job.status === 'running');
  const tracks = resolved.subtitles;
  const defaultLang = settings.captions ? settings.playerLanguage : '';
  const canPip = typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && (document as Document & { pictureInPictureEnabled?: boolean }).pictureInPictureEnabled;

  return (
    <div className="local-player">
      <div className={source.audioOnly ? 'player player--audio' : 'player'}>
        <video
          key={source.key}
          ref={videoRef}
          className="player__frame"
          src={source.url}
          poster={source.audioOnly && settings.thumbnails === 'show' ? (resolved.video.thumbnailUrl ?? thumbnailUrl) : undefined}
          controls
          autoPlay
          playsInline
          preload="metadata"
          crossOrigin={crossOrigin ? 'anonymous' : undefined}
          onLoadedMetadata={(e) => {
            if (start && startApplied !== videoId) {
              e.currentTarget.currentTime = start;
              setStartApplied(videoId);
            }
          }}
          onRateChange={(e) => setSpeed(e.currentTarget.playbackRate)}
        >
          {tracks.map((t) => (
            <track key={`${t.lang}-${t.auto ? 'a' : 'm'}`} kind="subtitles" srcLang={t.lang} label={t.auto ? `${t.name} (auto)` : t.name} src={t.url} default={Boolean(defaultLang) && t.lang.toLowerCase().startsWith(defaultLang.toLowerCase()) && !t.auto} />
          ))}
        </video>
      </div>

      <div className="local-player__bar">
        <label className="local-player__control">
          <span>{S.local.quality}</span>
          <select className="input input--small" value={source.key} onChange={(e) => changeSource(e.target.value)}>
            {resolved.cached ? <option value="file">{`${resolved.cached.quality}p · ${S.local.cachedTag} (${formatBytes(resolved.cached.bytes)})`}</option> : null}
            {resolved.progressive.map((f) => (
              <option key={f.formatId} value={`p:${f.formatId}`}>
                {f.label} · {S.local.instant}
              </option>
            ))}
            {resolved.audio.map((f) => (
              <option key={f.formatId} value={`a:${f.formatId}`}>
                {S.local.audioOnly} · {f.label}
              </option>
            ))}
            {resolved.hq.map((h) => (
              <option key={h.quality} value={`hq:${h.quality}`} disabled={!h.available || Boolean(downloading) || (resolved.cached?.quality ?? 0) >= h.quality}>
                {h.label} · {h.available ? S.local.downloadAndPlay : S.local.needsFfmpeg}
              </option>
            ))}
          </select>
        </label>
        <label className="local-player__control">
          <span>{S.local.speed}</span>
          <select className="input input--small" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
        {canPip ? (
          <button type="button" className="button button--small" onClick={() => void videoRef.current?.requestPictureInPicture().catch(() => undefined)}>
            {S.local.pip}
          </button>
        ) : null}
        <button type="button" className="button button--small button--ghost" onClick={onUseOfficial}>
          {S.local.useOfficial}
        </button>
      </div>

      {job && job.status !== 'idle' ? (
        <div className={job.status === 'error' ? 'notice notice--warn' : 'notice'} role="status">
          {job.status === 'done' ? `${S.local.downloadDone} ${job.quality ?? ''}p` : null}
          {downloading ? (
            <>
              {S.local.downloading} {job.quality ?? ''}p · {job.percent !== undefined ? `${Math.round(job.percent)} %` : ''} {job.speed ? `· ${formatCount(Math.round(job.speed / 1000))} kB/s` : ''}
              <progress className="local-player__progress" value={job.percent ?? 0} max={100} />
            </>
          ) : null}
          {job.status === 'error' ? `${S.local.downloadFailed} ${job.error?.message ?? ''}` : null}
        </div>
      ) : null}
      <p className="muted small">{S.local.sourceNote(source.label)}</p>
    </div>
  );
}
