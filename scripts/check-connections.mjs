// Comprueba que el código fuente y el resultado de compilación solo mencionan
// hosts externos que figuran en docs/conexiones.json. Falla (código 1) si
// aparece cualquier otro host: así una dependencia o un cambio no puede añadir
// una conexión sin documentarla.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';

const root = process.cwd();
const inventory = JSON.parse(readFileSync(resolve(root, 'docs/conexiones.json'), 'utf8'));
const allowed = new Set(inventory.hosts.map((h) => h.host.toLowerCase()));

// Hosts que aparecen solo para *reconocer* enlaces pegados por el usuario
// (análisis de URL) y nunca se contactan desde el código.
const parseOnly = new Set(['youtu.be', 'youtube.com', 'm.youtube.com', 'music.youtube.com', 'www.youtube.com', 'youtube-nocookie.com']);

// Marcadores de posición en textos de ayuda ("https://invidious.ejemplo.org") y
// espacios de nombres XML: no son conexiones.
const isPlaceholder = (host) => /(^|\.)(ejemplo\.org|example\.(com|org|net))$/.test(host) || host === 'www.w3.org' || host === 'json-schema.org';

const scanDirs = ['src', 'local', 'dist', 'public', 'index.html'];
const exts = new Set(['.ts', '.tsx', '.js', '.mjs', '.html', '.css', '.webmanifest', '.json', '.svg']);

function* walk(path) {
  if (!existsSync(path)) return;
  const st = statSync(path);
  if (st.isFile()) {
    if (exts.has(extname(path))) yield path;
    return;
  }
  for (const name of readdirSync(path)) {
    if (name === 'node_modules') continue;
    yield* walk(join(path, name));
  }
}

const urlRe = /\bhttps?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?=[/?#'"`\s)\],;<>]|$)/gi;
const found = new Map(); // host -> Set(files)
for (const dir of scanDirs) {
  for (const file of walk(resolve(root, dir))) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(urlRe)) {
      const host = m[1].toLowerCase();
      if (!found.has(host)) found.set(host, new Set());
      found.get(host).add(file.replace(root + '/', ''));
    }
  }
}

const unknown = [];
for (const [host, files] of found) {
  if (allowed.has(host) || parseOnly.has(host) || isPlaceholder(host)) continue;
  unknown.push({ host, files: [...files] });
}

console.log(`check-connections: ${found.size} hosts encontrados, ${allowed.size} documentados.`);
for (const host of [...found.keys()].sort()) {
  const tag = allowed.has(host) ? 'documentado' : parseOnly.has(host) ? 'solo análisis de URL' : isPlaceholder(host) ? 'marcador / espacio de nombres' : 'DESCONOCIDO';
  console.log(`  ${host.padEnd(32)} ${tag}`);
}
if (unknown.length) {
  console.error('\nHosts no documentados en docs/conexiones.json:');
  for (const u of unknown) console.error(`  ${u.host}: ${u.files.join(', ')}`);
  process.exit(1);
}
console.log('check-connections: correcto.');
