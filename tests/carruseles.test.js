import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../src/worker.js';

// Real SQLite executes the same SQL as D1; only the Cloudflare transport is adapted.
function environment() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(readFileSync(new URL('../migrations/0001_carruseles.sql', import.meta.url), 'utf8'));
  const db = {
    prepare(sql) {
      return {
        values: [], sql,
        bind(...values) { this.values = values; return this; },
        async run() { sqlite.prepare(sql).run(...this.values); return { success: true }; },
        async first() { return sqlite.prepare(sql).get(...this.values) || null; },
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const result = await Promise.all(statements.map(s => s.run()));
        sqlite.exec('COMMIT');
        return result;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  const manifest = { filename: 'IA-Carruseles-Aesthetic.zip', size: 6, sha256: 'test', parts: ['test/01', 'test/02'] };
  const files = new Map([['manifest.json', manifest], ['test/01', 'ZIP'], ['test/02', '123']]);
  return {
    sqlite, files,
    DB: db,
    DOWNLOADS: { async get(key, type) {
      const value = files.get(key);
      if (value === undefined) return null;
      return type === 'json' ? value : new Response(value).body;
    } },
    ASSETS: { async fetch() { return new Response('Public page'); } },
  };
}
const data = {
  nombre: 'Prueba', email: 'prueba@example.com', whatsapp: '+34600000000',
  instagram: '@prueba', que_vendes: 'Formación para profesionales',
  facturacion: 'Menos de 5.000 €', objetivo: 'Dar a conocer mi trabajo', consent: true, website: '',
};
function register(env, body = data, extraHeaders = {}) {
  return worker.fetch(new Request('https://danielfeyto.com/carruseles/registro', {
    method: 'POST', headers: { Origin: 'https://danielfeyto.com', 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1', ...extraHeaders },
    body: JSON.stringify(body),
  }), env);
}
function download(env, cookie = '', method = 'GET') {
  return worker.fetch(new Request('https://danielfeyto.com/carruseles/descargar', { method, headers: { Cookie: cookie } }), env);
}
const cookieFrom = response => response.headers.get('set-cookie')?.split(';')[0];

test('a visitor cannot download or use an invented cookie', async () => {
  const env = environment();
  for (const cookie of ['', '__Secure-carruseles=' + 'a'.repeat(64)]) {
    const response = await download(env, cookie);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), '/carruseles/?registro=1');
    assert.match(response.headers.get('cache-control'), /no-store/);
  }
  assert.equal((await download(env, '', 'HEAD')).status, 303);
});

test('invalid, incomplete, no-consent, and honeypot submissions cannot unlock the ZIP', async () => {
  const env = environment();
  for (const patch of [{ email: 'invalid' }, { nombre: '' }, { consent: false }, { consent: 'true' }, { website: 'spam' }, { facturacion: 'inventado' }, { whatsapp: '123' }, { objetivo: 'x'.repeat(2001) }]) {
    const response = await register(env, { ...data, ...patch });
    assert.equal(response.status, 422);
    assert.equal(response.headers.get('set-cookie'), null);
  }
  assert.equal(env.sqlite.prepare('SELECT count(*) AS n FROM carrusel_leads').get().n, 0);
});

test('rejects cross-origin and oversized submissions', async () => {
  const env = environment();
  assert.equal((await register(env, data, { Origin: 'https://example.com' })).status, 403);
  assert.equal((await register(env, { ...data, objetivo: 'a'.repeat(20000) })).status, 413);
});

test('valid registration persists every field and consent before granting a private session', async () => {
  const env = environment();
  const response = await register(env);
  assert.equal(response.status, 201);
  const cookie = response.headers.get('set-cookie');
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/carruseles', 'Max-Age=86400']) assert.ok(cookie.includes(flag));
  const saved = env.sqlite.prepare('SELECT * FROM carrusel_leads').get();
  for (const key of ['nombre', 'email', 'whatsapp', 'instagram', 'que_vendes', 'facturacion', 'objetivo']) assert.equal(saved[key], data[key]);
  assert.equal(saved.consent_version, 'carruseles-2026-10-01');
  assert.ok(saved.created_at > 0);
  const result = await response.json();
  assert.equal(result.download, '/carruseles/descargar');
  assert.equal(JSON.stringify(result).includes(cookieFrom(response).split('=')[1]), false);
  const session = env.sqlite.prepare('SELECT * FROM carrusel_sessions').get();
  assert.notEqual(session.token_hash, cookieFrom(response).split('=')[1]);
  const file = await download(env, cookieFrom(response));
  assert.equal(file.status, 200);
  assert.equal(await file.text(), 'ZIP123');
  assert.match(file.headers.get('content-disposition'), /attachment.*\.zip/);
  assert.equal(file.headers.get('content-length'), '6');
  assert.match(file.headers.get('cache-control'), /no-store/);
});

test('database failure never grants download access', async () => {
  const env = environment();
  env.DB.batch = async () => { throw new Error('private database detail'); };
  const response = await register(env);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal((await response.text()).includes('private database detail'), false);
});

test('expired sessions and deleted leads cannot download', async () => {
  for (const sql of ['UPDATE carrusel_sessions SET expires_at = 1', 'DELETE FROM carrusel_leads']) {
    const env = environment();
    const response = await register(env);
    env.sqlite.exec(sql);
    assert.equal((await download(env, cookieFrom(response))).status, 303);
  }
});

test('a missing archive gives a retryable error instead of a partial download', async () => {
  const env = environment();
  const response = await register(env);
  env.files.delete('test/02');
  assert.equal((await download(env, cookieFrom(response))).status, 503);
});

test('rate limit stops repeated submissions without adding further leads', async () => {
  const env = environment();
  for (let i = 0; i < 10; i++) assert.equal((await register(env)).status, 201);
  assert.equal((await register(env)).status, 429);
  assert.equal(env.sqlite.prepare('SELECT count(*) AS n FROM carrusel_leads').get().n, 10);
});

test('public pages remain available and unsupported methods are rejected', async () => {
  const env = environment();
  assert.equal(await (await worker.fetch(new Request('https://danielfeyto.com/'), env)).text(), 'Public page');
  assert.equal((await download(env, '', 'POST')).status, 405);
  assert.equal((await worker.fetch(new Request('https://danielfeyto.com/carruseles/registro'), env)).status, 405);
});

test('daily cleanup removes expired sessions, limits, and leads older than 180 days', async () => {
  const env = environment();
  await register(env);
  env.sqlite.exec('UPDATE carrusel_leads SET created_at = 1; UPDATE carrusel_rate_limits SET expires_at = 1');
  await worker.scheduled({}, env);
  for (const table of ['carrusel_leads', 'carrusel_sessions', 'carrusel_rate_limits']) assert.equal(env.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get().n, 0);
});
