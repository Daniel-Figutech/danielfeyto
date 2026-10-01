(() => {
  const $ = id => document.getElementById(id);
  const API = '/carruseles/panel/api/';
  const format = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' });
  const number = new Intl.NumberFormat('es');
  let active = false, page = 1, query = '', total = 0, sequence = 0;
  async function api(route, options = {}) {
    const response = await fetch(API + route, { credentials: 'same-origin', cache: 'no-store', ...options });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const error = new Error(data.error || 'No se ha podido completar la solicitud.'); error.status = response.status; throw error;
    }
    return response;
  }
  const post = (route, data = {}) => api(route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  function notice(id, message) { $(id).textContent = message; $(id).hidden = !message; }
  function signedOut(message = '') {
    active = false; sequence++;
    $('dashboard').hidden = true; $('login').hidden = false; $('boot').hidden = true;
    $('rows').replaceChildren(); $('answers').replaceChildren(); $('contact-links').replaceChildren();
    $('details-name').textContent = ''; $('details-date').textContent = '';
    for (const id of ['total', 'day', 'week']) $(id).textContent = '—';
    if ($('details').open) $('details').close();
    notice('login-error', message);
  }
  function signedIn() {
    active = true; $('login').hidden = true; $('dashboard').hidden = false; $('boot').hidden = true;
    $('key').value = ''; notice('login-error', ''); $('panel-title').focus({ preventScroll: true });
    load();
  }
  async function signIn(key) {
    $('login-button').disabled = true; $('login-button').textContent = 'Entrando…'; notice('login-error', '');
    try { await post('login', { key }); await api('me'); signedIn(); }
    catch (error) { signedOut(error.message); }
    finally { $('login-button').disabled = false; $('login-button').textContent = 'Entrar al panel ↗'; }
  }
  function text(tag, value, className) {
    const element = document.createElement(tag); element.textContent = value;
    if (className) element.className = className; return element;
  }
  function link(label, href, className) {
    const element = text('a', label, className); element.href = href; element.rel = 'noopener noreferrer'; return element;
  }
  function showDetails(lead) {
    $('details-name').textContent = lead.nombre;
    $('details-date').textContent = 'Registro: ' + format.format(new Date(lead.created_at * 1000));
    const whatsapp = link('Abrir WhatsApp ↗', 'https://wa.me/' + lead.whatsapp.replace(/\D/g, '')); whatsapp.target = '_blank';
    $('contact-links').replaceChildren(whatsapp, link('Escribir email ↗', 'mailto:' + encodeURIComponent(lead.email)));
    $('answers').replaceChildren();
    for (const [label, value] of [['Email', lead.email], ['WhatsApp', lead.whatsapp], ['Instagram', lead.instagram || 'No indicado'], ['Qué vende y a quién', lead.que_vendes], ['Facturación mensual', lead.facturacion], ['Qué quiere conseguir', lead.objetivo], ['Consentimiento', 'Aceptó gestionar la descarga · ' + lead.consent_version]]) {
      const group = document.createElement('div'); group.append(text('dt', label), text('dd', value)); $('answers').append(group);
    }
    $('details').showModal();
  }
  function render(data) {
    total = data.total;
    for (const field of ['total', 'day', 'week']) $(field).textContent = number.format(data.stats[field]);
    $('rows').replaceChildren();
    for (const lead of data.leads) {
      const row = document.createElement('tr'); const identity = document.createElement('td');
      identity.append(text('span', lead.nombre, 'name'), link(lead.email, 'mailto:' + encodeURIComponent(lead.email), 'email'));
      row.append(identity, text('td', lead.whatsapp), text('td', lead.facturacion), text('td', format.format(new Date(lead.created_at * 1000))));
      const action = document.createElement('td'); const button = text('button', 'Ver ficha ↗', 'view');
      button.setAttribute('aria-label', 'Ver ficha de ' + lead.nombre); button.addEventListener('click', () => showDetails(lead)); action.append(button); row.append(action); $('rows').append(row);
    }
    $('table-wrap').hidden = !data.leads.length; $('empty').hidden = Boolean(data.leads.length);
    $('empty-title').textContent = query ? 'No hay contactos con esa búsqueda.' : 'Tu próximo contacto empieza aquí.';
    $('empty-text').textContent = query ? 'Prueba con otro nombre, email, teléfono o negocio.' : 'Cuando alguien complete el formulario de carruseles, aparecerá en esta lista.';
    $('results').textContent = number.format(total) + (total === 1 ? ' contacto' : ' contactos') + (query ? (total === 1 ? ' encontrado' : ' encontrados') : ' · más recientes primero');
    $('page').textContent = `Página ${page} de ${Math.max(1, Math.ceil(total / 50))}`;
    $('previous').disabled = page <= 1; $('next').disabled = page * 50 >= total;
    $('updated').textContent = 'Actualizado: ' + new Intl.DateTimeFormat('es', { timeStyle: 'short' }).format(new Date());
    $('export').disabled = !total;
  }
  async function load() {
    const requestId = ++sequence; notice('panel-error', ''); $('list').setAttribute('aria-busy', 'true'); $('list').classList.add('loading');
    $('results').textContent = 'Cargando contactos…'; $('refresh').disabled = true;
    try {
      const data = await (await api('leads?' + new URLSearchParams({ q: query, page }))).json();
      if (requestId !== sequence || !active) return;
      if (page > 1 && !data.leads.length) { page = 1; return load(); }
      render(data);
    } catch (error) {
      if (requestId !== sequence) return;
      if (error.status === 401) return signedOut('Tu sesión ha caducado. Vuelve a entrar con tu clave.');
      notice('panel-error', error.message + ' Pulsa Actualizar para volver a intentarlo.'); $('results').textContent = 'No se han podido actualizar los contactos.';
    } finally {
      if (requestId === sequence) { $('list').setAttribute('aria-busy', 'false'); $('list').classList.remove('loading'); $('refresh').disabled = false; }
    }
  }
  $('login-form').addEventListener('submit', event => { event.preventDefault(); signIn($('key').value.trim()); });
  $('search-form').addEventListener('submit', event => { event.preventDefault(); query = $('search').value.trim(); page = 1; load(); });
  $('search').addEventListener('search', () => { if (!$('search').value) { query = ''; page = 1; load(); } });
  $('refresh').addEventListener('click', load);
  $('previous').addEventListener('click', () => { if (page > 1) { page--; load(); } });
  $('next').addEventListener('click', () => { if (page * 50 < total) { page++; load(); } });
  $('logout').addEventListener('click', async () => {
    $('logout').disabled = true;
    try { await post('logout'); signedOut(); $('key').focus(); }
    catch (error) { if (error.status === 401) signedOut(); else notice('panel-error', error.message); }
    finally { $('logout').disabled = false; }
  });
  $('close-details').addEventListener('click', () => $('details').close());
  $('export').addEventListener('click', async () => {
    $('export').disabled = true; $('export').textContent = 'Preparando CSV…';
    try {
      const response = await api('export?' + new URLSearchParams({ q: query }));
      const url = URL.createObjectURL(await response.blob()); const download = document.createElement('a');
      download.href = url; download.download = 'carruseles-contactos-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.append(download); download.click(); download.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (error) { if (error.status === 401) signedOut('Vuelve a entrar para descargar el CSV.'); else notice('panel-error', error.message); }
    finally { $('export').textContent = 'Descargar CSV ↓'; $('export').disabled = !total; }
  });
  window.addEventListener('pageshow', event => { if (event.persisted) { signedOut(); start(); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && active) load(); });
  async function start() {
    // A fragment never reaches the HTTP server or referrers. Remove it before authenticating.
    let incoming = new URLSearchParams(location.hash.slice(1)).get('key');
    if (location.hash) history.replaceState(null, '', location.pathname);
    if (incoming) { await signIn(incoming); incoming = ''; return; }
    try { await api('me'); signedIn(); }
    catch (error) { signedOut(error.status === 401 ? '' : error.message); }
  }
  start();
})();
