// Única puerta de salida HTTP de la aplicación. Toda petición:
//  - se hace sin credenciales (ni cookies ni cabeceras de autenticación),
//  - no envía referrer,
//  - tiene un tiempo máximo,
//  - y devuelve JSON ya analizado o un ProviderError con el código HTTP.
import { ProviderError } from './types';

export interface HttpOptions {
  signal?: AbortSignal | undefined;
  timeoutMs?: number | undefined;
  method?: 'GET' | 'POST' | 'DELETE' | undefined;
  headers?: Record<string, string> | undefined;
}

export class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown) {
    super(`HTTP ${status}`);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
  }
}

export async function fetchJson(url: string, opts: HttpOptions = {}): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15000);
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      mode: 'cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'follow',
      cache: 'default',
      headers: { Accept: 'application/json', ...(opts.headers ?? {}) },
      signal: controller.signal,
    });
    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    if (!res.ok) throw new HttpError(res.status, body);
    return body;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    if (controller.signal.aborted && !opts.signal?.aborted) {
      throw new ProviderError('network', 'Tiempo de espera agotado');
    }
    throw e;
  } finally {
    clearTimeout(timeout);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}

/** Construye una URL con parámetros de consulta, omitiendo los vacíos. */
export function buildUrl(base: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '') continue;
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

/** Normaliza la URL de una instancia escrita por el usuario. */
export function normalizeInstanceUrl(input: string): string | null {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (!/^https:\/\/[^\s/]+(\/[^\s]*)?$/i.test(trimmed)) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    return u.origin + u.pathname.replace(/\/+$/, '');
  } catch {
    return null;
  }
}
