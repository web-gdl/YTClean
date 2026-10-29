// Pasos posteriores a `vite build`:
//  1. dist/404.html = dist/index.html (recarga en rutas internas en GitHub Pages).
//  2. dist/_headers con la CSP completa y otras cabeceras (Netlify, Cloudflare Pages).
//  3. dist/.nojekyll para que GitHub Pages sirva archivos tal cual.
import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildHeaderCsp, cspOptionsFromEnv, SECURITY_HEADERS } from './csp.mjs';

const dist = resolve(process.cwd(), 'dist');
const index = resolve(dist, 'index.html');
if (!existsSync(index)) {
  console.error('postbuild: no existe dist/index.html; ejecuta antes `vite build`.');
  process.exit(1);
}

copyFileSync(index, resolve(dist, '404.html'));
writeFileSync(resolve(dist, '.nojekyll'), '');

const headers = { 'Content-Security-Policy': buildHeaderCsp(cspOptionsFromEnv()), ...SECURITY_HEADERS };
const lines = ['/*', ...Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`), ''];
writeFileSync(resolve(dist, '_headers'), lines.join('\n'));

console.log('postbuild: 404.html, .nojekyll y _headers generados en dist/.');
