import { useMemo } from 'react';
import { useRoute } from '../app/router';
import { S } from '../app/strings';
import { ExternalLink } from '../components/Link';
import { Empty, ErrorBox, Loading } from '../components/Status';
import { VideoList } from '../components/VideoCard';
import { createProvider } from '../data/registry';
import { ProviderError, type ChannelInfo, type VideoSummary } from '../data/types';
import { formatCount, youtubeChannelUrl } from '../data/util';
import { useAsync, usePagedList } from '../hooks/useAsync';
import { useSettings } from '../storage/settings';
import { NotFoundPage } from './NotFoundPage';

export function ChannelPage() {
  const route = useRoute();
  const settings = useSettings();
  const provider = useMemo(() => createProvider(settings), [settings]);
  const idOrHandle = route.params.id ?? '';

  const info = useAsync<ChannelInfo>(
    idOrHandle
      ? (signal) => {
          if (!provider) return Promise.reject(new ProviderError('not-configured', S.search.noProvider));
          return provider.getChannel(idOrHandle, { signal });
        }
      : null,
    [idOrHandle, provider],
  );
  const channelId = info.state.status === 'success' ? info.state.data.id : null;

  const videos = usePagedList<VideoSummary>(
    provider && channelId ? (page, signal) => provider.getChannelVideos(channelId, page ? { page, signal } : { signal }) : null,
    [channelId, provider],
  );

  if (!idOrHandle) return <NotFoundPage />;

  return (
    <div className="page">
      {info.state.status === 'loading' ? <Loading /> : null}
      {info.state.status === 'error' ? <ErrorBox error={info.state.error} onRetry={info.reload} /> : null}
      {info.state.status === 'success' ? (
        <header className="channel">
          {settings.thumbnails === 'show' && info.state.data.thumbnailUrl ? (
            <img className="channel__avatar" src={info.state.data.thumbnailUrl} alt="" width={72} height={72} referrerPolicy="no-referrer" />
          ) : null}
          <div>
            <h1 className="page__title">{info.state.data.title}</h1>
            <p className="muted">
              {info.state.data.subscriberCount !== undefined ? `${formatCount(info.state.data.subscriberCount)} ${S.channel.subscribers}` : null}
              {info.state.data.videoCount !== undefined ? ` · ${formatCount(info.state.data.videoCount)} ${S.channel.videos.toLowerCase()}` : null}
            </p>
            {info.state.data.description ? <p className="channel__description">{info.state.data.description}</p> : null}
            <p>
              <ExternalLink className="muted small" href={youtubeChannelUrl(info.state.data.id)}>
                {S.channel.openOnYouTube}
              </ExternalLink>
            </p>
          </div>
        </header>
      ) : null}

      {channelId ? (
        <section>
          <h2 className="section__title">{S.channel.videos}</h2>
          {videos.status === 'loading' ? <Loading /> : null}
          {videos.status === 'error' && videos.items.length === 0 && videos.error ? <ErrorBox error={videos.error} onRetry={videos.reload} /> : null}
          {videos.status === 'success' && videos.items.length === 0 ? <Empty text={S.channel.empty} /> : null}
          {videos.items.length ? <VideoList videos={videos.items} /> : null}
          {videos.status === 'error' && videos.items.length > 0 && videos.error ? <ErrorBox error={videos.error} onRetry={videos.loadMore} /> : null}
          {videos.hasMore && videos.status !== 'loading' ? (
            <p className="center">
              <button type="button" className="button" onClick={videos.loadMore} disabled={videos.status === 'loading-more'}>
                {videos.status === 'loading-more' ? S.status.loading : S.channel.loadMore}
              </button>
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
