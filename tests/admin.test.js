import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import admin from '../src/admin.js';

const key = 'test_key_'.padEnd(43, 'x');
const digest = value => createHash('sha256').update(value).digest('hex');
const origin = 'https://danielfeyto.com';
const base = origin + '/carruseles/panel';
function environment() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const migration of ['0001_carruseles.sql', '0002_admin.sql']) sqlite.exec(readFileSync(new URL('../migrations/' + migration, import.meta.url), 'utf8'));
  return {
    sqlite, ADMIN_KEY_HASH: digest(key),
    DB: { prepare(sql) {
      return {
        values: [], bind(...values) { this.values = values; return this; },
        async first() { return sqlite.prepare(sql).get(...this.values) || null; },
        async all() { return { results: sqlite.prepare(sql).all(...this.values) }; },
        async run() { return sqlite.prepare(sql).run(...this.values); },
      };
    } },
    ASSETS: { fetch: async () => new Response('<html>Panel público sin datos</html>', { headers: { 'Content-Type': 'text/html' } }) },
  };
}
const request = (env, path, options = {}) => admin.fetch(new Request(base + path, options), env);
const login = (env, submitted = key, headers = {}) => request(env, '/api/login', {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1', ...headers }, body: JSON.stringify({ key: submitted }),
});
const cookie = response => response.headers.get('set-cookie').split(';')[0];
function seed(env, count = 1) {
  const insert = env.sqlite.prepare('INSERT INTO carrusel_leads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (let i = 0; i < count; i++) insert.run(String(i).padStart(4, '0'), i ? 'Persona ' + i : '=HYPERLINK("malicious")', `person${i}@example.com`, '+15550100101', '@prueba', '<img src=x onerror=alert(1)>', 'Menos de 5.000 €', 'Una respuesta\ncon salto', 'carruseles-2026-10-01', 1700000000 + i);
}

test('leads, CSV and session status require a separate admin session', async () => {
  const env = environment(); seed(env);
  for (const path of ['/api/leads', '/api/export', '/api/me']) {
    for (const value of ['', '__Secure-carruseles=' + 'a'.repeat(64), '__Secure-carruseles-admin=' + 'b'.repeat(64)]) {
      const response = await request(env, path, { headers: { Cookie: value } });
      assert.equal(response.status, 401); assert.match(response.headers.get('cache-control'), /no-store/);
      assert.ok(!(await response.text()).includes('person0@example.com'));
    }
  }
});

test('a key is exchanged once per login for an HttpOnly cookie; plaintext credentials are never returned or stored', async () => {
  const env = environment(); const response = await login(env);
  assert.equal(response.status, 200);
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/carruseles/panel', 'Max-Age=2592000']) assert.ok(response.headers.get('set-cookie').includes(flag));
  assert.ok(!(await response.text()).includes(key));
  const row = env.sqlite.prepare('SELECT * FROM carrusel_admin_sessions').get();
  assert.notEqual(row.token_hash, cookie(response).split('=')[1]);
  assert.ok(!JSON.stringify(row).includes(key));
  assert.equal((await request(env, '/api/me', { headers: { Cookie: cookie(response) } })).status, 200);
});

test('wrong key, absent configuration, cross-origin and oversized logins cannot grant access', async () => {
  const env = environment();
  assert.equal((await login(env, 'wrong')).status, 401);
  assert.equal((await login(env, key, { Origin: 'https://example.com' })).status, 403);
  assert.equal((await login(env, 'x'.repeat(5000))).status, 413);
  delete env.ADMIN_KEY_HASH;
  assert.equal((await login(env)).status, 503);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM carrusel_admin_sessions').get().n, 0);
});

test('admin login rate limit is persisted and rejects the eleventh attempt', async () => {
  const env = environment();
  for (let i = 0; i < 10; i++) assert.equal((await login(env, 'wrong')).status, 401);
  assert.equal((await login(env)).status, 429);
});

test('expiry, logout and key rotation invalidate sessions', async () => {
  for (const action of ['expire', 'logout', 'rotate']) {
    const env = environment(); const headers = { Cookie: cookie(await login(env)), Origin: origin };
    if (action === 'expire') env.sqlite.exec('UPDATE carrusel_admin_sessions SET expires_at = 1');
    if (action === 'rotate') env.ADMIN_KEY_HASH = digest('different key');
    if (action === 'logout') assert.equal((await request(env, '/api/logout', { method: 'POST', headers })).status, 200);
    assert.equal((await request(env, '/api/leads', { headers })).status, 401);
  }
});

test('list supports stable pagination and bound search, without leaking internal auth records', async () => {
  const env = environment(); seed(env, 53); const headers = { Cookie: cookie(await login(env)) };
  const first = await (await request(env, '/api/leads', { headers })).json();
  assert.equal(first.total, 53); assert.equal(first.leads.length, 50); assert.equal(first.leads[0].id, '0052');
  const second = await (await request(env, '/api/leads?page=2', { headers })).json();
  assert.equal(second.leads.length, 3); assert.equal(second.leads[2].id, '0000');
  const filtered = await (await request(env, '/api/leads?q=person52', { headers })).json();
  assert.equal(filtered.total, 1);
  for (const q of ["' OR 1=1 --", '%', '_']) {
    const data = await (await request(env, '/api/leads?q=' + encodeURIComponent(q), { headers })).json();
    assert.equal(data.total, 0);
  }
  assert.equal((await request(env, '/api/leads?page=-1', { headers })).status, 400);
  assert.ok(!JSON.stringify(first).includes('token_hash'));
});

test('CSV includes all matching rows, quotes multiline content and neutralizes formulas', async () => {
  const env = environment(); seed(env, 503); const headers = { Cookie: cookie(await login(env)) };
  const response = await request(env, '/api/export', { headers });
  assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /text\/csv/);
  const csv = await response.text();
  assert.ok(csv.includes('person502@example.com')); assert.ok(csv.includes('person0@example.com'));
  assert.ok(csv.includes("\"'=HYPERLINK(\"\"malicious\"\")\""));
  assert.ok(csv.includes('"Una respuesta\ncon salto"'));
  const filtered = await (await request(env, '/api/export?q=person502', { headers })).text();
  assert.ok(!filtered.includes('person0@example.com'));
});

test('panel and errors forbid caching, embedding and third-party scripts', async () => {
  const env = environment();
  for (const path of ['/', '/api/leads', '/api/missing']) {
    const response = await request(env, path);
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
  }
});
