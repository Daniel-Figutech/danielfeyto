const COOKIE = '__Secure-carruseles';
const SESSION_SECONDS = 86400;
const BODY_LIMIT = 16384;
const RANGES = ['Menos de 5.000 €', 'De 5.000 a 20.000 €', 'De 20.000 a 50.000 €', 'Más de 50.000 €'];
const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000',
};
const now = () => Math.floor(Date.now() / 1000);
const json = (body, status = 200, headers = {}) => Response.json(body, { status, headers: { ...PRIVATE_HEADERS, ...headers } });
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const hash = async text => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));

async function readBody(request) {
  if (Number(request.headers.get('Content-Length')) > BODY_LIMIT) throw 413;
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw 415;
  if (!request.body) throw 400;
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > BODY_LIMIT) { await reader.cancel(); throw 413; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw 400; }
}

function validate(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.consent !== true || data.website) return null;
  const limits = { nombre: 100, email: 254, whatsapp: 40, instagram: 100, que_vendes: 2000, facturacion: 40, objetivo: 2000 };
  const fields = {};
  for (const [key, max] of Object.entries(limits)) {
    if (typeof data[key] !== 'string') return null;
    fields[key] = data[key].trim();
    if (fields[key].length > max || (!fields[key] && key !== 'instagram')) return null;
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(fields[key])) return null;
  }
  fields.email = fields.email.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) return null;
  if (!/^\+?[\d\s().-]+$/.test(fields.whatsapp) || !/^\d{7,15}$/.test(fields.whatsapp.replace(/\D/g, ''))) return null;
  return RANGES.includes(fields.facturacion) ? fields : null;
}

async function register(request, env) {
  if (request.headers.get('Origin') !== new URL(request.url).origin) return json({ error: 'Vuelve a abrir el formulario desde esta página.' }, 403);
  let data;
  try { data = await readBody(request); }
  catch (status) { return json({ error: 'No se ha podido leer el formulario. Revisa los datos.' }, typeof status === 'number' ? status : 400); }
  const fields = validate(data);
  if (!fields) return json({ error: 'Revisa los campos obligatorios y acepta el uso de tus datos para recibir la descarga.' }, 422);
  const timestamp = now();
  const window = Math.floor(timestamp / 900);
  // Only a short-lived hash is stored; never the visitor's raw IP address.
  const bucket = await hash(`${window}:${request.headers.get('CF-Connecting-IP') || 'unknown'}`);
  const rate = await env.DB.prepare(`INSERT INTO carrusel_rate_limits (bucket, hits, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(bucket) DO UPDATE SET hits = hits + 1 RETURNING hits`).bind(bucket, (window + 1) * 900).first();
  if (rate.hits > 10) return json({ error: 'Has enviado varias solicitudes. Inténtalo de nuevo en unos minutos.' }, 429, { 'Retry-After': '900' });

  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  const leadId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO carrusel_leads
      (id, nombre, email, whatsapp, instagram, que_vendes, facturacion, objetivo, consent_version, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(leadId, fields.nombre, fields.email, fields.whatsapp, fields.instagram,
        fields.que_vendes, fields.facturacion, fields.objetivo, 'carruseles-2026-10-01', timestamp),
    env.DB.prepare('INSERT INTO carrusel_sessions (token_hash, lead_id, expires_at) VALUES (?, ?, ?)')
      .bind(await hash(token), leadId, timestamp + SESSION_SECONDS),
  ]);
  // The browser only receives its session after both writes succeed atomically.
  return json({ download: '/carruseles/descargar' }, 201, {
    'Set-Cookie': `${COOKIE}=${token}; Path=/carruseles; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Lax`,
  });
}

async function hasAccess(request, env) {
  const token = (request.headers.get('Cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return false;
  return Boolean(await env.DB.prepare(`SELECT s.lead_id FROM carrusel_sessions s
    JOIN carrusel_leads l ON l.id = s.lead_id WHERE s.token_hash = ? AND s.expires_at > ?`).bind(await hash(token), now()).first());
}

function joinStreams(streams) {
  let index = 0;
  let reader = streams[0].getReader();
  return new ReadableStream({
    async pull(controller) {
      try {
        while (index < streams.length) {
          const { done, value } = await reader.read();
          if (!done) { controller.enqueue(value); return; }
          reader.releaseLock();
          index++;
          if (index < streams.length) reader = streams[index].getReader();
        }
        controller.close();
      } catch (error) { controller.error(error); }
    },
    async cancel(reason) {
      if (index < streams.length) await reader.cancel(reason);
      await Promise.all(streams.slice(index + 1).map(s => s.cancel(reason)));
    },
  });
}

async function download(request, env) {
  if (!await hasAccess(request, env)) return new Response(null, { status: 303, headers: { ...PRIVATE_HEADERS, Location: '/carruseles/?registro=1' } });
  const manifest = await env.DOWNLOADS.get('manifest.json', 'json');
  if (!manifest || !Array.isArray(manifest.parts) || !manifest.parts.length || !Number.isSafeInteger(manifest.size) || manifest.size <= 0) throw new Error('Archive unavailable');
  const headers = {
    ...PRIVATE_HEADERS, 'Content-Type': 'application/zip', 'Content-Length': String(manifest.size),
    'Content-Disposition': 'attachment; filename="IA-Carruseles-Aesthetic.zip"',
    'Accept-Ranges': 'none', 'ETag': `"${manifest.sha256}"`, 'Vary': 'Cookie',
  };
  if (request.method === 'HEAD') return new Response(null, { headers });
  // KV parts have no public URL. Only this authenticated route can read them.
  const streams = await Promise.all(manifest.parts.map(key => env.DOWNLOADS.get(key, 'stream')));
  if (streams.some(stream => !stream)) {
    await Promise.all(streams.filter(Boolean).map(stream => stream.cancel()));
    throw new Error('Archive incomplete');
  }
  let body = joinStreams(streams);
  if (typeof FixedLengthStream !== 'undefined') {
    const fixed = new FixedLengthStream(manifest.size);
    body.pipeTo(fixed.writable).catch(() => {}); // An aborted transfer already errors the readable side.
    body = fixed.readable;
  }
  return new Response(body, { headers });
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    const method = request.method;
    try {
      if (path === '/carruseles/registro') {
        if (method !== 'POST') return json({ error: 'Método no permitido.' }, 405, { Allow: 'POST' });
        return await register(request, env);
      }
      if (path === '/carruseles/descargar' || path === '/carruseles/acceso') {
        if (!['GET', 'HEAD'].includes(method)) return json({ error: 'Método no permitido.' }, 405, { Allow: 'GET, HEAD' });
        if (path === '/carruseles/acceso') return json({ access: await hasAccess(request, env) });
        return await download(request, env);
      }
      return env.ASSETS.fetch(request);
    } catch {
      return json({ error: 'No hemos podido completar la solicitud. Inténtalo de nuevo en unos minutos.' }, 503);
    }
  },
  async scheduled(event, env) {
    const timestamp = now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM carrusel_sessions WHERE expires_at <= ?').bind(timestamp),
      env.DB.prepare('DELETE FROM carrusel_rate_limits WHERE expires_at <= ?').bind(timestamp),
      env.DB.prepare('DELETE FROM carrusel_leads WHERE created_at <= ?').bind(timestamp - 180 * 86400),
    ]);
  },
};
