// Crea el proveedor de datos a partir de los ajustes. Añadir otra fuente consiste
// en implementar DataProvider y registrarla aquí.
import type { Settings } from '../storage/settings';
import { InvidiousProvider } from './providers/invidious';
import { PipedProvider } from './providers/piped';
import { YouTubeDataApiProvider } from './providers/youtubeDataApi';
import { ProviderError, type DataProvider, type ProviderId } from './types';

export const PROVIDER_IDS: readonly ProviderId[] = ['none', 'youtube-data-api', 'invidious', 'piped'];

/** Devuelve el proveedor configurado o null si el usuario no ha elegido ninguno. */
export function createProvider(settings: Settings): DataProvider | null {
  switch (settings.provider) {
    case 'youtube-data-api':
      return settings.youtubeApiKey ? new YouTubeDataApiProvider(settings.youtubeApiKey) : null;
    case 'invidious':
      return settings.invidiousInstance ? new InvidiousProvider(settings.invidiousInstance) : null;
    case 'piped':
      return settings.pipedInstance ? new PipedProvider(settings.pipedInstance) : null;
    case 'none':
      return null;
  }
}

export function requireProvider(settings: Settings): DataProvider {
  const p = createProvider(settings);
  if (!p) throw new ProviderError('not-configured', 'No hay fuente de datos configurada');
  return p;
}
