import { useEffect } from 'react';
import { useRoute } from './app/router';
import { S } from './app/strings';
import { Layout } from './components/Layout';
import { ChannelPage } from './pages/ChannelPage';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PlaylistPage } from './pages/PlaylistPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { SavedPage } from './pages/SavedPage';
import { SearchPage } from './pages/SearchPage';
import { SettingsPage } from './pages/SettingsPage';
import { WatchPage, WatchPlaylistPage } from './pages/WatchPage';

const titles: Partial<Record<string, string>> = {
  home: S.appName,
  search: `${S.search.query} · ${S.appName}`,
  saved: `${S.nav.saved} · ${S.appName}`,
  settings: `${S.nav.settings} · ${S.appName}`,
  privacy: `${S.nav.privacy} · ${S.appName}`,
  'not-found': `${S.notFound.title} · ${S.appName}`,
};

export function App() {
  const route = useRoute();

  useEffect(() => {
    document.title = titles[route.name] ?? S.appName;
  }, [route]);

  let page;
  switch (route.name) {
    case 'home':
      page = <HomePage />;
      break;
    case 'search':
      page = <SearchPage />;
      break;
    case 'watch':
      page = <WatchPage />;
      break;
    case 'watch-playlist':
      page = <WatchPlaylistPage />;
      break;
    case 'channel':
      page = <ChannelPage />;
      break;
    case 'playlist':
      page = <PlaylistPage />;
      break;
    case 'saved':
      page = <SavedPage />;
      break;
    case 'settings':
      page = <SettingsPage />;
      break;
    case 'privacy':
      page = <PrivacyPage />;
      break;
    case 'not-found':
      page = <NotFoundPage />;
      break;
  }
  return <Layout>{page}</Layout>;
}
