// Construcción de la URL del reproductor oficial en modo de privacidad mejorada.
// Parámetros documentados en https://developers.google.com/youtube/player_parameters
// (no se usan parámetros retirados como modestbranding ni showinfo).
export const EMBED_ORIGIN = 'https://www.youtube-nocookie.com';

export interface EmbedOptions {
  /** Segundo de inicio. */
  start?: number;
  /** Reproduce dentro de una lista: el reproductor oficial gestiona siguiente/anterior. */
  list?: string;
  /** Cargar subtítulos al empezar (cc_load_policy=1). */
  captions?: boolean;
  /** Idioma de la interfaz del reproductor (hl) y preferido de subtítulos (cc_lang_pref). */
  language?: string;
  /** Iniciar la reproducción al cargar; solo se usa tras el clic en la fachada. */
  autoplay?: boolean;
}

export function buildEmbedUrl(videoId: string | null, opts: EmbedOptions = {}): string {
  const params = new URLSearchParams();
  if (opts.autoplay) params.set('autoplay', '1');
  // rel=0: los vídeos relacionados al final se limitan al mismo canal (YouTube ya
  // no permite ocultarlos del todo).
  params.set('rel', '0');
  // iv_load_policy=3: sin anotaciones.
  params.set('iv_load_policy', '3');
  params.set('playsinline', '1');
  if (opts.start && opts.start > 0) params.set('start', String(Math.floor(opts.start)));
  if (opts.captions) params.set('cc_load_policy', '1');
  if (opts.language) {
    params.set('hl', opts.language);
    params.set('cc_lang_pref', opts.language);
  }
  if (opts.list) params.set('list', opts.list);
  const path = videoId ? `/embed/${encodeURIComponent(videoId)}` : '/embed/videoseries';
  return `${EMBED_ORIGIN}${path}?${params.toString()}`;
}

/** Atributos de permisos y aislamiento del iframe. */
export const IFRAME_ALLOW = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
export const IFRAME_SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation';
