import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { buildMetaCsp, cspOptionsFromEnv } from './scripts/csp.mjs';

// Inserta la CSP como <meta> solo en la compilación de producción. En desarrollo
// Vite y el refresco rápido de React inyectan código en línea que la CSP
// bloquearía; la política real se comprueba con `npm run preview` y las pruebas.
function cspMetaPlugin(): Plugin {
  const policy = buildMetaCsp(cspOptionsFromEnv());
  return {
    name: 'yc-csp-meta',
    apply: 'build',
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
            injectTo: 'head-prepend',
          },
        ],
      };
    },
  };
}

export default defineConfig({
  // Ruta base del despliegue (p. ej. "/youtube-clean/" en GitHub Pages).
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), cspMetaPlugin()],
  build: {
    target: 'es2022',
    sourcemap: false,
    // Un único archivo CSS y chunks con nombre estable facilitan auditar el resultado.
    cssCodeSplit: false,
  },
  server: {
    // El servidor de desarrollo solo escucha en la máquina local.
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    css: false,
  },
});
