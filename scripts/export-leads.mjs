import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const query = 'SELECT nombre,email,whatsapp,instagram,que_vendes,facturacion,objetivo,consent_version,datetime(created_at,\'unixepoch\') AS fecha_utc FROM carrusel_leads ORDER BY created_at DESC';
const result = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'DB', '--remote', '--command', query, '--json'], { cwd: root, encoding: 'utf8' });
if (result.status !== 0) { console.error('No se ha podido exportar. Comprueba tu sesión de Cloudflare.'); process.exit(1); }
const rows = JSON.parse(result.stdout)[0].results;
const headers = ['nombre', 'email', 'whatsapp', 'instagram', 'que_vendes', 'facturacion', 'objetivo', 'consent_version', 'fecha_utc'];
// Quoting plus prefixing prevents spreadsheet formula injection from submitted fields.
const cell = value => '"' + String(value ?? '').replace(/^[=+@\-\t\r]/, character => "'" + character).replaceAll('"', '""') + '"';
const csv = [headers.map(cell).join(','), ...rows.map(row => headers.map(key => cell(row[key])).join(','))].join('\r\n');
const directory = resolve(root, '_private');
mkdirSync(directory, { recursive: true });
const path = resolve(directory, `carruseles-leads-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`);
writeFileSync(path, '\ufeff' + csv, { mode: 0o600 });
console.log(`${rows.length} registros guardados en ${path}`);
