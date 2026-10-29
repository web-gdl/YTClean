import { useCallback, useEffect, useState } from 'react';
import { toProviderError, type ProviderError } from '../data/types';

export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: ProviderError };

type Key = readonly unknown[];

function sameKey(a: Key, b: Key): boolean {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}

/**
 * Ejecuta una función asíncrona ligada a dependencias y cancela la petición
 * anterior (AbortSignal) cuando cambian o al desmontar. Con fn = null queda
 * inactivo. El estado "cargando" se deriva de que el último resultado no
 * corresponde a las dependencias actuales, sin escribir estado dentro del efecto.
 */
export function useAsync<T>(fn: ((signal: AbortSignal) => Promise<T>) | null, deps: Key): { state: AsyncState<T>; reload: () => void } {
  const [tick, setTick] = useState(0);
  const key: Key = [...deps, tick];
  const [result, setResult] = useState<{ key: Key; state: AsyncState<T> } | null>(null);

  useEffect(() => {
    if (!fn) return;
    const controller = new AbortController();
    fn(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setResult({ key, state: { status: 'success', data } });
      },
      (e: unknown) => {
        if (!controller.signal.aborted) setResult({ key, state: { status: 'error', error: toProviderError(e) } });
      },
    );
    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, key);

  const reload = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  if (!fn) return { state: { status: 'idle' }, reload };
  const state: AsyncState<T> = result && sameKey(result.key, key) ? result.state : { status: 'loading' };
  return { state, reload };
}

export interface PagedList<T> {
  items: T[];
  status: 'idle' | 'loading' | 'loading-more' | 'success' | 'error';
  error: ProviderError | null;
  hasMore: boolean;
  loadMore: () => void;
  reload: () => void;
}

/** Lista paginada: acumula páginas con "cargar más" y se reinicia al cambiar deps. */
export function usePagedList<T extends { id: string }>(
  fn: ((page: string | undefined, signal: AbortSignal) => Promise<{ items: T[]; nextPage?: string | undefined }>) | null,
  deps: Key,
): PagedList<T> {
  const [tick, setTick] = useState(0);
  const key: Key = [...deps, tick];
  const [result, setResult] = useState<{ key: Key; items: T[]; nextPage: string | undefined; error: ProviderError | null } | null>(null);
  const [pendingPage, setPendingPage] = useState<{ key: Key; page: string } | null>(null);

  // Primera página.
  useEffect(() => {
    if (!fn) return;
    const controller = new AbortController();
    fn(undefined, controller.signal).then(
      (page) => {
        if (!controller.signal.aborted) {
          const seen = new Set<string>();
          const items = page.items.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
          setResult({ key, items, nextPage: page.nextPage, error: null });
        }
      },
      (e: unknown) => {
        if (!controller.signal.aborted) setResult({ key, items: [], nextPage: undefined, error: toProviderError(e) });
      },
    );
    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, key);

  // Páginas siguientes (pendingPage lo fija el botón "cargar más").
  useEffect(() => {
    if (!fn || !pendingPage) return;
    const controller = new AbortController();
    const { page, key: pageKey } = pendingPage;
    fn(page, controller.signal).then(
      (res) => {
        if (controller.signal.aborted) return;
        setResult((prev) => {
          if (!prev || !sameKey(prev.key, pageKey)) return prev;
          const seen = new Set(prev.items.map((x) => x.id));
          return { ...prev, items: [...prev.items, ...res.items.filter((x) => !seen.has(x.id))], nextPage: res.nextPage, error: null };
        });
        setPendingPage(null);
      },
      (e: unknown) => {
        if (controller.signal.aborted) return;
        setResult((prev) => (prev && sameKey(prev.key, pageKey) ? { ...prev, error: toProviderError(e) } : prev));
        setPendingPage(null);
      },
    );
    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPage]);

  const current = result && sameKey(result.key, key) ? result : null;
  const nextPage = current?.nextPage;
  const loadingMore = pendingPage !== null && sameKey(pendingPage.key, key);

  const loadMore = () => {
    if (nextPage && !loadingMore) setPendingPage({ key, page: nextPage });
  };
  const reload = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  if (!fn) return { items: [], status: 'idle', error: null, hasMore: false, loadMore, reload };
  if (!current) return { items: [], status: 'loading', error: null, hasMore: false, loadMore, reload };
  return {
    items: current.items,
    status: loadingMore ? 'loading-more' : current.error ? 'error' : 'success',
    error: current.error,
    hasMore: Boolean(nextPage),
    loadMore,
    reload,
  };
}
