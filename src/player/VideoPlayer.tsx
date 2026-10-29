// Fachada del reproductor: hasta que el usuario pulsa ▶ no se carga nada de
// YouTube. Después se inserta el reproductor oficial (youtube-nocookie.com) en
// un iframe con sandbox y permisos mínimos.
import { useState } from 'react';
import { S } from '../app/strings';
import { useSettings } from '../storage/settings';
import { buildEmbedUrl, IFRAME_ALLOW, IFRAME_SANDBOX } from './embedUrl';

interface Props {
  videoId: string | null;
  title: string;
  start?: number | undefined;
  list?: string | undefined;
  thumbnailUrl?: string | undefined;
  /** Mensaje que sustituye a la fachada (vídeo no insertable, privado…). */
  blockedMessage?: string | undefined;
}

export function VideoPlayer({ videoId, title, start, list, thumbnailUrl, blockedMessage }: Props) {
  const settings = useSettings();
  // La activación se guarda ligada al vídeo/lista: al cambiar de vídeo vuelve
  // a la fachada sin necesidad de un efecto.
  const key = `${videoId ?? ''}|${list ?? ''}`;
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const active = activeKey === key;
  const setActive = (on: boolean) => setActiveKey(on ? key : null);

  if (blockedMessage) {
    return (
      <div className="player player--blocked" role="status">
        <p>{blockedMessage}</p>
      </div>
    );
  }

  if (active) {
    const src = buildEmbedUrl(videoId, {
      autoplay: true,
      captions: settings.captions,
      language: settings.playerLanguage,
      ...(start !== undefined ? { start } : {}),
      ...(list ? { list } : {}),
    });
    return (
      <div className="player">
        <iframe
          className="player__frame"
          src={src}
          title={title}
          allow={IFRAME_ALLOW}
          sandbox={IFRAME_SANDBOX}
          referrerPolicy="strict-origin-when-cross-origin"
          loading="eager"
          allowFullScreen
        />
      </div>
    );
  }

  const showThumb = settings.thumbnails === 'show' && thumbnailUrl;
  return (
    <div className="player">
      <button
        type="button"
        className="player__facade"
        onClick={() => setActive(true)}
        aria-label={S.video.playAria(title)}
      >
        {showThumb ? (
          <img className="player__poster" src={thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <span className="player__poster player__poster--empty" aria-hidden="true" />
        )}
        <span className="player__play" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
          <span>{S.video.play}</span>
        </span>
        <span className="player__note">{S.video.facadeNoteShort}</span>
      </button>
    </div>
  );
}
