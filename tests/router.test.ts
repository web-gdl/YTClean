import { describe, expect, it } from 'vitest';
import { parseRoute, routes } from '../src/app/router';

describe('parseRoute', () => {
  it('resuelve cada sección', () => {
    expect(parseRoute('/', '').name).toBe('home');
    expect(parseRoute('/buscar', '?q=gatos').name).toBe('search');
    expect(parseRoute('/buscar', '?q=gatos').query.get('q')).toBe('gatos');
    expect(parseRoute('/ver/dQw4w9WgXcQ', '?t=30')).toMatchObject({ name: 'watch', params: { id: 'dQw4w9WgXcQ' } });
    expect(parseRoute('/ver/lista/PLabc', '')).toMatchObject({ name: 'watch-playlist', params: { id: 'PLabc' } });
    expect(parseRoute('/canal/%40ejemplo', '')).toMatchObject({ name: 'channel', params: { id: '@ejemplo' } });
    expect(parseRoute('/lista/PLabc/', '')).toMatchObject({ name: 'playlist', params: { id: 'PLabc' } });
    expect(parseRoute('/guardados', '').name).toBe('saved');
    expect(parseRoute('/ajustes', '').name).toBe('settings');
    expect(parseRoute('/privacidad', '').name).toBe('privacy');
    expect(parseRoute('/otra/cosa', '').name).toBe('not-found');
    // Codificación inválida: no lanza.
    expect(parseRoute('/ver/%E0%A4%A', '')).toMatchObject({ name: 'watch', params: { id: '' } });
  });
});

describe('routes', () => {
  it('codifica parámetros', () => {
    expect(routes.search('a b&c')).toBe('/buscar?q=a%20b%26c');
    expect(routes.watch('dQw4w9WgXcQ', { start: 30, list: 'PLabc' })).toBe('/ver/dQw4w9WgXcQ?t=30&list=PLabc');
    expect(routes.watch('dQw4w9WgXcQ')).toBe('/ver/dQw4w9WgXcQ');
    expect(routes.channel('@ejemplo')).toBe('/canal/%40ejemplo');
  });
});
