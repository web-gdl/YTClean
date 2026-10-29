import { S } from '../app/strings';
import { Empty } from '../components/Status';
import { VideoList } from '../components/VideoCard';
import type { VideoSummary } from '../data/types';
import { favorites, watchHistory, type SavedVideo } from '../storage/collections';
import { useSettings, type Settings } from '../storage/settings';
import { youtubeThumbnail } from '../data/util';
import { localBase } from '../data/providers/local';

function toSummary(s: SavedVideo): VideoSummary {
  const v: VideoSummary = { id: s.id, title: s.title, channelTitle: s.channelTitle };
  if (s.channelId) v.channelId = s.channelId;
  if (s.durationSeconds !== undefined) v.durationSeconds = s.durationSeconds;
  return v;
}

function thumbFor(id: string, settings: Settings): string | undefined {
  // La miniatura se calcula con la fuente actual: nunca se contacta con una fuente que ya no usas.
  switch (settings.provider) {
    case 'none':
    case 'youtube-data-api':
      return youtubeThumbnail(id);
    case 'invidious':
      return settings.invidiousInstance ? `${settings.invidiousInstance}/vi/${id}/mqdefault.jpg` : undefined;
    case 'local':
      return `${localBase(settings.localServiceUrl)}/local/thumb/${id}`;
    case 'piped':
      return undefined;
  }
}

function withThumb(v: VideoSummary, settings: Settings): VideoSummary {
  const t = thumbFor(v.id, settings);
  if (t) v.thumbnailUrl = t;
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
          <VideoList videos={saved.map((x) => withThumb(toSummary(x), settings))} />
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
          <VideoList videos={history.map((x) => withThumb(toSummary(x), settings))} />
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
