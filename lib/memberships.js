'use strict';

// Membresía Rodando Plus con pago SIMULADO. No se recibe ni se guarda el número de tarjeta.
const PLANS = {
  'plus-mensual': { name: 'Rodando Plus · Mensual', cents: 4900, days: 30 },
  'plus-cuatrimestral': { name: 'Rodando Plus · Cuatrimestral', cents: 14900, days: 120 }
};
const MAX_PURCHASES_PER_DAY = 5;

function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function longDate(value) {
  return new Date(value).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Mexico_City' });
}
function money(cents) { return `$${(Number(cents) / 100).toFixed(2)} MXN`; }

function publicMembership(row) {
  if (!row) return null;
  return { folio: row.folio, plan: row.plan, planName: PLANS[row.plan]?.name || row.plan, amountCents: Number(row.amount_cents),
    cardLast4: row.card_last4, startsAt: row.starts_at, expiresAt: row.expires_at, status: row.status,
    emailStatus: row.email_status, receiptUrl: `/api/membership/receipt/${row.receipt_token}` };
}

function receiptHtml(row) {
  const rows = [['Folio', row.folio], ['Nombre', row.name], ['Correo', row.email], ['Plan', PLANS[row.plan]?.name || row.plan],
    ['Tarjeta', `•••• ${row.card_last4}`], ['Fecha de compra', longDate(row.starts_at)], ['Vigente hasta', longDate(row.expires_at)],
    ['Estado', row.status === 'active' ? 'Activa' : row.status === 'cancelled' ? 'Cancelada' : 'Vencida']];
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer"><meta name="robots" content="noindex"><title>Recibo ${escapeHtml(row.folio)}</title><style>
body{margin:0;background:#f6fbf6;font:16px system-ui,sans-serif;color:#173126;padding:24px 16px}main{max-width:520px;margin:auto;background:#fff;border:1px solid #dbeadf;border-radius:24px;overflow:hidden}
header{background:#1e7b46;color:#fff;padding:22px 26px}section{padding:26px}h1{margin:0 0 6px;font-size:1.4rem}.total{font-size:2.3rem;font-weight:800;margin:10px 0}
table{width:100%;border-collapse:collapse}td,th{padding:9px 0;border-bottom:1px dashed #dbeadf;text-align:left;font-size:.92rem}th{text-align:right;overflow-wrap:anywhere}td{color:#5d7563;padding-right:14px;white-space:nowrap}
.sim{background:#eef9c5;border:1px dashed #58b86c;border-radius:14px;padding:12px 14px;margin-top:18px;font-size:.86rem}</style></head><body><main>
<header><strong>Rodando UTP</strong> · GreenShare</header><section><h1>¡Gracias por tu compra!</h1><div class="total">${money(row.amount_cents)}</div>
<table>${rows.map(([a, b]) => `<tr><td>${escapeHtml(a)}</td><th>${escapeHtml(b)}</th></tr>`).join('')}</table>
<div class="sim"><b>Pago simulado.</b> Proyecto escolar: no se realizó ningún cargo. Sin validez fiscal. Para guardarlo usa Ctrl + P.</div></section></main></body></html>`;
}

// Correo opcional: sin SMTP_USER y SMTP_PASS la compra funciona y el recibo queda disponible en la app.
function createMailer(env = process.env) {
  if (!env.SMTP_USER || !env.SMTP_PASS) return null;
  const transport = require('nodemailer').createTransport({ host: env.SMTP_HOST || 'smtp.gmail.com', port: Number(env.SMTP_PORT || 465),
    secure: Number(env.SMTP_PORT || 465) === 465, requireTLS: true, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 20000 });
  return message => transport.sendMail({ from: { name: 'Rodando UTP', address: env.SMTP_USER }, ...message });
}

function createMemberships({ pool, requireAuth, requireCsrf, json, readBody, rateLimit, randomToken, appBaseUrl, errorWithStatus, sendMail = createMailer() }) {
  async function currentFor(userId, db = pool) {
    return (await db.query(`SELECT * FROM memberships WHERE user_id=$1 AND status='active' AND expires_at>NOW() ORDER BY id DESC LIMIT 1`, [userId])).rows[0];
  }

  async function emailReceipt(row, user, baseUrl) {
    if (!sendMail) return false;
    let status = 'sent';
    try {
      await sendMail({ to: user.email, subject: `¡Gracias por tu compra! Recibo ${row.folio}`,
        text: `Hola, ${user.name}:\n\nGracias por unirte a ${PLANS[row.plan].name}.\nTotal: ${money(row.amount_cents)}\nFolio: ${row.folio}\nVigente hasta: ${longDate(row.expires_at)}\n\nVer recibo: ${baseUrl}/api/membership/receipt/${row.receipt_token}\n\nProyecto escolar: el pago es simulado y no se realizó ningún cargo.` });
    } catch (e) { status = 'error'; console.error('Correo de membresía:', e.code || e.name); }
    await pool.query('UPDATE memberships SET email_status=$1 WHERE id=$2', [status, row.id]).catch(() => {});
    return status === 'sent';
  }

  async function buy(user, body) {
    const planId = String(body.plan || '');
    const plan = Object.hasOwn(PLANS, planId) ? PLANS[planId] : null;
    if (!plan) throw errorWithStatus('Elige un plan válido.');
    const last4 = String(body.cardLast4 || '');
    if (!/^\d{4}$/.test(last4)) throw errorWithStatus('Escribe el número de la tarjeta (cualquiera, es simulación).');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.id]);
      await client.query(`UPDATE memberships SET status='expired' WHERE user_id=$1 AND status='active' AND expires_at<=NOW()`, [user.id]);
      if (await currentFor(user.id, client)) throw errorWithStatus('Ya tienes Rodando Plus activo.', 409);
      const { rows: [{ n }] } = await client.query(`SELECT COUNT(*)::int AS n FROM memberships WHERE user_id=$1 AND starts_at>NOW()-INTERVAL '1 day'`, [user.id]);
      if (n >= MAX_PURCHASES_PER_DAY) throw errorWithStatus('Llegaste al límite de compras de hoy.', 429);
      const folio = `RP-${randomToken(6).replace(/[^A-Za-z0-9]/g, 'X').toUpperCase()}`;
      const { rows: [row] } = await client.query(`INSERT INTO memberships (folio,user_id,plan,amount_cents,card_last4,receipt_token,expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,NOW()+make_interval(days => $7)) RETURNING *`, [folio, user.id, planId, plan.cents, last4, randomToken(24), plan.days]);
      await client.query('COMMIT');
      return row;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      if (e.code === '23505') throw errorWithStatus('Ya tienes Rodando Plus activo.', 409);
      throw e;
    } finally { client.release(); }
  }

  async function handle(req, res, url, ip) {
    const { method } = req, { pathname } = url;
    const receipt = pathname.match(/^\/api\/membership\/receipt\/([A-Za-z0-9_-]{20,80})$/);
    if (method === 'GET' && receipt) {
      if (!rateLimit(ip, 'receipt', 60, 60000)) { json(res, 429, { error: 'Demasiadas consultas.' }); return true; }
      const { rows: [row] } = await pool.query('SELECT m.*, u.name, u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.receipt_token=$1', [receipt[1]]);
      if (!row) { json(res, 404, { error: 'Recibo no encontrado.' }); return true; }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(receiptHtml(row));
      return true;
    }
    const resend = pathname === '/api/membership/email';
    if (pathname !== '/api/membership' && !resend) return false;
    if (!(resend ? ['POST'] : ['GET', 'POST', 'DELETE']).includes(method)) { json(res, 405, { error: 'Método no permitido.' }); return true; }
    const s = await requireAuth(req, res);
    if (!s) return true;
    const user = { id: s.row.user_id, name: s.row.name, email: s.row.email };
    if (method === 'GET') {
      const { rows } = await pool.query('SELECT * FROM memberships WHERE user_id=$1 ORDER BY id DESC LIMIT 10', [user.id]);
      json(res, 200, { emailEnabled: Boolean(sendMail), membership: publicMembership(await currentFor(user.id)), history: rows.map(publicMembership) });
      return true;
    }
    if (!requireCsrf(req, res, s)) return true;
    if (!rateLimit(ip, 'membership', 20, 15 * 60000)) { json(res, 429, { error: 'Demasiados intentos. Espera unos minutos.' }); return true; }
    if (resend) {
      if (!sendMail) { json(res, 503, { error: 'El envío de correos no está configurado.' }); return true; }
      const row = await currentFor(user.id);
      if (!row) { json(res, 404, { error: 'No tienes una membresía activa.' }); return true; }
      if (!rateLimit(`user:${user.id}`, 'receipt-mail', 3, 60 * 60000)) { json(res, 429, { error: 'Ya pediste varios recibos. Intenta en una hora.' }); return true; }
      if (await emailReceipt(row, user, appBaseUrl(req))) json(res, 200, { ok: true, email: user.email });
      else json(res, 502, { error: 'No se pudo enviar el correo. Intenta más tarde.' });
      return true;
    }
    if (method === 'POST') {
      const row = await buy(user, await readBody(req));
      json(res, 201, { membership: publicMembership(row), email: user.email, emailEnabled: Boolean(sendMail) });
      emailReceipt(row, user, appBaseUrl(req));
      return true;
    }
    const { rowCount } = await pool.query(`UPDATE memberships SET status='cancelled' WHERE user_id=$1 AND status='active'`, [user.id]);
    json(res, rowCount ? 200 : 404, rowCount ? { ok: true } : { error: 'No tienes una membresía activa.' });
    return true;
  }
  return { handle };
}

module.exports = { createMemberships, createMailer, receiptHtml, PLANS };
