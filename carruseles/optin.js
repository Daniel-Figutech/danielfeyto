(() => {
  const dialog = document.getElementById('pedir');
  const form = document.getElementById('pf');
  if (!dialog || !form || typeof dialog.showModal !== 'function') return;
  const panel = dialog.querySelector('.ws__panel');
  const success = document.getElementById('ws-ok');
  const notice = document.getElementById('pf-aviso');
  const submit = form.querySelector('[type="submit"]');
  const submitText = document.getElementById('pf-enviar-texto');
  const triggers = document.querySelectorAll('.cta[aria-controls="pedir"]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let closeTimer, pointerInside, opener;

  function showDownload() {
    panel.classList.add('is-done');
    if (dialog.open) success.focus({ preventScroll: true });
  }
  async function checkAccess() {
    const response = await fetch('/carruseles/acceso', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) return false;
    return (await response.json()).access === true;
  }
  function open(event) {
    if (event) { event.preventDefault(); opener = event.currentTarget; }
    if (dialog.open) return;
    clearTimeout(closeTimer);
    dialog.classList.remove('is-out');
    dialog.inert = false;
    dialog.showModal();
    dialog.scrollTop = 0;
    document.documentElement.classList.add('ws-open');
    requestAnimationFrame(() => dialog.classList.add('is-in'));
    checkAccess().then(allowed => { if (allowed) showDownload(); }).catch(() => {});
  }
  function close() {
    if (!dialog.open || dialog.classList.contains('is-out')) return;
    dialog.classList.remove('is-in');
    dialog.classList.add('is-out');
    closeTimer = setTimeout(() => {
      dialog.close();
      dialog.inert = true;
      dialog.classList.remove('is-out');
      document.documentElement.classList.remove('ws-open');
      opener?.focus();
    }, reduced ? 0 : 260);
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled || !form.reportValidity()) return;
    notice.hidden = true;
    submit.disabled = true;
    submitText.textContent = 'Guardando tus datos…';
    form.setAttribute('aria-busy', 'true');
    const data = Object.fromEntries(new FormData(form));
    data.consent = form.elements.consent.checked;
    try {
      const response = await fetch('/carruseles/registro', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se ha podido guardar el registro. Inténtalo de nuevo.');
      if (!await checkAccess()) throw new Error('Tu registro está guardado. Permite las cookies de esta web y vuelve a enviar para activar la descarga.');
      showDownload();
    } catch (error) {
      notice.textContent = error instanceof TypeError ? 'No se ha podido conectar. Comprueba tu conexión e inténtalo de nuevo.' : error.message;
      notice.hidden = false;
    } finally {
      submit.disabled = false;
      submitText.textContent = 'Descargar la IA gratis';
      form.removeAttribute('aria-busy');
    }
  });
  triggers.forEach(trigger => trigger.addEventListener('click', open));
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.querySelector('.ws__close').addEventListener('click', close);
  dialog.querySelector('.ws__back').addEventListener('click', close);
  dialog.addEventListener('pointerdown', event => { pointerInside = panel.contains(event.target); });
  dialog.addEventListener('click', event => { if (pointerInside === false && !panel.contains(event.target)) close(); pointerInside = null; });
  if (new URLSearchParams(location.search).get('registro') === '1') open();
})();
