import { S } from '../app/strings';
import { Empty } from '../components/Status';
import { VideoList } from '../components/VideoCard';
import type { VideoSummary } from '../data/types';
import { favorites, watchHistory, type SavedVideo } from '../storage/collections';
import { useSettings } from '../storage/settings';

function toSummary(s: SavedVideo): VideoSummary {
  const v: VideoSummary = { id: s.id, title: s.title, channelTitle: s.channelTitle };
  if (s.channelId) v.channelId = s.channelId;
  if (s.thumbnailUrl) v.thumbnailUrl = s.thumbnailUrl;
  if (s.durationSeconds !== undefined) v.durationSeconds = s.durationSeconds;
  return v;
}

export function SavedPage() {
  const saved = favorites.useList();
  const history = watchHistory.useList();
  const settings = useSettings();

  const confirmAnd = (fn: () => void) => () => {
    if (window.confirm(S.saved.confirmClear)) fn();
  };

  return (
    <div className="page">
      <h1 className="page__title">{S.saved.title}</h1>
      <p className="muted">{S.saved.intro}</p>
      {saved.length === 0 ? (
        <Empty text={S.saved.empty} />
      ) : (
        <>
          <VideoList videos={saved.map(toSummary)} />
          <p className="center">
            <button type="button" className="button button--ghost" onClick={confirmAnd(favorites.clear)}>
              {S.saved.clearSaved}
            </button>
          </p>
        </>
      )}

      <h2 className="section__title">{S.saved.history}</h2>
      {!settings.keepHistory ? <p className="muted">{S.saved.historyOff}</p> : null}
      {history.length === 0 ? (
        settings.keepHistory ? <Empty text={S.saved.historyEmpty} /> : null
      ) : (
        <>
          <VideoList videos={history.map(toSummary)} />
          <p className="center">
            <button type="button" className="button button--ghost" onClick={confirmAnd(watchHistory.clear)}>
              {S.saved.clearHistory}
            </button>
          </p>
        </>
      )}
    </div>
  );
}
