import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalClient, LocalProvider, localBase } from '../src/data/providers/local';

function mockFetch(route: (url: URL, init?: RequestInit) => { status?: number; body: unknown }) {
  const calls: { url: URL; init: RequestInit | undefined }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push({ url, init });
      const res = route(url, init);
      return Promise.resolve(new Response(JSON.stringify(res.body), { status: res.status ?? 200, headers: { 'content-type': 'application/json' } }));
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LocalProvider', () => {
  it('usa el mismo origen por defecto y envía la cabecera X-YC-Local', async () => {
    expect(localBase('')).toBe(window.location.origin);
    expect(localBase('http://127.0.0.1:8787/')).toBe('http://127.0.0.1:8787');
    const calls = mockFetch(() => ({ body: { items: [{ id: 'dQw4w9WgXcQ', title: 'T', channelTitle: 'C', thumbnailUrl: '/local/thumb/dQw4w9WgXcQ', durationSeconds: 10 }], nextPage: '20' } }));
    const p = new LocalProvider('http://127.0.0.1:8787');
    const page = await p.searchVideos('gatos');
    expect(calls[0]?.url.toString()).toBe('http://127.0.0.1:8787/local/search?q=gatos');
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers['X-YC-Local']).toBe('1');
    expect(calls[0]?.init?.credentials).toBe('omit');
    expect(page.items[0]?.thumbnailUrl).toBe('http://127.0.0.1:8787/local/thumb/dQw4w9WgXcQ');
    expect(page.nextPage).toBe('20');
    expect(p.hosts).toEqual(['127.0.0.1:8787']);
  });

  it('resuelve flujos con URL absolutas y mapea los trabajos de descarga', async () => {
    mockFetch(() => ({
      body: {
        video: { id: 'dQw4w9WgXcQ', title: 'T', channelTitle: 'C', captionsAvailable: true, embeddable: true },
        progressive: [{ formatId: '18', label: '360p', ext: 'mp4', height: 360, url: '/local/stream/dQw4w9WgXcQ/18' }],
        audio: [{ formatId: '140', label: 'AAC 129 kb/s', ext: 'm4a', abr: 129, url: '/local/stream/dQw4w9WgXcQ/140' }],
        hq: [{ quality: 1080, label: '1080p', available: true }],
        cached: { quality: 720, bytes: 123, url: '/local/file/dQw4w9WgXcQ' },
        job: { id: 'dQw4w9WgXcQ', status: 'running', percent: 42.5, quality: 1080 },
        subtitles: [{ lang: 'es', name: 'Spanish', auto: false, url: '/local/subs/dQw4w9WgXcQ/es' }],
      },
    }));
    const r = await new LocalClient('').resolve('dQw4w9WgXcQ');
    expect(r.progressive[0]?.url).toBe(`${window.location.origin}/local/stream/dQw4w9WgXcQ/18`);
    expect(r.audio[0]?.abr).toBe(129);
    expect(r.cached).toEqual({ quality: 720, bytes: 123, url: `${window.location.origin}/local/file/dQw4w9WgXcQ` });
    expect(r.job).toMatchObject({ status: 'running', percent: 42.5 });
    expect(r.subtitles[0]?.url).toBe(`${window.location.origin}/local/subs/dQw4w9WgXcQ/es`);
  });

  it('traduce los errores del servicio', async () => {
    mockFetch(() => ({ status: 403, body: { error: 'live', message: 'Directo' } }));
    await expect(new LocalClient('').resolve('dQw4w9WgXcQ')).rejects.toMatchObject({ code: 'unavailable', message: 'Directo' });
    mockFetch(() => ({ status: 404, body: 'not here' }));
    await expect(new LocalProvider('').searchVideos('x')).rejects.toMatchObject({ code: 'not-configured' });
    mockFetch(() => ({ status: 404, body: { error: 'not-found', message: 'No' } }));
    await expect(new LocalProvider('').getVideo('dQw4w9WgXcQ')).rejects.toMatchObject({ code: 'not-found' });
  });
});
