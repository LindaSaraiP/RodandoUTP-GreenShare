'use strict';

/** Módulo Web Push de Rodando UTP, usa la misma base PostgreSQL y sesión del servidor. */
const webPush = require('web-push');
const { URL } = require('node:url');

const publicKey = process.env.VAPID_PUBLIC_KEY || '';
const privateKey = process.env.VAPID_PRIVATE_KEY || '';
const subject = process.env.VAPID_SUBJECT || 'mailto:admin@utpuebla.edu.mx';
const enabled = !!(publicKey && privateKey);
if (enabled) webPush.setVapidDetails(subject, publicKey, privateKey);
else console.warn('Web Push: faltan VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY. El buzón interno seguirá funcionando.');

function safeTarget(value) {
  const url = String(value || '/#avisos');
  // Solo rutas internas; evita open redirects y protocolos inseguros.
  return url.startsWith('/') && !url.startsWith('//') && !url.includes('\\') ? url.slice(0, 180) : '/#avisos';
}

function trustedEndpoint(endpoint) {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
    const host = u.hostname.toLowerCase();
    return host === 'fcm.googleapis.com' ||
      host === 'updates.push.services.mozilla.com' ||
      host === 'push.services.mozilla.com' ||
      host === 'web.push.apple.com' || host.endsWith('.push.apple.com') ||
      host.endsWith('.notify.windows.com') || host === 'wns.windows.com';
  } catch { return false; }
}

