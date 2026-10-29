import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildUrl, fetchJson, HttpError, normalizeInstanceUrl } from '../src/data/http';

function mockFetch(status: number, body: string, headers: Record<string, string> = { 'content-type': 'application/json' }) {
  const fn = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(new Response(body, { status, headers })));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchJson', () => {
  it('envía la petición sin credenciales ni referrer y devuelve JSON', async () => {
    const fn = mockFetch(200, '{"ok":true}');
    await expect(fetchJson('https://api.ejemplo.org/x')).resolves.toEqual({ ok: true });
    const init = fn.mock.calls[0]?.[1];
    expect(init?.credentials).toBe('omit');
    expect(init?.referrerPolicy).toBe('no-referrer');
    expect(init?.method).toBe('GET');
  });
  it('lanza HttpError con el cuerpo analizado en errores HTTP', async () => {
    mockFetch(403, '{"error":{"message":"quota"}}');
    await expect(fetchJson('https://api.ejemplo.org/x')).rejects.toMatchObject({ name: 'HttpError', status: 403, body: { error: { message: 'quota' } } });
    expect(new HttpError(500, null).message).toBe('HTTP 500');
  });
  it('respeta la señal de cancelación externa', async () => {
    const fn = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('cancelado', 'AbortError')));
    }));
    vi.stubGlobal('fetch', fn);
    const controller = new AbortController();
    const p = fetchJson('https://api.ejemplo.org/x', { signal: controller.signal });
    controller.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('buildUrl / normalizeInstanceUrl', () => {
  it('omite parámetros vacíos', () => {
    expect(buildUrl('https://api.ejemplo.org/v', { a: '1', b: undefined, c: '', d: 2 })).toBe('https://api.ejemplo.org/v?a=1&d=2');
  });
  it('normaliza instancias y rechaza las inseguras', () => {
    expect(normalizeInstanceUrl(' https://inv.ejemplo.org/ ')).toBe('https://inv.ejemplo.org');
    expect(normalizeInstanceUrl('https://inv.ejemplo.org/api/')).toBe('https://inv.ejemplo.org/api');
    expect(normalizeInstanceUrl('http://inv.ejemplo.org')).toBeNull();
    expect(normalizeInstanceUrl('https://user:pass@inv.ejemplo.org')).toBeNull();
    expect(normalizeInstanceUrl('inv.ejemplo.org')).toBeNull();
  });
});
