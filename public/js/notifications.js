'use strict';
/* Módulo autónomo: recibe el usuario y CSRF desde el JavaScript principal. */
(() => {
  const q = selector => document.querySelector(selector);
  const section = q('#avisos');
  const button = q('#notificationsNav');
  const status = q('#notificationStatus');
  const unread = q('#notificationUnread');
  const list = q('#notificationList');
  const enable = q('#enablePush');
  const disable = q('#disablePush');
  const test = q('#sendPushTest');
  const adminBox = q('#adminPushBox');
  const broadcastForm = q('#broadcastForm');
  let user = null, csrf = '', publicKey = '', available = false;

  function setStatus(message, error = false) {
    status.textContent = message;
    status.style.color = error ? '#a13535' : '';
  }
  async function request(path, opts = {}) {
    const method = opts.method || 'GET';
    const headers = { ...(opts.headers || {}) };
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    if (method !== 'GET' && csrf) headers['X-CSRF-Token'] = csrf;
    const res = await fetch(path, { ...opts, headers, method, credentials: 'same-origin' });
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) throw new Error(data.error || `Error HTTP ${res.status}`);
    return data;
  }
  function urlSafeBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from(rawData, c => c.charCodeAt(0));
  }
  function formatDate(v) { return new Date(v).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }); }
  function buildCard(n) {
    const article = document.createElement('article');
    article.className = `aviso-item${n.isRead ? ' aviso-leido' : ''}`;
    const left = document.createElement('div');
    const title = document.createElement('strong'); title.textContent = n.title;
    const body = document.createElement('p'); body.textContent = n.body;
    const time = document.createElement('small'); time.textContent = formatDate(n.createdAt);
    left.append(title, body, time);
    const actions = document.createElement('div'); actions.className = 'aviso-actions';
    const link = document.createElement('a'); link.href = n.targetUrl || '/#avisos'; link.textContent = 'Ver'; link.className='pill-btn outline mini';
    actions.append(link);
    if (!n.isRead) {
      const mark = document.createElement('button'); mark.type='button'; mark.className='pill-btn outline mini'; mark.textContent='Marcar leído';
      mark.addEventListener('click', async () => {
        try { await request(`/api/notifications/${n.id}/read`, { method:'PATCH' }); await refresh(); }
        catch (e) { setStatus(e.message, true); }
      });
      actions.append(mark);
    }
    article.append(left, actions);
    return article;
  }
  async function refresh() {
    if (!user) return;
    try {
      const data = await request('/api/notifications');
      list.replaceChildren();
      if (!data.notifications.length) {
        const empty = document.createElement('p'); empty.className='helper'; empty.textContent='Todavía no tienes avisos. Envía una notificación de prueba para comenzar.'; list.append(empty);
      }
      for (const n of data.notifications) list.append(buildCard(n));
      const count = Number(data.unread || 0);
      unread.textContent = count ? ` (${count})` : '';
      unread.hidden = count === 0;
    } catch (e) { setStatus(e.message, true); }
  }
  async function setSession(detail) {
    user = detail?.user || null;
    csrf = detail?.csrfToken || '';
    section.hidden = !user;
    button.hidden = !user;
    adminBox.hidden = !user || user.role !== 'admin';
    list.replaceChildren(); unread.textContent=''; unread.hidden=true;
    if (!user) return;
    setStatus('Puedes activar los avisos para este dispositivo y ver los mensajes en esta bandeja.');
    try {
      const config = await request('/api/notifications/config');
      publicKey = config.publicKey; available = !!config.enabled;
      const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
      enable.disabled = !supported || !available;
      if (!available) setStatus('El centro de avisos está listo, pero falta configurar las claves VAPID en el servidor.', true);
      else if (!supported) setStatus('Este navegador no admite Push o necesitas HTTPS/localhost. El centro de avisos sí funciona.', true);
    } catch(e) { setStatus(e.message, true); }
    await refresh();
  }
  async function enableNotifications() {
    if (!user) return;
    try {
      if (!available) throw new Error('Las claves VAPID no están configuradas.');
      // Debe ejecutarse directamente tras un clic real del usuario.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Permiso no concedido. Puedes cambiarlo en la configuración del navegador.');
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlSafeBase64ToUint8Array(publicKey)
      });
      await request('/api/notifications/subscription', { method:'POST', body: subscription.toJSON() });
      setStatus('Notificaciones activadas para este dispositivo. Prueba el botón de envío.');
    } catch (e) { setStatus(e.message, true); }
  }
  async function disconnectCurrentUser() {
    if (!user || !('serviceWorker' in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager?.getSubscription();
      if (!subscription) return;
      await request('/api/notifications/subscription', { method:'DELETE', body: { endpoint: subscription.endpoint } });
      await subscription.unsubscribe();
      setStatus('Notificaciones desactivadas para este dispositivo.');
    } catch(e) { setStatus('No fue posible desactivar las notificaciones: ' + e.message, true); }
  }
  enable.addEventListener('click', enableNotifications);
  disable.addEventListener('click', disconnectCurrentUser);
  test.addEventListener('click', async () => {
    try {
      test.disabled = true;
      const result = await request('/api/notifications/test', { method:'POST' });
      const num = result.delivery?.accepted || 0;
      setStatus(num ? `Mensaje guardado y aceptado por ${num} servicio(s) push.` : 'Mensaje guardado en el buzón. Para mostrarlo fuera de la app activa las notificaciones.');
      await refresh();
    } catch(e) { setStatus(e.message, true); }
    finally { test.disabled = false; }
  });
  broadcastForm?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!user || user.role !== 'admin') return;
    const form = new FormData(broadcastForm);
    if (!confirm('¿Enviar este aviso a todos los usuarios registrados?')) return;
    try {
      const result = await request('/api/notifications/admin/broadcast', { method: 'POST', body: { title: form.get('title'), body: form.get('body') } });
      setStatus(`Aviso enviado al buzón de ${result.recipients} usuarios. ${result.acceptedByPushServices} entregas aceptadas por servicios push.`);
      broadcastForm.reset(); await refresh();
    } catch(e) { setStatus(e.message, true); }
  });
  window.addEventListener('rodando:session', e => { setSession(e.detail); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  navigator.serviceWorker?.addEventListener('message', event => {
    if (event.data?.type === 'RODANDO_PUSH_RECEIVED') refresh();
  });
  button.addEventListener('click', () => { section.scrollIntoView({ behavior: 'smooth' }); refresh(); });
  window.RodandoPush = { disconnectCurrentUser, refresh };
})();
