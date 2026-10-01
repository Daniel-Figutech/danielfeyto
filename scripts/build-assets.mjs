import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(root, '_site');
// Explicit public inputs keep database files, exports and source out of the asset upload.
const assets = ['index.html', 'aviso-legal.html', 'cookies.html', 'privacidad.html', 'terminos.html',
  'apple-touch-icon.png', 'favicon.svg', 'icon-512.png', 'logo.svg', 'og.png', 'fonts', 'carruseles'];
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const asset of assets) cpSync(resolve(root, asset), resolve(output, asset), { recursive: true });
console.log('Archivos públicos preparados en _site/.');
