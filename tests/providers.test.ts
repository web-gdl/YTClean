import { afterEach, describe, expect, it, vi } from 'vitest';
import { InvidiousProvider } from '../src/data/providers/invidious';
import { PipedProvider } from '../src/data/providers/piped';
import { YouTubeDataApiProvider } from '../src/data/providers/youtubeDataApi';
import { createProvider } from '../src/data/registry';
import { DEFAULT_SETTINGS } from '../src/storage/settings';

type Route = (url: URL) => { status?: number; body: unknown };

/** Simula fetch con un enrutador por URL y registra las llamadas. */
function mockFetch(route: Route) {
  const calls: URL[] = [];
  const fn = vi.fn((input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(url);
    expect(init?.credentials).toBe('omit');
    // La Data API envía solo el origen (restricción de clave por sitio web); el resto, nada.
    expect(init?.referrerPolicy).toBe(url.hostname === 'www.googleapis.com' ? 'strict-origin' : 'no-referrer');
    const res = route(url);
    return Promise.resolve(new Response(JSON.stringify(res.body), { status: res.status ?? 200, headers: { 'content-type': 'application/json' } }));
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('YouTubeDataApiProvider', () => {
  const searchBody = {
    nextPageToken: 'TOKEN2',
    items: [
      {
        id: { kind: 'youtube#video', videoId: 'dQw4w9WgXcQ' },
        snippet: {
          title: 'Tom &amp; Jerry &#39;live&#39;',
          channelTitle: 'Canal &quot;X&quot;',
          channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw',
          publishedAt: '2020-01-02T03:04:05Z',
          thumbnails: { medium: { url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg' } },
          liveBroadcastContent: 'none',
        },
      },
      { id: { kind: 'youtube#channel', channelId: 'UCx' }, snippet: { title: 'no es vídeo' } },
    ],
  };
  const videosBody = {
    items: [
      {
        id: 'dQw4w9WgXcQ',
        snippet: { title: 'Tom & Jerry', channelTitle: 'Canal', channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw', description: 'desc', publishedAt: '2020-01-02T03:04:05Z', thumbnails: {} },
        contentDetails: { duration: 'PT4M13S', caption: 'true', regionRestriction: { blocked: ['DE'] }, contentRating: { ytRating: 'ytAgeRestricted' } },
        statistics: { viewCount: '12345' },
        status: { embeddable: false, privacyStatus: 'public' },
      },
    ],
  };

  it('busca con la clave, decodifica entidades y completa duración y vistas', async () => {
    const calls = mockFetch((url) => (url.pathname.endsWith('/search') ? { body: searchBody } : { body: videosBody }));
    const p = new YouTubeDataApiProvider('CLAVE');
    const page = await p.searchVideos('gatos');
    expect(calls[0]?.hostname).toBe('www.googleapis.com');
    expect(calls[0]?.searchParams.get('key')).toBe('CLAVE');
    expect(calls[0]?.searchParams.get('type')).toBe('video');
    expect(calls[0]?.searchParams.get('q')).toBe('gatos');
    expect(calls[1]?.pathname).toBe('/youtube/v3/videos');
    expect(page.nextPage).toBe('TOKEN2');
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({
      id: 'dQw4w9WgXcQ',
      title: "Tom & Jerry 'live'",
      channelTitle: 'Canal "X"',
      durationSeconds: 253,
      viewCount: 12345,
      publishedAt: '2020-01-02T03:04:05Z',
    });
  });

  it('obtiene detalles con restricciones y estado de inserción', async () => {
    mockFetch(() => ({ body: videosBody }));
    const v = await new YouTubeDataApiProvider('CLAVE').getVideo('dQw4w9WgXcQ');
    expect(v).toMatchObject({ embeddable: false, ageRestricted: true, regionRestricted: true, captionsAvailable: true, privacy: 'public', description: 'desc' });
  });

  it('convierte vídeo inexistente en not-found', async () => {
    mockFetch(() => ({ body: { items: [] } }));
    await expect(new YouTubeDataApiProvider('CLAVE').getVideo('dQw4w9WgXcQ')).rejects.toMatchObject({ code: 'not-found' });
  });

  it('traduce errores de cuota y de clave', async () => {
    mockFetch(() => ({ status: 403, body: { error: { code: 403, message: 'quota', errors: [{ reason: 'quotaExceeded' }] } } }));
    await expect(new YouTubeDataApiProvider('CLAVE').searchVideos('x')).rejects.toMatchObject({ code: 'quota', status: 403 });
    mockFetch(() => ({ status: 400, body: { error: { code: 400, message: 'bad key', errors: [{ reason: 'keyInvalid' }] } } }));
    await expect(new YouTubeDataApiProvider('CLAVE').searchVideos('x')).rejects.toMatchObject({ code: 'auth' });
  });

  it('usa la lista de subidas (UU…) para los vídeos de un canal y resuelve handles', async () => {
    const calls = mockFetch((url) => {
      if (url.pathname.endsWith('/channels')) return { body: { items: [{ id: 'UCuAXFkgsw1L7xaCfnd5JJOw', snippet: { title: 'Canal' }, statistics: { subscriberCount: '10' } }] } };
      if (url.pathname.endsWith('/playlistItems')) {
        return {
          body: {
            items: [
              { snippet: { title: 'Vídeo', resourceId: { videoId: 'dQw4w9WgXcQ' }, videoOwnerChannelTitle: 'Canal', thumbnails: {} }, contentDetails: { videoPublishedAt: '2021-01-01T00:00:00Z' } },
              { snippet: { title: 'Deleted video', resourceId: { videoId: 'xxxxxxxxxxx' } } },
            ],
          },
        };
      }
      return { body: { items: [] } };
    });
    const p = new YouTubeDataApiProvider('CLAVE');
    const ch = await p.getChannel('@ejemplo');
    expect(calls[0]?.searchParams.get('forHandle')).toBe('@ejemplo');
    expect(ch).toMatchObject({ id: 'UCuAXFkgsw1L7xaCfnd5JJOw', subscriberCount: 10 });
    const page = await p.getChannelVideos('UCuAXFkgsw1L7xaCfnd5JJOw');
    const playlistCall = calls.find((u) => u.pathname.endsWith('/playlistItems'));
    expect(playlistCall?.searchParams.get('playlistId')).toBe('UUuAXFkgsw1L7xaCfnd5JJOw');
    expect(page.items.map((v) => v.id)).toEqual(['dQw4w9WgXcQ']);
  });
});

describe('InvidiousProvider', () => {
  it('busca en la instancia y mapea los campos', async () => {
    const calls = mockFetch(() => ({
      body: [
        {
          type: 'video',
          title: 'Vídeo',
          videoId: 'dQw4w9WgXcQ',
          author: 'Canal',
          authorId: 'UCuAXFkgsw1L7xaCfnd5JJOw',
          videoThumbnails: [{ quality: 'medium', url: '/vi/dQw4w9WgXcQ/mqdefault.jpg' }],
          lengthSeconds: 253,
          published: 1577934245,
          publishedText: 'hace 2 años',
          viewCount: 42,
          liveNow: false,
        },
      ],
    }));
    const p = new InvidiousProvider('https://inv.ejemplo.org');
    const page = await p.searchVideos('gatos');
    expect(calls[0]?.toString()).toBe('https://inv.ejemplo.org/api/v1/search?q=gatos&type=video&page=1');
    expect(page.nextPage).toBe('2');
    expect(page.items[0]).toMatchObject({
      id: 'dQw4w9WgXcQ',
      thumbnailUrl: 'https://inv.ejemplo.org/vi/dQw4w9WgXcQ/mqdefault.jpg',
      durationSeconds: 253,
      viewCount: 42,
      publishedText: 'hace 2 años',
    });
    expect(page.items[0]?.publishedAt).toBe('2020-01-02T03:04:05.000Z');
  });

  it('resuelve handles con resolveurl y lee la pestaña de vídeos', async () => {
    const calls = mockFetch((url) => {
      if (url.pathname === '/api/v1/resolveurl') return { body: { ucid: 'UCuAXFkgsw1L7xaCfnd5JJOw', pageType: 'WEB_PAGE_TYPE_CHANNEL' } };
      if (url.pathname.endsWith('/videos')) return { body: { videos: [{ type: 'video', title: 'V', videoId: 'dQw4w9WgXcQ', author: 'C' }], continuation: 'CONT' } };
      return { body: { author: 'Canal', authorId: 'UCuAXFkgsw1L7xaCfnd5JJOw', subCount: 5, authorThumbnails: [{ url: 'https://inv.ejemplo.org/a.jpg', width: 100 }] } };
    });
    const p = new InvidiousProvider('https://inv.ejemplo.org');
    const ch = await p.getChannel('@ejemplo');
    expect(calls[0]?.searchParams.get('url')).toBe('https://www.youtube.com/@ejemplo');
    expect(ch).toMatchObject({ id: 'UCuAXFkgsw1L7xaCfnd5JJOw', title: 'Canal', subscriberCount: 5, thumbnailUrl: 'https://inv.ejemplo.org/a.jpg' });
    const page = await p.getChannelVideos('UCuAXFkgsw1L7xaCfnd5JJOw', { page: 'X' });
    expect(calls.at(-1)?.searchParams.get('continuation')).toBe('X');
    expect(page).toMatchObject({ nextPage: 'CONT' });
  });

  it('traduce el error de la instancia', async () => {
    mockFetch(() => ({ status: 500, body: { error: 'Sign in to confirm you’re not a bot' } }));
    await expect(new InvidiousProvider('https://inv.ejemplo.org').getVideo('dQw4w9WgXcQ')).rejects.toMatchObject({ code: 'unavailable', status: 500 });
  });
});

describe('PipedProvider', () => {
  it('busca con filtro de vídeos y pagina con nextpage', async () => {
    const calls = mockFetch((url) => ({
      body: {
        items: [
          {
            type: 'stream',
            url: '/watch?v=dQw4w9WgXcQ',
            title: 'Vídeo',
            thumbnail: 'https://pipedproxy.ejemplo.org/t.jpg',
            uploaderName: 'Canal',
            uploaderUrl: '/channel/UCuAXFkgsw1L7xaCfnd5JJOw',
            uploadedDate: 'hace 2 años',
            uploaded: 1577934245000,
            duration: 253,
            views: 42,
            isShort: false,
          },
          { type: 'channel', url: '/channel/UCx', name: 'no es stream' },
        ],
        nextpage: url.pathname.startsWith('/nextpage') ? 'null' : '{"url":"x"}',
      },
    }));
    const p = new PipedProvider('https://pipedapi.ejemplo.org');
    const page = await p.searchVideos('gatos');
    expect(calls[0]?.toString()).toBe('https://pipedapi.ejemplo.org/search?q=gatos&filter=videos');
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ id: 'dQw4w9WgXcQ', channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw', durationSeconds: 253, viewCount: 42, publishedText: 'hace 2 años' });
    expect(page.nextPage).toBe('{"url":"x"}');
    const page2 = await p.searchVideos('gatos', { page: page.nextPage });
    expect(calls[1]?.pathname).toBe('/nextpage/search');
    expect(calls[1]?.searchParams.get('nextpage')).toBe('{"url":"x"}');
    expect(page2.nextPage).toBeUndefined();
  });

  it('lee /streams y direcciona handles a /@/', async () => {
    const calls = mockFetch((url) => {
      if (url.pathname.startsWith('/streams/')) return { body: { title: 'T', uploader: 'C', uploaderUrl: '/channel/UCuAXFkgsw1L7xaCfnd5JJOw', duration: 10, views: 1, description: 'a<br>b', subtitles: [{ code: 'es' }], livestream: false } };
      return { body: { id: 'UCuAXFkgsw1L7xaCfnd5JJOw', name: 'Canal', subscriberCount: 3, relatedStreams: [], nextpage: null } };
    });
    const p = new PipedProvider('https://pipedapi.ejemplo.org');
    const v = await p.getVideo('dQw4w9WgXcQ');
    expect(v).toMatchObject({ id: 'dQw4w9WgXcQ', title: 'T', channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw', description: 'a\nb', captionsAvailable: true });
    const ch = await p.getChannel('@ejemplo');
    expect(calls[1]?.pathname).toBe('/@/ejemplo');
    expect(ch).toMatchObject({ id: 'UCuAXFkgsw1L7xaCfnd5JJOw', subscriberCount: 3 });
  });
});

describe('createProvider', () => {
  it('no crea ningún proveedor sin configuración', () => {
    expect(createProvider(DEFAULT_SETTINGS)).toBeNull();
    expect(createProvider({ ...DEFAULT_SETTINGS, provider: 'youtube-data-api' })).toBeNull();
    expect(createProvider({ ...DEFAULT_SETTINGS, provider: 'invidious' })).toBeNull();
  });
  it('crea el proveedor elegido', () => {
    expect(createProvider({ ...DEFAULT_SETTINGS, provider: 'youtube-data-api', youtubeApiKey: 'k' })?.id).toBe('youtube-data-api');
    expect(createProvider({ ...DEFAULT_SETTINGS, provider: 'invidious', invidiousInstance: 'https://inv.ejemplo.org' })?.hosts).toEqual(['inv.ejemplo.org']);
    expect(createProvider({ ...DEFAULT_SETTINGS, provider: 'piped', pipedInstance: 'https://pipedapi.ejemplo.org' })?.id).toBe('piped');
  });
});
