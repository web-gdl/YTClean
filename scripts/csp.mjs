// Política de seguridad de contenido (CSP) de YouTube Clean.
// Es la única definición: la usan vite.config.ts (etiqueta <meta> en producción),
// scripts/postbuild.mjs (archivo _headers) y la documentación.
//
// Las fuentes de datos (Data API, Invidious, Piped) las elige el usuario en la
// aplicación, así que `connect-src` e `img-src` permiten cualquier origen https
// por defecto. Para un despliegue fijo conviene restringirlos con las variables
// YC_CSP_CONNECT e YC_CSP_IMG (ver docs/despliegue.md).

export const EMBED_ORIGIN = 'https://www.youtube-nocookie.com';

/**
 * @param {{ connect?: string, img?: string }} [opts]
 * @returns {string} directivas válidas en <meta http-equiv="Content-Security-Policy">
 */
export function buildMetaCsp(opts = {}) {
  const connect = (opts.connect ?? 'https:').trim();
  const img = (opts.img ?? 'https:').trim();
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    `img-src 'self' data: ${img}`,
    `connect-src 'self' ${connect}`,
    `frame-src ${EMBED_ORIGIN}`,
    "font-src 'self'",
    "manifest-src 'self'",
    "media-src 'none'",
    "object-src 'none'",
    "worker-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
}

/**
 * Política completa para cabeceras HTTP (admite directivas que <meta> ignora).
 * @param {{ connect?: string, img?: string }} [opts]
 */
export function buildHeaderCsp(opts = {}) {
  return `${buildMetaCsp(opts)}; frame-ancestors 'none'`;
}

/** Otras cabeceras de seguridad recomendadas. */
export const SECURITY_HEADERS = {
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=(), browsing-topics=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

/** Lee las variables de entorno YC_CSP_CONNECT / YC_CSP_IMG. */
export function cspOptionsFromEnv(env = process.env) {
  /** @type {{ connect?: string, img?: string }} */
  const opts = {};
  if (env.YC_CSP_CONNECT) opts.connect = env.YC_CSP_CONNECT;
  if (env.YC_CSP_IMG) opts.img = env.YC_CSP_IMG;
  return opts;
}
