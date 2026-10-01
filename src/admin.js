const BASE = '/carruseles/panel';
const COOKIE = '__Secure-carruseles-admin';
const LIFETIME = 30 * 86400;
const HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};
const now = () => Math.floor(Date.now() / 1000);
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const hash = async value => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { ...HEADERS, ...headers } });
const cookieHeader = (token, age = LIFETIME) => `${COOKIE}=${token}; Path=${BASE}; Max-Age=${age}; HttpOnly; Secure; SameSite=Strict`;
function tokenFrom(request) {
  return (request.headers.get('Cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) || '';
}
async function authorized(request, env) {
  const token = tokenFrom(request);
  if (!/^[a-f0-9]{64}$/.test(token) || !/^[a-f0-9]{64}$/.test(env.ADMIN_KEY_HASH || '')) return false;
  return Boolean(await env.DB.prepare('SELECT token_hash FROM carrusel_admin_sessions WHERE token_hash = ? AND key_version = ? AND expires_at > ?')
    .bind(await hash(token), env.ADMIN_KEY_HASH, now()).first());
}
function equal(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}
async function login(request, env) {
  if (!/^[a-f0-9]{64}$/.test(env.ADMIN_KEY_HASH || '')) return json({ error: 'El acceso aún no está configurado.' }, 503);
  const window = Math.floor(now() / 900);
  const bucket = await hash(`admin:${window}:${request.headers.get('CF-Connecting-IP') || 'unknown'}`);
  const rate = await env.DB.prepare(`INSERT INTO carrusel_rate_limits (bucket,hits,expires_at) VALUES (?,1,?)
    ON CONFLICT(bucket) DO UPDATE SET hits=hits+1 RETURNING hits`).bind(bucket, (window + 1) * 900).first();
  if (rate.hits > 10) return json({ error: 'Demasiados intentos. Vuelve a probar dentro de 15 minutos.' }, 429, { 'Retry-After': '900' });
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'Solicitud no válida.' }, 415);
  if (!request.body || Number(request.headers.get('Content-Length')) > 4096) return json({ error: 'Solicitud demasiado grande.' }, 413);
  const reader = request.body.getReader();
  const chunks = []; let length = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > 4096) { await reader.cancel(); return json({ error: 'Solicitud demasiado grande.' }, 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let data;
  try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch { return json({ error: 'Solicitud no válida.' }, 400); }
  if (typeof data?.key !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(data.key) || !equal(await hash(data.key), env.ADMIN_KEY_HASH)) {
    return json({ error: 'La clave no es correcta.' }, 401);
  }
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare('INSERT INTO carrusel_admin_sessions (token_hash,key_version,expires_at) VALUES (?,?,?)')
    .bind(await hash(token), env.ADMIN_KEY_HASH, now() + LIFETIME).run();
  return json({ access: true }, 200, { 'Set-Cookie': cookieHeader(token) });
}

function filters(url) {
  const q = (url.searchParams.get('q') || '').trim();
  const page = Number(url.searchParams.get('page') || 1);
  if (q.length > 160 || !Number.isSafeInteger(page) || page < 1 || page > 1000000) return null;
  const columns = ['nombre', 'email', 'whatsapp', 'instagram', 'que_vendes', 'objetivo'];
  const needle = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
  return { page, where: q ? '(' + columns.map(column => `${column} LIKE ? ESCAPE '\\'`).join(' OR ') + ')' : '1=1', values: q ? columns.map(() => needle) : [] };
}
const FIELDS = 'id,nombre,email,whatsapp,instagram,que_vendes,facturacion,objetivo,consent_version,created_at';
async function list(env, filter) {
  const stats = await env.DB.prepare('SELECT COUNT(*) AS total, COALESCE(SUM(created_at >= ?),0) AS day, COALESCE(SUM(created_at >= ?),0) AS week FROM carrusel_leads')
    .bind(now() - 86400, now() - 7 * 86400).first();
  const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM carrusel_leads WHERE ${filter.where}`).bind(...filter.values).first();
  const result = await env.DB.prepare(`SELECT ${FIELDS} FROM carrusel_leads WHERE ${filter.where} ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET ?`)
    .bind(...filter.values, (filter.page - 1) * 50).all();
  return json({ leads: result.results, total: count.total, page: filter.page, pageSize: 50, stats });
}
const csvCell = value => '"' + String(value ?? '').replace(/^(?=[\s\uFEFF]*[=+@-]|[\t\r\n])/, "'").replaceAll('"', '""') + '"';
async function exportCSV(env, filter) {
  const headings = ['Nombre', 'Email', 'WhatsApp', 'Instagram', 'Qué vende', 'Facturación', 'Objetivo', 'Consentimiento', 'Fecha UTC'];
  const encoder = new TextEncoder(); let cursor = null, first = true;
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        if (first) { controller.enqueue(encoder.encode('\uFEFF' + headings.map(csvCell).join(',') + '\r\n')); first = false; return; }
        const extra = cursor ? ' AND (created_at < ? OR (created_at = ? AND id < ?))' : '';
        const values = cursor ? [cursor.created_at, cursor.created_at, cursor.id] : [];
        const { results } = await env.DB.prepare(`SELECT ${FIELDS} FROM carrusel_leads WHERE ${filter.where}${extra} ORDER BY created_at DESC,id DESC LIMIT 500`)
          .bind(...filter.values, ...values).all();
        if (!results.length) { controller.close(); return; }
        controller.enqueue(encoder.encode(results.map(row => [row.nombre, row.email, row.whatsapp, row.instagram, row.que_vendes, row.facturacion, row.objetivo, row.consent_version, new Date(row.created_at * 1000).toISOString()].map(csvCell).join(',')).join('\r\n') + '\r\n'));
        cursor = results.at(-1);
        if (results.length < 500) controller.close();
      } catch (error) { controller.error(new Error('No se ha podido completar la exportación.')); }
    },
  });
  return new Response(stream, { headers: { ...HEADERS, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="carruseles-contactos-${new Date().toISOString().slice(0, 10)}.csv"` } });
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const route = url.pathname.replace(/\/+$/, '').slice(BASE.length);
      if (route.startsWith('/api/')) {
        const post = ['/api/login', '/api/logout'].includes(route);
        if (request.method !== (post ? 'POST' : 'GET')) return json({ error: 'Método no permitido.' }, 405);
        if (post && request.headers.get('Origin') !== url.origin) return json({ error: 'Abre el panel desde su enlace original.' }, 403);
        if (route === '/api/login') return await login(request, env);
        if (!await authorized(request, env)) return json({ error: 'Introduce tu clave para entrar.' }, 401);
        if (route === '/api/me') return json({ access: true });
        if (route === '/api/logout') {
          await env.DB.prepare('DELETE FROM carrusel_admin_sessions WHERE token_hash = ?').bind(await hash(tokenFrom(request))).run();
          return json({ access: false }, 200, { 'Set-Cookie': cookieHeader('', 0) });
        }
        const filter = filters(url);
        if (!filter) return json({ error: 'Revisa la búsqueda o la página solicitada.' }, 400);
        if (route === '/api/leads') return await list(env, filter);
        if (route === '/api/export') return await exportCSV(env, filter);
        return json({ error: 'No encontrado.' }, 404);
      }
      const asset = await env.ASSETS.fetch(request);
      const response = new Response(asset.body, asset);
      for (const [name, value] of Object.entries(HEADERS)) response.headers.set(name, value);
      return response;
    } catch {
      return json({ error: 'No se ha podido completar la solicitud. Vuelve a intentarlo.' }, 503);
    }
  },
};
