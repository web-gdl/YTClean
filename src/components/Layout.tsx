import type { ReactNode } from 'react';
import { routes, useRoute } from '../app/router';
import { S } from '../app/strings';
import { Link } from './Link';
import { SearchBox } from './SearchBox';

export function Layout({ children }: { children: ReactNode }) {
  const route = useRoute();
  const q = route.name === 'search' ? (route.query.get('q') ?? '') : '';
  const nav: { to: string; label: string; active: boolean }[] = [
    { to: routes.home(), label: S.nav.home, active: route.name === 'home' },
    { to: routes.saved(), label: S.nav.saved, active: route.name === 'saved' },
    { to: routes.settings(), label: S.nav.settings, active: route.name === 'settings' },
    { to: routes.privacy(), label: S.nav.privacy, active: route.name === 'privacy' },
  ];

  return (
    <>
      <a className="skip-link" href="#main">
        {S.skipToContent}
      </a>
      <header className="header">
        <div className="header__inner">
          <Link to={routes.home()} className="brand" aria-label={S.appName}>
            <svg viewBox="0 0 64 64" width="24" height="24" aria-hidden="true">
              <rect x="4" y="12" width="56" height="40" rx="10" fill="currentColor" />
              <path d="M27 22v20l16-10z" fill="var(--bg)" />
            </svg>
            <span>{S.appName}</span>
          </Link>
          {route.name !== 'home' ? <SearchBox key={q} initialQuery={q} compact /> : null}
          <nav className="nav" aria-label="Principal">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} className={n.active ? 'nav__link nav__link--active' : 'nav__link'} aria-current={n.active ? 'page' : undefined}>
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main id="main" className="main" tabIndex={-1}>
        {children}
      </main>
      <footer className="footer">
        <p className="muted">{S.footer.disclaimer}</p>
      </footer>
    </>
  );
}
