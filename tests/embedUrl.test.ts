import { describe, expect, it } from 'vitest';
import { buildEmbedUrl, IFRAME_SANDBOX } from '../src/player/embedUrl';

describe('buildEmbedUrl', () => {
  it('usa siempre el dominio de privacidad mejorada', () => {
    const url = new URL(buildEmbedUrl('dQw4w9WgXcQ'));
    expect(url.origin).toBe('https://www.youtube-nocookie.com');
    expect(url.pathname).toBe('/embed/dQw4w9WgXcQ');
    expect(url.searchParams.get('rel')).toBe('0');
    expect(url.searchParams.get('iv_load_policy')).toBe('3');
    expect(url.searchParams.get('autoplay')).toBeNull();
    expect(url.searchParams.has('modestbranding')).toBe(false);
  });
  it('añade inicio, subtítulos, idioma, lista y autoplay', () => {
    const url = new URL(buildEmbedUrl('dQw4w9WgXcQ', { start: 90.7, captions: true, language: 'es', list: 'PLabc', autoplay: true }));
    expect(url.searchParams.get('start')).toBe('90');
    expect(url.searchParams.get('cc_load_policy')).toBe('1');
    expect(url.searchParams.get('hl')).toBe('es');
    expect(url.searchParams.get('cc_lang_pref')).toBe('es');
    expect(url.searchParams.get('list')).toBe('PLabc');
    expect(url.searchParams.get('autoplay')).toBe('1');
  });
  it('reproduce una lista completa sin vídeo inicial', () => {
    const url = new URL(buildEmbedUrl(null, { list: 'PLabc' }));
    expect(url.pathname).toBe('/embed/videoseries');
    expect(url.searchParams.get('list')).toBe('PLabc');
  });
  it('el sandbox no permite navegación superior ni formularios', () => {
    expect(IFRAME_SANDBOX).not.toContain('allow-top-navigation');
    expect(IFRAME_SANDBOX).not.toContain('allow-forms');
  });
});
