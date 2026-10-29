import { useMemo } from 'react';
import { routes, useRoute } from '../app/router';
import { S } from '../app/strings';
import { ExternalLink, Link } from '../components/Link';
import { Empty, ErrorBox, Loading } from '../components/Status';
import { VideoList } from '../components/VideoCard';
import { createProvider } from '../data/registry';
import { ProviderError, type PlaylistInfo, type VideoSummary } from '../data/types';
import { formatCount, youtubePlaylistUrl } from '../data/util';
import { useAsync, usePagedList } from '../hooks/useAsync';
import { useSettings } from '../storage/settings';
import { NotFoundPage } from './NotFoundPage';

export function PlaylistPage() {
  const route = useRoute();
  const settings = useSettings();
  const provider = useMemo(() => createProvider(settings), [settings]);
  const id = route.params.id ?? '';

  const info = useAsync<PlaylistInfo>(
    id
      ? (signal) => {
          if (!provider) return Promise.reject(new ProviderError('not-configured', S.search.noProvider));
          return provider.getPlaylist(id, { signal });
        }
      : null,
    [id, provider],
  );
  const items = usePagedList<VideoSummary>(provider && id ? (page, signal) => provider.getPlaylistItems(id, page ? { page, signal } : { signal }) : null, [id, provider]);

  if (!id) return <NotFoundPage />;
  const first = items.items[0];

  return (
    <div className="page">
      {info.state.status === 'loading' ? <Loading /> : null}
      {info.state.status === 'error' ? <ErrorBox error={info.state.error} onRetry={info.reload} /> : null}
      {info.state.status === 'success' ? (
        <header className="playlist-header">
          <h1 className="page__title">{info.state.data.title}</h1>
          <p className="muted">
            {info.state.data.channelId ? <Link to={routes.channel(info.state.data.channelId)}>{info.state.data.channelTitle}</Link> : info.state.data.channelTitle}
            {info.state.data.itemCount !== undefined ? ` · ${formatCount(info.state.data.itemCount)} ${S.playlist.items}` : null}
          </p>
          {info.state.data.description ? <p>{info.state.data.description}</p> : null}
        </header>
      ) : null}

      <div className="watch__actions">
        <Link className="button button--primary" to={first ? routes.watch(first.id, { list: id }) : routes.watchPlaylist(id)}>
          {S.playlist.playAll}
        </Link>
        <ExternalLink className="button button--ghost" href={youtubePlaylistUrl(id)}>
          {S.video.openOnYouTube}
        </ExternalLink>
      </div>

      {items.status === 'loading' ? <Loading /> : null}
      {items.status === 'error' && items.items.length === 0 && items.error && info.state.status !== 'error' ? <ErrorBox error={items.error} onRetry={items.reload} /> : null}
      {items.status === 'success' && items.items.length === 0 ? <Empty text={S.playlist.empty} /> : null}
      {items.items.length ? <VideoList videos={items.items} list={id} /> : null}
      {items.hasMore && items.status !== 'loading' ? (
        <p className="center">
          <button type="button" className="button" onClick={items.loadMore} disabled={items.status === 'loading-more'}>
            {items.status === 'loading-more' ? S.status.loading : S.playlist.loadMore}
          </button>
        </p>
      ) : null}
    </div>
  );
}
