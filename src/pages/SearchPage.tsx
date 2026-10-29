import { useMemo } from 'react';
import { useRoute } from '../app/router';
import { S } from '../app/strings';
import { Empty, ErrorBox, Loading } from '../components/Status';
import { VideoList } from '../components/VideoCard';
import { createProvider } from '../data/registry';
import { ProviderError } from '../data/types';
import { usePagedList } from '../hooks/useAsync';
import { useSettings } from '../storage/settings';

export function SearchPage() {
  const route = useRoute();
  const settings = useSettings();
  const q = (route.query.get('q') ?? '').trim();
  const provider = useMemo(() => createProvider(settings), [settings]);

  const list = usePagedList(
    q ? (page, signal) => {
      if (!provider) return Promise.reject(new ProviderError('not-configured', S.search.noProvider));
      return provider.searchVideos(q, page ? { page, signal } : { signal });
    } : null,
    [q, provider],
  );

  return (
    <div className="page">
      <h1 className="page__title">{q ? S.search.resultsFor(q) : S.search.query}</h1>
      {list.status === 'loading' ? <Loading text={S.search.loading} /> : null}
      {list.status === 'error' && list.items.length === 0 && list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : null}
      {list.status === 'success' && list.items.length === 0 ? <Empty text={S.search.empty} /> : null}
      {list.items.length > 0 ? <VideoList videos={list.items} /> : null}
      {list.status === 'error' && list.items.length > 0 && list.error ? <ErrorBox error={list.error} onRetry={list.loadMore} /> : null}
      {list.hasMore && list.status !== 'loading' ? (
        <p className="center">
          <button type="button" className="button" onClick={list.loadMore} disabled={list.status === 'loading-more'}>
            {list.status === 'loading-more' ? S.status.loading : S.search.loadMore}
          </button>
        </p>
      ) : null}
    </div>
  );
}