function createPushService({ pool, requireAuth, requireAdmin, requireCsrf, json, readBody, rateLimit }) {
  async function sendToSubscriptions(userId, payload) {
    if (!enabled) return { attempted: 0, accepted: 0, failed: 0 };
    const { rows } = await pool.query(
      'SELECT id, subscription FROM push_subscriptions WHERE user_id=$1', [userId]);
    let accepted = 0, failed = 0;
    await Promise.all(rows.map(async row => {
      try {
        await webPush.sendNotification(row.subscription, JSON.stringify(payload), { TTL: 3600, urgency: 'normal' });
        accepted++;
      } catch (error) {
        failed++;
        if ([404, 410].includes(error.statusCode)) {
          await pool.query('DELETE FROM push_subscriptions WHERE id=$1', [row.id]).catch(() => {});
        } else {
          console.error('Entrega Web Push rechazada:', error.statusCode || error.message);
        }
      }
    }));
    return { attempted: rows.length, accepted, failed };
  }

  async function notifyUser(userId, title, body, targetUrl = '/#avisos') {
    const cleanTitle = String(title).trim().slice(0, 90);
    const cleanBody = String(body).trim().slice(0, 230);
    if (!cleanTitle || !cleanBody) throw new Error('Título y mensaje requeridos.');
    const safeUrl = safeTarget(targetUrl);
    const inserted = (await pool.query(
      `INSERT INTO app_notifications (user_id, title, body, target_url)
       VALUES ($1,$2,$3,$4) RETURNING id`, [userId, cleanTitle, cleanBody, safeUrl])).rows[0];
    // Evitar información personal en la pantalla bloqueada; mensaje genérico.
    const delivery = await sendToSubscriptions(userId, {
      id: Number(inserted.id), title: cleanTitle, body: cleanBody,
      url: safeUrl, tag: `rodando-${inserted.id}`
    });
    return { id: Number(inserted.id), delivery };
  }

  async function handle(req, res, url, ip) {
    const route = url.pathname;
    if (!route.startsWith('/api/notifications')) return false;

    if (route === '/api/notifications/config' && req.method === 'GET') {
      json(res, 200, { enabled, publicKey: enabled ? publicKey : '' });
      return true;
    }
    const session = await requireAuth(req, res);
    if (!session) return true;
    const userId = Number(session.row.user_id);

    if (route === '/api/notifications' && req.method === 'GET') {
      const { rows } = await pool.query(
        `SELECT id, title, body, target_url AS "targetUrl", is_read AS "isRead", created_at AS "createdAt"
         FROM app_notifications WHERE user_id=$1 ORDER BY created_at DESC, id DESC LIMIT 50`, [userId]);
      const unread = (await pool.query('SELECT COUNT(*)::int AS n FROM app_notifications WHERE user_id=$1 AND NOT is_read', [userId])).rows[0].n;
      json(res, 200, { notifications: rows, unread }); return true;
    }
    const readMatch = route.match(/^\/api\/notifications\/(\d+)\/read$/);
    if (readMatch && req.method === 'PATCH') {
      if (!requireCsrf(req, res, session)) return true;
      await pool.query('UPDATE app_notifications SET is_read=TRUE WHERE id=$1 AND user_id=$2', [readMatch[1], userId]);
      json(res, 200, { ok: true }); return true;
    }
    if (route === '/api/notifications/subscription' && req.method === 'POST') {
      if (!requireCsrf(req, res, session)) return true;
      if (!enabled) { json(res, 503, { error: 'Configura primero las claves VAPID en el servidor.' }); return true; }
      if (!rateLimit(`${ip}:${userId}`, 'push-sub', 12, 15*60000)) { json(res, 429, { error: 'Demasiados intentos.' }); return true; }
      const sub = await readBody(req);
      const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint : '';
      const keys = sub?.keys || {};
      if (!trustedEndpoint(endpoint) || endpoint.length > 1800 || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string' ||
          keys.p256dh.length > 350 || keys.auth.length > 150 || JSON.stringify(sub).length > 3500) {
        json(res, 400, { error: 'Suscripción push no válida o proveedor no soportado.' }); return true;
      }
      await pool.query(`INSERT INTO push_subscriptions (user_id, endpoint, subscription, created_at)
        VALUES ($1,$2,$3::jsonb,NOW())
        ON CONFLICT (endpoint) DO UPDATE SET user_id=EXCLUDED.user_id, subscription=EXCLUDED.subscription`,
      [userId, endpoint, JSON.stringify({ endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } })]);
      json(res, 201, { ok: true }); return true;
    }
    if (route === '/api/notifications/subscription' && req.method === 'DELETE') {
      if (!requireCsrf(req, res, session)) return true;
      const { endpoint } = await readBody(req);
      if (typeof endpoint !== 'string' || endpoint.length > 1800) {
        json(res, 400, { error: 'Endpoint inválido.' }); return true;
      }
      await pool.query('DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2', [userId, endpoint]);
      json(res, 200, { ok: true }); return true;
    }
    if (route === '/api/notifications/test' && req.method === 'POST') {
      if (!requireCsrf(req, res, session)) return true;
      if (!rateLimit(`${ip}:${userId}`, 'push-test', 3, 10*60000)) { json(res, 429, { error: 'Puedes enviar hasta 3 pruebas cada 10 minutos.' }); return true; }
      const out = await notifyUser(userId, 'Rodando UTP: notificación de prueba',
        'Las notificaciones están listas. Consulta el centro de avisos.', '/#avisos');
      json(res, 200, { ok: true, id: out.id, delivery: out.delivery }); return true;
    }
    if (route === '/api/notifications/admin/broadcast' && req.method === 'POST') {
      // Verificar rol con la sesión ya cargada, sin volver a consultar la BD.
      if (session.row.role !== 'admin') { json(res, 403, { error: 'Solo administradores.' }); return true; }
      if (!requireCsrf(req, res, session)) return true;
      if (!rateLimit(`${ip}:${userId}`, 'push-broadcast', 2, 60*60000)) { json(res, 429, { error: 'Máximo 2 avisos generales por hora.' }); return true; }
      const payload = await readBody(req);
      const title = String(payload?.title || '').trim().slice(0, 90);
      const body = String(payload?.body || '').trim().slice(0, 230);
      if (title.length < 4 || body.length < 8) { json(res, 400, { error: 'Título o mensaje demasiado cortos.' }); return true; }
      const { rows } = await pool.query('SELECT id FROM users ORDER BY id LIMIT 200');
      let delivered = 0;
      for (const user of rows) {
        const result = await notifyUser(user.id, title, body, '/#avisos');
        delivered += result.delivery.accepted;
      }
      json(res, 200, { ok: true, recipients: rows.length, acceptedByPushServices: delivered }); return true;
    }
    json(res, 404, { error: 'Operación de notificaciones desconocida.' });
    return true;
  }

  return { handle, notifyUser };
}
module.exports = { createPushService };
