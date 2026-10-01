import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const [file, mode] = process.argv.slice(2);
if (!file || !['--local', '--remote'].includes(mode)) {
  console.error('Uso: node scripts/upload-download.mjs archivo.zip --local|--remote');
  process.exit(1);
}
const root = fileURLToPath(new URL('..', import.meta.url));
const zip = readFileSync(resolve(file));
if (zip[0] !== 0x50 || zip[1] !== 0x4b) throw new Error('El archivo debe ser un ZIP.');
const sha256 = createHash('sha256').update(zip).digest('hex');
const directory = resolve(root, '_private', 'download', sha256);
mkdirSync(directory, { recursive: true });
const parts = [];
function upload(key, path) {
  const result = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'kv', 'key', 'put', key,
    '--path', path, '--binding', 'DOWNLOADS', mode], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`No se ha subido ${key}; el manifiesto anterior sigue vigente.`);
}
// Each immutable part is below KV's 25 MiB value limit. The public repo never contains the ZIP.
const chunkSize = 20 * 1024 * 1024;
for (let offset = 0, index = 0; offset < zip.length; offset += chunkSize, index++) {
  const name = String(index).padStart(2, '0');
  const key = `archives/${sha256}/${name}`;
  const path = resolve(directory, name);
  writeFileSync(path, zip.subarray(offset, offset + chunkSize));
  upload(key, path);
  parts.push(key);
}
const manifest = { filename: 'IA-Carruseles-Aesthetic.zip', size: zip.length, sha256, parts };
const path = resolve(directory, 'manifest.json');
writeFileSync(path, JSON.stringify(manifest));
upload('manifest.json', path); // Publish only after every part is uploaded.
console.log(`ZIP disponible en almacenamiento ${mode.slice(2)}: ${zip.length} bytes; SHA-256 ${sha256}`);
