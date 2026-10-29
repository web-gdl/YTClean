// Enrutador mínimo basado en el historial del navegador. Evita una dependencia
// externa y mantiene las URL legibles: /buscar?q=…, /ver/ID, /canal/ID, /lista/ID.
import { useSyncExternalStore } from 'react';

export type RouteName =
  | 'home'
  | 'search'
  | 'watch'
  | 'watch-playlist'
  | 'channel'
  | 'playlist'
  | 'saved'
  | 'settings'
  | 'privacy'
  | 'not-found';

export interface Route {
  name: RouteName;
  params: Readonly<Record<string, string>>;
  query: URLSearchParams;
  /** Ruta interna sin la base, p. ej. "/ver/abc". */
  path: string;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, ''); // "" o "/subruta"

const patterns: { name: RouteName; re: RegExp; keys: string[] }[] = [
  { name: 'home', re: /^\/?$/, keys: [] },
  { name: 'search', re: /^\/buscar\/?$/, keys: [] },
  { name: 'watch-playlist', re: /^\/ver\/lista\/([^/]+)\/?$/, keys: ['id'] },
  { name: 'watch', re: /^\/ver\/([^/]+)\/?$/, keys: ['id'] },
  { name: 'channel', re: /^\/canal\/([^/]+)\/?$/, keys: ['id'] },
  { name: 'playlist', re: /^\/lista\/([^/]+)\/?$/, keys: ['id'] },
  { name: 'saved', re: /^\/guardados\/?$/, keys: [] },
  { name: 'settings', re: /^\/ajustes\/?$/, keys: [] },
  { name: 'privacy', re: /^\/privacidad\/?$/, keys: [] },
];

export function stripBase(pathname: string): string {
  if (BASE && pathname.startsWith(BASE)) return pathname.slice(BASE.length) || '/';
  return pathname;
}

export function parseRoute(pathname: string, search: string): Route {
  const path = stripBase(pathname);
  const query = new URLSearchParams(search);
  for (const p of patterns) {
    const m = p.re.exec(path);
    if (!m) continue;
    const params: Record<string, string> = {};
    p.keys.forEach((k, i) => {
      try {
        params[k] = decodeURIComponent(m[i + 1] ?? '');
      } catch {
        params[k] = '';
      }
    });
    return { name: p.name, params, query, path };
  }
  return { name: 'not-found', params: {}, query, path };
}

/** Convierte una ruta interna en un href completo (con la base). */
export function href(path: string): string {
  return `${BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

export const routes = {
  home: () => '/',
  search: (q: string) => `/buscar?q=${encodeURIComponent(q)}`,
  watch: (id: string, opts?: { start?: number; list?: string }) => {
    const q = new URLSearchParams();
    if (opts?.start) q.set('t', String(opts.start));
    if (opts?.list) q.set('list', opts.list);
    const s = q.toString();
    return `/ver/${encodeURIComponent(id)}${s ? `?${s}` : ''}`;
  },
  watchPlaylist: (listId: string) => `/ver/lista/${encodeURIComponent(listId)}`,
  channel: (id: string) => `/canal/${encodeURIComponent(id)}`,
  playlist: (id: string) => `/lista/${encodeURIComponent(id)}`,
  saved: () => '/guardados',
  settings: () => '/ajustes',
  privacy: () => '/privacidad',
};

const listeners = new Set<() => void>();
let snapshot: Route = typeof window === 'undefined' ? parseRoute('/', '') : parseRoute(window.location.pathname, window.location.search);

function refresh() {
  snapshot = parseRoute(window.location.pathname, window.location.search);
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', refresh);
}

export function navigate(path: string, opts: { replace?: boolean } = {}): void {
  const url = href(path);
  if (opts.replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
  refresh();
  window.scrollTo({ top: 0 });
  document.getElementById('main')?.focus({ preventScroll: true });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

/** Para pruebas: fuerza una ruta sin tocar window.history. */
export function _resetRouteForTests(): void {
  refresh();
}
