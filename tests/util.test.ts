import { describe, expect, it } from 'vitest';
import {
  decodeHtmlEntities,
  formatCount,
  formatDuration,
  parseIsoDuration,
  parseTimestamp,
  parseYouTubeInput,
  youtubeThumbnail,
  youtubeWatchUrl,
} from '../src/data/util';

describe('parseYouTubeInput', () => {
  it('reconoce un ID de vídeo suelto', () => {
    expect(parseYouTubeInput('dQw4w9WgXcQ')).toEqual({ kind: 'video', id: 'dQw4w9WgXcQ' });
  });
  it('reconoce enlaces watch con tiempo y lista', () => {
    expect(parseYouTubeInput('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s&list=PLabcdefghijklmnop')).toEqual({
      kind: 'video',
      id: 'dQw4w9WgXcQ',
      start: 90,
      list: 'PLabcdefghijklmnop',
    });
  });
  it('reconoce youtu.be, shorts, embed, live y m.youtube.com', () => {
    expect(parseYouTubeInput('https://youtu.be/dQw4w9WgXcQ?t=42')).toEqual({ kind: 'video', id: 'dQw4w9WgXcQ', start: 42 });
    expect(parseYouTubeInput('youtube.com/shorts/dQw4w9WgXcQ')).toEqual({ kind: 'video', id: 'dQw4w9WgXcQ' });
    expect(parseYouTubeInput('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')).toEqual({ kind: 'video', id: 'dQw4w9WgXcQ' });
    expect(parseYouTubeInput('https://www.youtube.com/live/dQw4w9WgXcQ')).toEqual({ kind: 'video', id: 'dQw4w9WgXcQ' });
    expect(parseYouTubeInput('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({ kind: 'video', id: 'dQw4w9WgXcQ' });
  });
  it('reconoce listas, canales y handles', () => {
    expect(parseYouTubeInput('https://www.youtube.com/playlist?list=PLabcdefghijklmnop')).toEqual({ kind: 'playlist', id: 'PLabcdefghijklmnop' });
    expect(parseYouTubeInput('PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf')).toEqual({ kind: 'playlist', id: 'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf' });
    expect(parseYouTubeInput('https://www.youtube.com/watch?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf')).toEqual({ kind: 'playlist', id: 'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf' });
    expect(parseYouTubeInput('https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw')).toEqual({ kind: 'channel', id: 'UCuAXFkgsw1L7xaCfnd5JJOw' });
    expect(parseYouTubeInput('https://www.youtube.com/@ejemplo/videos')).toEqual({ kind: 'handle', handle: 'ejemplo' });
    expect(parseYouTubeInput('@ejemplo')).toEqual({ kind: 'handle', handle: 'ejemplo' });
    expect(parseYouTubeInput('https://www.youtube.com/c/Ejemplo')).toEqual({ kind: 'handle', handle: 'Ejemplo' });
  });
  it('rechaza texto corriente y dominios ajenos', () => {
    expect(parseYouTubeInput('cómo cocinar lentejas')).toBeNull();
    // Palabras de 11 letras no son IDs de vídeo.
    expect(parseYouTubeInput('programador')).toBeNull();
    expect(parseYouTubeInput('PLAYGROUNDSS')).toBeNull();
    expect(parseYouTubeInput('https://www.youtube.com/@')).toBeNull();
    expect(parseYouTubeInput('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseYouTubeInput('https://www.youtube.com/watch?v=corto')).toBeNull();
    expect(parseYouTubeInput('')).toBeNull();
  });
});

describe('parseTimestamp', () => {
  it('acepta segundos y formato 1h2m3s', () => {
    expect(parseTimestamp('90')).toBe(90);
    expect(parseTimestamp('1h2m3s')).toBe(3723);
    expect(parseTimestamp('2m')).toBe(120);
    expect(parseTimestamp('1m30')).toBe(90);
    expect(parseTimestamp('0')).toBeUndefined();
    expect(parseTimestamp('abc')).toBeUndefined();
    expect(parseTimestamp(null)).toBeUndefined();
  });
});

describe('parseIsoDuration / formatDuration', () => {
  it('convierte duraciones ISO 8601', () => {
    expect(parseIsoDuration('PT4M13S')).toBe(253);
    expect(parseIsoDuration('PT1H2M3S')).toBe(3723);
    expect(parseIsoDuration('P1DT1S')).toBe(86401);
    expect(parseIsoDuration('PT0S')).toBe(0);
    expect(parseIsoDuration('mal')).toBeUndefined();
  });
  it('formatea mm:ss y h:mm:ss', () => {
    expect(formatDuration(253)).toBe('4:13');
    expect(formatDuration(3723)).toBe('1:02:03');
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(undefined)).toBe('');
  });
});

describe('formatCount', () => {
  it('abrevia cantidades grandes en español', () => {
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1500)).toBe('1500');
    expect(formatCount(1_250_000)).toMatch(/1,[23]\s?M/);
    expect(formatCount(undefined)).toBe('');
  });
});

describe('decodeHtmlEntities', () => {
  it('decodifica entidades con nombre y numéricas', () => {
    expect(decodeHtmlEntities('Tom &amp; Jerry &#39;live&#39; &quot;ok&quot; &#x41;')).toBe('Tom & Jerry \'live\' "ok" A');
    expect(decodeHtmlEntities('sin entidades')).toBe('sin entidades');
    expect(decodeHtmlEntities('mal &#1114112; código')).toBe('mal &#1114112; código');
  });
});

describe('URLs de YouTube', () => {
  it('construye miniaturas y enlaces externos', () => {
    expect(youtubeThumbnail('dQw4w9WgXcQ')).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg');
    expect(youtubeWatchUrl('dQw4w9WgXcQ', 30)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s');
  });
});
