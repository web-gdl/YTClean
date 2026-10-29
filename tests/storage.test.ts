import { beforeEach, describe, expect, it } from 'vitest';
import { favorites, watchHistory } from '../src/storage/collections';
import { clearAll, ownKeys, PREFIX } from '../src/storage/localStore';
import { DEFAULT_SETTINGS, getSettings, resetSettings, updateSettings } from '../src/storage/settings';

beforeEach(() => {
  resetSettings();
  favorites.clear();
  watchHistory.clear();
  window.localStorage.clear();
});

describe('ajustes', () => {
  it('no escribe nada hasta que el usuario cambia algo', () => {
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(window.localStorage.length).toBe(0);
    updateSettings({ theme: 'system' }); // igual que el valor por defecto
    expect(window.localStorage.length).toBe(0);
  });
  it('persiste los cambios y vuelve a borrar al restablecer', () => {
    updateSettings({ theme: 'dark', provider: 'invidious', invidiousInstance: 'https://inv.ejemplo.org' });
    expect(window.localStorage.getItem(`${PREFIX}settings`)).toContain('"theme":"dark"');
    expect(getSettings().invidiousInstance).toBe('https://inv.ejemplo.org');
    updateSettings({ theme: 'system', provider: 'none', invidiousInstance: '' });
    expect(window.localStorage.getItem(`${PREFIX}settings`)).toBeNull();
    updateSettings({ captions: true });
    resetSettings();
    expect(getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(window.localStorage.length).toBe(0);
  });
});

describe('guardados e historial', () => {
  const video = { id: 'dQw4w9WgXcQ', title: 'T', channelTitle: 'C', thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg' };

  it('guardar es explícito y reversible', () => {
    expect(favorites.has(video.id)).toBe(false);
    favorites.toggle(video);
    expect(favorites.has(video.id)).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(`${PREFIX}saved`) ?? '[]')).toHaveLength(1);
    favorites.toggle(video);
    expect(window.localStorage.getItem(`${PREFIX}saved`)).toBeNull();
  });

  it('el historial está desactivado por defecto', () => {
    watchHistory.record(video);
    expect(window.localStorage.getItem(`${PREFIX}history`)).toBeNull();
    updateSettings({ keepHistory: true });
    watchHistory.record(video);
    watchHistory.record(video);
    expect(JSON.parse(window.localStorage.getItem(`${PREFIX}history`) ?? '[]')).toHaveLength(1);
  });
});

describe('clearAll', () => {
  it('borra solo las claves propias', () => {
    window.localStorage.setItem('ajeno', '1');
    updateSettings({ theme: 'dark' });
    favorites.toggle({ id: 'dQw4w9WgXcQ', title: 'T', channelTitle: 'C' });
    expect(ownKeys().sort()).toEqual(['saved', 'settings']);
    clearAll();
    expect(ownKeys()).toEqual([]);
    expect(window.localStorage.getItem('ajeno')).toBe('1');
  });
});
