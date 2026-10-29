// Vídeos guardados (acción explícita del usuario) e historial de reproducción
// (desactivado por defecto). Ambos viven solo en localStorage de este origen.
import { useSyncExternalStore } from 'react';
import type { VideoSummary } from '../data/types';
import { readJson, remove, writeJson } from './localStore';
import { getSettings } from './settings';

export interface SavedVideo {
  id: string;
  title: string;
  channelTitle: string;
  channelId?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  at: number;
}

const HISTORY_LIMIT = 200;

function toSaved(v: VideoSummary): SavedVideo {
  const s: SavedVideo = { id: v.id, title: v.title, channelTitle: v.channelTitle, at: Date.now() };
  if (v.channelId) s.channelId = v.channelId;
  if (v.durationSeconds !== undefined) s.durationSeconds = v.durationSeconds;
  return s;
}

function makeList(key: string) {
  let items: SavedVideo[] = readJson<SavedVideo[]>(key, []);
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());
  const persist = () => {
    if (items.length) writeJson(key, items);
    else remove(key);
    notify();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key === null || e.key.endsWith(key)) {
        items = readJson<SavedVideo[]>(key, []);
        notify();
      }
    });
  }
  return {
    get: () => items,
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    has: (id: string) => items.some((x) => x.id === id),
    add: (v: VideoSummary, limit?: number) => {
      items = [toSaved(v), ...items.filter((x) => x.id !== v.id)];
      if (limit && items.length > limit) items = items.slice(0, limit);
      persist();
    },
    removeId: (id: string) => {
      items = items.filter((x) => x.id !== id);
      persist();
    },
    clear: () => {
      items = [];
      persist();
    },
  };
}

const saved = makeList('saved');
const history = makeList('history');

export const favorites = {
  useList: () => useSyncExternalStore(saved.subscribe, saved.get, saved.get),
  has: saved.has,
  toggle: (v: VideoSummary) => {
    if (saved.has(v.id)) saved.removeId(v.id);
    else saved.add(v);
  },
  remove: saved.removeId,
  clear: saved.clear,
};

export const watchHistory = {
  useList: () => useSyncExternalStore(history.subscribe, history.get, history.get),
  /** Solo registra si el usuario activó el historial en Ajustes. */
  record: (v: VideoSummary) => {
    if (!getSettings().keepHistory) return;
    history.add(v, HISTORY_LIMIT);
  },
  remove: history.removeId,
  clear: history.clear,
};
