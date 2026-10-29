import { routes } from '../app/router';
import { S } from '../app/strings';
import type { VideoSummary } from '../data/types';
import { formatCount, formatDuration, formatRelative } from '../data/util';
import { favorites } from '../storage/collections';
import { useSettings } from '../storage/settings';
import { Link } from './Link';

interface Props {
  video: VideoSummary;
  /** Lista a la que pertenece, para abrirlo dentro de ella. */
  list?: string | undefined;
  showSave?: boolean;
}

export function VideoCard({ video, list, showSave = true }: Props) {
  const settings = useSettings();
  const saved = favorites.useList();
  const isSaved = saved.some((s) => s.id === video.id);
  const to = routes.watch(video.id, list ? { list } : {});
  const when = video.publishedAt ? formatRelative(video.publishedAt) : (video.publishedText ?? '');
  const views = video.viewCount !== undefined ? `${formatCount(video.viewCount)} ${S.video.views}` : '';
  const meta = [views, when].filter(Boolean).join(' · ');

  return (
    <article className="card">
      <Link to={to} className="card__thumb" aria-hidden="true" tabIndex={-1}>
        {settings.thumbnails === 'show' && video.thumbnailUrl ? (
          <img src={video.thumbnailUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" width={320} height={180} />
        ) : (
          <span className="card__thumb-empty" />
        )}
        {video.isLive ? (
          <span className="card__badge card__badge--live">{S.video.live}</span>
        ) : video.durationSeconds ? (
          <span className="card__badge">{formatDuration(video.durationSeconds)}</span>
        ) : null}
      </Link>
      <div className="card__body">
        <h3 className="card__title">
          <Link to={to}>{video.title}</Link>
        </h3>
        <p className="card__meta">
          {video.channelId ? <Link to={routes.channel(video.channelId)}>{video.channelTitle}</Link> : <span>{video.channelTitle}</span>}
          {meta ? <span className="muted"> · {meta}</span> : null}
        </p>
        {showSave ? (
          <button
            type="button"
            className={isSaved ? 'button button--small button--active' : 'button button--small'}
            onClick={() => favorites.toggle(video)}
            aria-pressed={isSaved}
          >
            {isSaved ? S.video.saved : S.video.save}
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function VideoList({ videos, list }: { videos: VideoSummary[]; list?: string | undefined }) {
  return (
    <div className="grid">
      {videos.map((v) => (
        <VideoCard key={v.id} video={v} list={list} />
      ))}
    </div>
  );
}
