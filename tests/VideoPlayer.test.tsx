import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VideoPlayer } from '../src/player/VideoPlayer';

describe('VideoPlayer', () => {
  it('no carga ningún iframe hasta que se pulsa reproducir', () => {
    const { container, rerender } = render(<VideoPlayer videoId="dQw4w9WgXcQ" title="Prueba" thumbnailUrl="https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg" />);
    expect(container.querySelector('iframe')).toBeNull();
    const button = screen.getByRole('button', { name: /Reproducir «Prueba»/ });
    fireEvent.click(button);
    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    const src = new URL(iframe?.getAttribute('src') ?? '');
    expect(src.origin).toBe('https://www.youtube-nocookie.com');
    expect(src.pathname).toBe('/embed/dQw4w9WgXcQ');
    expect(src.searchParams.get('autoplay')).toBe('1');
    expect(iframe?.getAttribute('sandbox')).toContain('allow-scripts');
    expect(iframe?.getAttribute('allow')).toContain('fullscreen');
    expect(iframe?.getAttribute('referrerpolicy')).toBe('strict-origin-when-cross-origin');

    // Al cambiar de vídeo vuelve a la fachada.
    rerender(<VideoPlayer videoId="jNQXAC9IVRw" title="Otro" />);
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('muestra el mensaje de bloqueo en lugar de la fachada', () => {
    const { container } = render(<VideoPlayer videoId="dQw4w9WgXcQ" title="Prueba" blockedMessage="No insertable" />);
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('No insertable')).toBeTruthy();
  });

  it('reproduce una lista completa sin vídeo inicial', () => {
    const { container } = render(<VideoPlayer videoId={null} title="Lista" list="PLabc" />);
    fireEvent.click(screen.getByRole('button'));
    const src = new URL(container.querySelector('iframe')?.getAttribute('src') ?? '');
    expect(src.pathname).toBe('/embed/videoseries');
    expect(src.searchParams.get('list')).toBe('PLabc');
  });
});
