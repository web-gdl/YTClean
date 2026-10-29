import { useEffect, useMemo, useState } from 'react';
import { routes, useRoute } from '../app/router';
import { S } from '../app/strings';
import { ExternalLink, Link } from '../components/Link';
import { ErrorBox, Loading } from '../components/Status';
import { VideoCard } from '../components/VideoCard';
import { createProvider } from '../data/registry';
import type { VideoDetails, VideoSummary } from '../data/types';
import {
  VIDEO_ID_RE,
  formatCount,
  formatDate,
  formatDuration,
  parseTimestamp,
  youtubePlaylistUrl,
  youtubeThumbnail,
  youtubeWatchUrl,
} from '../data/util';
import { useAsync, usePagedList } from '../hooks/useAsync';
import { LocalPlayer } from '../player/LocalPlayer';
import { VideoPlayer } from '../player/VideoPlayer';
import { favorites, watchHistory } from '../storage/collections';
import { useSettings } from '../storage/settings';
import { NotFoundPage } from './NotFoundPage';

export function WatchPage() {
  const route = useRoute();
  const settings = useSettings();
  const provider = useMemo(() => createProvider(settings), [settings]);
  const id = route.params.id ?? '';
  const start = parseTimestamp(route.query.get('t'));
  const list = route.query.get('list') ?? undefined;
  // Abierta o cerrada por vídeo: al cambiar de vídeo vuelve a cerrada.
  const [descriptionOpenFor, setDescriptionOpenFor] = useState<string | null>(null);
  // Reproductor elegido para este vídeo (permite cambiar entre local y oficial sin tocar los ajustes).
  const [playerFor, setPlayerFor] = useState<{ id: string; mode: 'official' | 'local' } | null>(null);
  const playerMode = playerFor?.id === id ? playerFor.mode : settings.playerMode;
  // Metadatos obtenidos por el reproductor local (útiles cuando no hay fuente de datos).
  const [localInfo, setLocalInfo] = useState<VideoDetails | null>(null);

  const details = useAsync<VideoDetails>(provider && VIDEO_ID_RE.test(id) ? (signal) => provider.getVideo(id, { signal }) : null, [id, provider]);

  const items = usePagedList<VideoSummary>(
    provider && list ? (page, signal) => provider.getPlaylistItems(list, page ? { page, signal } : { signal }) : null,
    [list, provider],
  );

  const video: VideoDetails | null = details.state.status === 'success' ? details.state.data : localInfo?.id === id ? localInfo : null;
  const saved = favorites.useList();
  const isSaved = saved.some((s) => s.id === id);

  useEffect(() => {
    if (video) watchHistory.record(video);
  }, [video]);

  if (!VIDEO_ID_RE.test(id)) return <NotFoundPage />;
  const showDescription = descriptionOpenFor === id;

  const title = video?.title ?? S.video.untitled;
  const blocked = video
    ? video.privacy === 'private'
      ? S.video.private
      : video.embeddable === false
        ? S.video.notEmbeddable
        : undefined
    : details.state.status === 'error' && details.state.error.code === 'not-found'
      ? S.video.unavailable
      : undefined;

  const summaryForSave: VideoSummary = video ?? { id, title, channelTitle: '' };

  return (
    <div className="page page--watch">
      <div className={list ? 'watch watch--with-side' : 'watch'}>
        <div className="watch__main">
          {playerMode === 'local' ? (
            <LocalPlayer
              videoId={id}
              title={title}
              start={start}
              thumbnailUrl={video?.thumbnailUrl ?? youtubeThumbnail(id)}
              onUseOfficial={() => setPlayerFor({ id, mode: 'official' })}
              onVideoInfo={setLocalInfo}
            />
          ) : (
            <VideoPlayer
              videoId={id}
              title={title}
              start={start}
              list={list}
              thumbnailUrl={video?.thumbnailUrl ?? youtubeThumbnail(id)}
              blockedMessage={blocked}
            />
          )}
          {playerMode === 'official' && settings.playerMode === 'local' ? (
            <p className="muted small">
              <button type="button" className="link-button" onClick={() => setPlayerFor({ id, mode: 'local' })}>
                {S.local.useLocal}
              </button>
            </p>
          ) : null}

          {video?.ageRestricted ? <p className="notice notice--warn">{S.video.ageRestricted}</p> : null}
          {video?.regionRestricted ? <p className="notice">{S.video.regionNote}</p> : null}

          <h1 className="watch__title">{video?.title ?? (details.state.status === 'loading' ? '…' : title)}</h1>
          {!video ? <p className="muted small">ID: {id}</p> : null}

          {details.state.status === 'loading' ? <Loading /> : null}
          {details.state.status === 'error' && details.state.error.code !== 'not-configured' && !blocked ? (
            <p className="notice notice--warn" role="status">
              {S.video.metadataFailed}
              {details.state.error.code !== 'not-found' ? (
                <>
                  {' '}
                  <button type="button" className="link-button" onClick={details.reload}>
                    {S.status.retry}
                  </button>
                </>
              ) : null}
            </p>
          ) : null}

          {video ? (
            <div className="watch__meta">
              <p>
                {video.channelId ? (
                  <Link to={routes.channel(video.channelId)} className="watch__channel">
                    {video.channelTitle}
                  </Link>
                ) : (
                  <span className="watch__channel">{video.channelTitle}</span>
                )}
                {video.viewCount !== undefined ? <span className="muted"> · {formatCount(video.viewCount)} {S.video.views}</span> : null}
                {video.publishedAt ? <span className="muted"> · {formatDate(video.publishedAt)}</span> : null}
                {video.durationSeconds ? <span className="muted"> · {formatDuration(video.durationSeconds)}</span> : null}
                {video.captionsAvailable ? <span className="muted"> · {S.video.captionsAvailable}</span> : null}
              </p>
            </div>
          ) : null}

          <div className="watch__actions">
            <button type="button" className={isSaved ? 'button button--active' : 'button'} onClick={() => favorites.toggle(summaryForSave)} aria-pressed={isSaved}>
              {isSaved ? S.video.saved : S.video.save}
            </button>
            {video?.channelId ? (
              <Link className="button" to={routes.channel(video.channelId)}>
                {S.video.moreFromChannel}
              </Link>
            ) : null}
            <CopyLinkButton url={youtubeWatchUrl(id, start)} />
            <ExternalLink className="button button--ghost" href={youtubeWatchUrl(id, start)}>
              {S.video.openOnYouTube}
            </ExternalLink>
          </div>

          {start ? <p className="muted">{S.video.startAt(formatDuration(start))}</p> : null}
          <p className="muted small">{S.video.captionsHint}</p>

          {video?.description ? (
            <section className="watch__description">
              <button type="button" className="link-button" onClick={() => setDescriptionOpenFor(showDescription ? null : id)} aria-expanded={showDescription}>
                {showDescription ? S.video.hideDescription : S.video.showDescription}
              </button>
              {showDescription ? <pre className="description">{video.description}</pre> : null}
            </section>
          ) : null}
        </div>

        {list ? (
          <aside className="watch__side" aria-label={S.playlist.title}>
            <h2 className="side__title">{S.playlist.title}</h2>
            <p className="muted small">{S.video.playlistModeNote}</p>
            {items.status === 'loading' ? <Loading /> : null}
            {items.status === 'error' && items.error ? <ErrorBox error={items.error} onRetry={items.reload} /> : null}
            {items.items.length ? (
              <ol className="side__list">
                {items.items.map((v) => (
                  <li key={v.id} className={v.id === id ? 'side__item side__item--current' : 'side__item'}>
                    <VideoCard video={v} list={list} showSave={false} />
                  </li>
                ))}
              </ol>
            ) : null}
            {items.hasMore ? (
              <button type="button" className="button button--small" onClick={items.loadMore} disabled={items.status === 'loading-more'}>
                {S.playlist.loadMore}
              </button>
            ) : null}
            <p>
              <ExternalLink className="muted small" href={youtubePlaylistUrl(list)}>
                {S.video.openOnYouTube}
              </ExternalLink>
            </p>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

/** Reproducción de una lista completa con el reproductor oficial (sin proveedor). */
export function WatchPlaylistPage() {
  const route = useRoute();
  const listId = route.params.id ?? '';
  if (!listId) return <NotFoundPage />;
  return (
    <div className="page page--watch">
      <div className="watch">
        <div className="watch__main">
          <VideoPlayer videoId={null} title={S.video.playlistMode} list={listId} />
          <h1 className="watch__title">{S.video.playlistMode}</h1>
          <p className="muted">{S.video.playlistModeNote}</p>
          <div className="watch__actions">
            <Link className="button" to={routes.playlist(listId)}>
              {S.playlist.title}
            </Link>
            <ExternalLink className="button button--ghost" href={youtubePlaylistUrl(listId)}>
              {S.video.openOnYouTube}
            </ExternalLink>
          </div>
        </div>
      </div>
    </div>
  );
}

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* portapapeles no disponible */
    }
  };
  return (
    <button type="button" className="button button--ghost" onClick={() => void copy()}>
      {copied ? S.video.linkCopied : S.video.copyLink}
    </button>
  );
}
