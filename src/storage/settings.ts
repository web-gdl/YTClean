import { useSyncExternalStore } from 'react';
import type { Theme } from '../app/theme';
import type { ProviderId } from '../data/types';
import { createStore } from './localStore';

export interface Settings {
  provider: ProviderId;
  youtubeApiKey: string;
  invidiousInstance: string;
  pipedInstance: string;
  theme: Theme;
  thumbnails: 'show' | 'hide';
  captions: boolean;
  /** Idioma de los controles del reproductor oficial (parámetro hl). */
  playerLanguage: string;
  keepHistory: boolean;
  /** URL del servicio local (vacío = el mismo origen que sirve la web). */
  localServiceUrl: string;
  /** Reproductor: oficial (iframe de youtube-nocookie.com) o local (servicio + <video>). */
  playerMode: 'official' | 'local';
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'none',
  youtubeApiKey: '',
  invidiousInstance: '',
  pipedInstance: '',
  theme: 'system',
  thumbnails: 'show',
  captions: false,
  playerLanguage: 'es',
  keepHistory: false,
  localServiceUrl: '',
  playerMode: 'official',
};

const store = createStore<Settings>('settings', DEFAULT_SETTINGS);

export function getSettings(): Settings {
  return store.get();
}

export function updateSettings(patch: Partial<Settings>): void {
  store.update(patch);
}

export function resetSettings(): void {
  store.reset();
}

export function subscribeSettings(listener: () => void): () => void {
  return store.subscribe(listener);
}

export function useSettings(): Settings {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
