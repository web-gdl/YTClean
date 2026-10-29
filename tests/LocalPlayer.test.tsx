import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalPlayer } from '../src/player/LocalPlayer';

const resolved = {
  video: { id: 'dQw4w9WgXcQ', title: 'Título local', channelTitle: 'Canal', thumbnailUrl: '/local/thumb/dQw4w9WgXcQ' },
  progressive: [{ formatId: '18', label: '360p', ext: 'mp4', height: 360, url: '/local/stream/dQw4w9WgXcQ/18' }],
  audio: [{ formatId: '140', label: 'AAC 129 kb/s', ext: 'm4a', abr: 129, url: '/local/stream/dQw4w9WgXcQ/140' }],
  hq: [{ quality: 720, label: '720p', available: true }],
  cached: null,
  job: null,
  subtitles: [{ lang: 'es', name: 'Spanish', auto: false, url: '/local/subs/dQw4w9WgXcQ/es' }],
};

beforeEach(() => {
  Object.defineProperty(HTMLMediaElement.prototype, 'play', { configurable: true, value: () => Promise.resolve() });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', { configurable: true, value: () => undefined });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LocalPlayer', () => {
  it('no pide nada hasta pulsar, y luego reproduce con <video> nativo', async () => {
    const fetchMock = vi.fn((input: string | URL, _init?: RequestInit) => {
      const url = new URL(String(input));
      const body = url.pathname.startsWith('/local/resolve/') ? resolved : { error: 'not-found', message: 'x' };
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const onVideoInfo = vi.fn();
    const onUseOfficial = vi.fn();
    const { container } = render(<LocalPlayer videoId="dQw4w9WgXcQ" title="Prueba" start={30} onUseOfficial={onUseOfficial} onVideoInfo={onVideoInfo} />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.querySelector('video')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Reproducir «Prueba»/ }));
    await waitFor(() => expect(container.querySelector('video')).not.toBeNull());
    const video = container.querySelector('video');
    expect(video?.getAttribute('src')).toBe(`${window.location.origin}/local/stream/dQw4w9WgXcQ/18`);
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('track')?.getAttribute('src')).toBe(`${window.location.origin}/local/subs/dQw4w9WgXcQ/es`);
    expect(onVideoInfo).toHaveBeenCalledWith(expect.objectContaining({ title: 'Título local' }));
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers['X-YC-Local']).toBe('1');

    // Cambio a solo audio.
    const select = screen.getByLabelText('Calidad');
    fireEvent.change(select, { target: { value: 'a:140' } });
    await waitFor(() => expect(container.querySelector('video')?.getAttribute('src')).toBe(`${window.location.origin}/local/stream/dQw4w9WgXcQ/140`));

    fireEvent.click(screen.getByRole('button', { name: 'Usar el reproductor oficial' }));
    expect(onUseOfficial).toHaveBeenCalled();
  });

  it('muestra el error del servicio con la opción de volver al reproductor oficial', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: 'blocked', message: 'YouTube ha rechazado la petición' }), { status: 403, headers: { 'content-type': 'application/json' } }))),
    );
    const onUseOfficial = vi.fn();
    render(<LocalPlayer videoId="dQw4w9WgXcQ" title="Prueba" onUseOfficial={onUseOfficial} />);
    fireEvent.click(screen.getByRole('button', { name: /Reproducir/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByRole('alert').textContent).toContain('YouTube ha rechazado la petición');
    fireEvent.click(screen.getByRole('button', { name: 'Usar el reproductor oficial' }));
    expect(onUseOfficial).toHaveBeenCalled();
  });
});
