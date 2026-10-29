import { useState, type SubmitEvent } from 'react';
import { navigate, routes } from '../app/router';
import { S } from '../app/strings';
import { parseYouTubeInput } from '../data/util';
import { SearchBox } from '../components/SearchBox';
import { Link } from '../components/Link';
import { useSettings } from '../storage/settings';

export function HomePage() {
  const settings = useSettings();
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState('');

  const openLink = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = parseYouTubeInput(link);
    if (!parsed) {
      setLinkError(S.home.invalidLink);
      return;
    }
    setLinkError('');
    if (parsed.kind === 'video') navigate(routes.watch(parsed.id, { ...(parsed.start ? { start: parsed.start } : {}), ...(parsed.list ? { list: parsed.list } : {}) }));
    else if (parsed.kind === 'playlist') navigate(settings.provider === 'none' ? routes.watchPlaylist(parsed.id) : routes.playlist(parsed.id));
    else if (parsed.kind === 'channel') navigate(routes.channel(parsed.id));
    else navigate(routes.channel(`@${parsed.handle}`));
  };

  return (
    <div className="page page--home">
      <section className="hero">
        <h1 className="hero__title">{S.home.title}</h1>
        <p className="hero__intro">{S.home.intro}</p>
        <SearchBox autoFocus />
        {settings.provider === 'none' ? (
          <p className="notice">
            {S.search.noProvider} <Link to={routes.settings()}>{S.search.noProviderAction}</Link>
          </p>
        ) : null}
      </section>

      <section className="panel">
        <h2 className="panel__title">{S.home.directLink}</h2>
        <form className="search" onSubmit={openLink}>
          <label className="visually-hidden" htmlFor="direct-link">
            {S.home.directLink}
          </label>
          <input
            id="direct-link"
            className="search__input"
            type="text"
            inputMode="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" className="button search__button">
            {S.home.directLinkButton}
          </button>
        </form>
        {linkError ? (
          <p className="status status--error" role="alert">
            {linkError}
          </p>
        ) : null}
      </section>

      <section className="panel">
        <h2 className="panel__title">{S.home.howItWorks}</h2>
        <ul className="list">
          {S.home.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
