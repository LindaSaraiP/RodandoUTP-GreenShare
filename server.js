'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const pool = require('./db');
const { createPushService } = require('./push-notifications');

const ROOT = __dirname;
const PUBLIC_ROOT = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);
const PROD = process.env.NODE_ENV === 'production';
const SESSION_DAYS = 7;
const MAX_BODY = 256 * 1024;
const APP_VERSION = '6.3.0-neon-web-push';
const ALLOWED_DOMAINS = ['utpuebla.edu.mx', 'alumno.utpuebla.edu.mx'];
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || 'admin@utpuebla.edu.mx').trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || (PROD ? '' : 'RodandoEco2026'));
const ADMIN_NAME = 'Administrador Rodando UTP';
if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
  throw new Error('ADMIN_PASSWORD debe tener al menos 12 caracteres y estar definida en producción.');
}

function nowIso() { return new Date().toISOString(); }
function daysFromNow(days) { return new Date(Date.now() + days * 86400000).toISOString(); }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function randomToken(bytes = 32) { return crypto.randomBytes(bytes).toString('base64url'); }
function cleanText(value = '', max = 120) { return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max); }
function normalizeEmail(value = '') { return String(value || '').trim().toLowerCase(); }
function parseIntRange(value, min, max) { const n = Number(value); return Number.isInteger(n) && n >= min && n <= max ? n : null; }
function parseMoney(value) { const n = Number(value); return Number.isFinite(n) && n >= 0 && n <= 500 ? Math.round(n * 100) : null; }
function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function isAllowedDomain(email) { return ALLOWED_DOMAINS.some(domain => email.endsWith(`@${domain}`)); }
function isStrongPassword(password) { return password.length >= 8 && password.length <= 128 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password); }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}
function verifyPassword(password, stored) {
  try {
    const [salt, expected] = String(stored).split(':');
    const digest = crypto.scryptSync(password, salt, 64);
    const expectedBuf = Buffer.from(expected, 'hex');
    return digest.length === expectedBuf.length && crypto.timingSafeEqual(digest, expectedBuf);
  } catch { return false; }
}
function safeFutureDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() < Date.now() - 5 * 60000 || date.getTime() > Date.now() + 180 * 86400000) return null;
  return date.toISOString();
}
function publicUser(row) {
  if (!row) return null;
  return { id: Number(row.id), name: row.name, studentId: row.student_id, email: row.email, career: row.career, role: row.role, verified: !!row.verified, createdAt: row.created_at };
}
const asNumber = n => Number(n || 0);
const value = async (db, sql, params = []) => (await db.query(sql, params)).rows[0];
function errorWithStatus(message, status = 400) { return Object.assign(new Error(message), { status }); }

async function ensureAdminUser() {
  const found = await value(pool, 'SELECT id FROM users WHERE email=$1', [ADMIN_EMAIL]);
  if (!found) {
    await pool.query(`INSERT INTO users (name, student_id, email, career, password_hash, verified, role, created_at)
      VALUES ($1, $2, $3, $4, $5, TRUE, 'admin', NOW()) ON CONFLICT (email) DO NOTHING`,
    [ADMIN_NAME, 'ADM-UTP-001', ADMIN_EMAIL, 'Administración', hashPassword(ADMIN_PASSWORD)]);
  } else {
    if (process.env.ADMIN_PASSWORD) {
      await pool.query("UPDATE users SET role='admin', verified=TRUE, password_hash=$1 WHERE id=$2",
        [hashPassword(ADMIN_PASSWORD), found.id]);
    } else {
      await pool.query("UPDATE users SET role='admin', verified=TRUE WHERE id=$1", [found.id]);
    }
  }
}

const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};
const rates = new Map();
function rateLimit(ip, bucket, limit, windowMs) {
  const key = `${ip}:${bucket}`; const now = Date.now(); const state = rates.get(key);
  if (!state || now >= state.until) { rates.set(key, { times: 1, until: now + windowMs }); return true; }
  if (state.times >= limit) return false;
  state.times++; return true;
}
setInterval(() => { const now = Date.now(); for (const [key, state] of rates) if (state.until < now) rates.delete(key); }, 600000).unref();
function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; manifest-src 'self'; worker-src 'self'");
  if (PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}
function json(res, status, payload) {
  if (res.writableEnded) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}
function cookies(req) {
  const out = {};
  for (const item of String(req.headers.cookie || '').split(';')) {
    const cut = item.indexOf('='); if (cut < 0) continue;
    out[item.slice(0, cut).trim()] = decodeURIComponent(item.slice(cut + 1).trim());
  }
  return out;
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let bytes = 0; const chunks = [];
    req.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > MAX_BODY) { reject(errorWithStatus('El cuerpo es demasiado grande.', 413)); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(errorWithStatus('JSON inválido.', 400)); }
    });
    req.on('error', reject);
  });
}
async function createSession(res, userId = null, db = pool) {
  const token = randomToken(32), csrf = randomToken(24);
  await db.query(`INSERT INTO sessions (user_id, token_hash, csrf_token, expires_at, created_at)
    VALUES ($1,$2,$3,$4,NOW())`, [userId, sha256(token), csrf, daysFromNow(SESSION_DAYS)]);
  const secure = PROD ? '; Secure' : '';
  res.setHeader('Set-Cookie', `rodando_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}${secure}`);
  return { token, csrf };
}
async function sessionFromReq(req) {
  const token = cookies(req).rodando_session; if (!token) return null;
  const row = await value(pool, `SELECT s.*, u.id AS account_id, u.name, u.student_id, u.email, u.career,
    u.verified, u.role, u.created_at AS user_created_at
    FROM sessions s LEFT JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at>NOW()`, [sha256(token)]);
  return row ? { token, row } : null;
}
async function ensureSession(req, res) {
  const old = await sessionFromReq(req); if (old) return old;
  const created = await createSession(res);
  return { token: created.token, row: { user_id: null, csrf_token: created.csrf } };
}
async function rotateSession(res, old, userId) {
  // New session replaces the anonymous session; a cookie is assigned only after insert succeeds.
  const fresh = await createSession(res, userId);
  if (old?.row?.id) await pool.query('DELETE FROM sessions WHERE id=$1', [old.row.id]);
  return fresh;
}
async function requireAuth(req, res) {
  const s = await sessionFromReq(req);
  if (!s || !s.row.user_id) { json(res, 401, { error: 'Debes iniciar sesión.' }); return null; }
  return s;
}
async function requireAdmin(req, res) {
  const s = await requireAuth(req, res); if (!s) return null;
  if (s.row.role !== 'admin') { json(res, 403, { error: 'Acceso solo para administrador.' }); return null; }
  return s;
}
function requireCsrf(req, res, session) {
  const expected = String(session?.row?.csrf_token || '');
  const supplied = String(req.headers['x-csrf-token'] || '');
  if (!expected || expected.length !== supplied.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) {
    json(res, 403, { error: 'Token CSRF inválido. Recarga la aplicación.' }); return false;
  }
  return true;
}

const pushService = createPushService({ pool, requireAuth, requireAdmin, requireCsrf, json, readBody, rateLimit });

function ecoLevel(points) {
  if (points >= 700) return { name: 'Bosque UTP', code: 'BU', nextAt: null };
  if (points >= 450) return { name: 'Árbol Vivo', code: 'AV', nextAt: 700 };
  if (points >= 250) return { name: 'Raíz Verde', code: 'RV', nextAt: 450 };
  if (points >= 120) return { name: 'Brote', code: 'BR', nextAt: 250 };
  return { name: 'Semilla', code: 'SE', nextAt: 120 };
}
async function userEco(userId) {
  const [eventStats, published, completed, bookings, taken, given] = await Promise.all([
    value(pool, 'SELECT COALESCE(SUM(points),0) AS points, COUNT(*) AS events FROM eco_events WHERE user_id=$1', [userId]),
    value(pool, "SELECT COUNT(*) AS total FROM rides WHERE driver_id=$1 AND status IN ('active','completed')", [userId]),
    value(pool, "SELECT COUNT(*) AS total FROM rides WHERE driver_id=$1 AND status='completed'", [userId]),
    value(pool, "SELECT COUNT(*) AS total FROM reservations WHERE passenger_id=$1 AND status='confirmed'", [userId]),
    value(pool, "SELECT COALESCE(SUM(seats),0) AS total FROM reservations WHERE passenger_id=$1 AND status='confirmed'", [userId]),
    value(pool, "SELECT COALESCE(SUM(rs.seats),0) AS total FROM rides r LEFT JOIN reservations rs ON rs.ride_id=r.id AND rs.status='confirmed' WHERE r.driver_id=$1", [userId])
  ]);
  const points = asNumber(eventStats.points), sharedSeats = asNumber(taken.total) + asNumber(given.total);
  return {
    points, level: ecoLevel(points), published: asNumber(published.total),
    completedTrips: asNumber(completed.total) + asNumber(bookings.total),
    sharedSeats, co2Kg: Number((sharedSeats * 1.8).toFixed(1)),
    badges: [
      { name: 'Primer viaje', code: 'P1', unlocked: points >= 60 },
      { name: 'Conexión verde', code: 'CV', unlocked: points >= 140 },
      { name: 'Parking colaborativo', code: 'PK', unlocked: points >= 240 },
      { name: 'Guardian ecológico', code: 'GE', unlocked: points >= 360 },
      { name: 'Bosque UTP', code: 'BU', unlocked: points >= 700 }
    ],
    events: asNumber(eventStats.events), treeStage: Math.min(5, Math.max(1, Math.ceil(points / 140)))
  };
}
async function communityStats() {
  const row = await value(pool, `SELECT
    (SELECT COUNT(*) FROM users WHERE role='user') AS users,
    (SELECT COUNT(*) FROM rides) AS rides,
    (SELECT COALESCE(SUM(seats),0) FROM reservations WHERE status='confirmed') AS seats,
    (SELECT COALESCE(SUM(points),0) FROM eco_events) AS points`);
  const seats = asNumber(row.seats);
  return {
    users: asNumber(row.users), rides: asNumber(row.rides), sharedSeats: seats, ecoPoints: asNumber(row.points),
    estimatedCo2Kg: Number((seats * 1.8).toFixed(1)), gasolineSavedLiters: Number((seats * .45).toFixed(1)),
    monthlySavingsPesos: seats * 32
  };
}
// whereSql se define SOLO por el servidor; nunca se concatena texto del usuario.
async function ridePublicSelect(whereSql = 'WHERE 1=1', params = [], includePrivate = false) {
  const rows = (await pool.query(`SELECT r.*, u.name AS driver_name, u.career AS driver_career,
    u.student_id AS driver_student_id, u.verified AS driver_verified,
    (r.seats_total - COALESCE((SELECT SUM(seats) FROM reservations rs WHERE rs.ride_id=r.id AND rs.status='confirmed'),0)) AS seats_available
    FROM rides r JOIN users u ON u.id=r.driver_id ${whereSql} ORDER BY r.departure_at ASC`, params)).rows;
  return Promise.all(rows.map(async row => {
    const pax = (await pool.query(`SELECT rs.seats, u.id AS user_id, u.name, u.student_id, u.career
      FROM reservations rs JOIN users u ON u.id=rs.passenger_id
      WHERE rs.ride_id=$1 AND rs.status='confirmed' ORDER BY rs.created_at ASC`, [row.id])).rows;
    const passengers = pax.map(p => ({
      id: Number(p.user_id), name: includePrivate ? p.name : p.name.split(' ')[0],
      studentId: includePrivate ? p.student_id : '', career: includePrivate ? p.career : '', seats: Number(p.seats)
    }));
    return {
      id: Number(row.id), origin: row.origin, pickupPoint: row.pickup_point, destination: row.destination,
      departureAt: row.departure_at, seatsTotal: row.seats_total, seatsAvailable: asNumber(row.seats_available),
      contribution: row.contribution_cents / 100, vehicle: row.vehicle, color: row.color,
      plateLast4: row.plate_last4, notes: row.notes, routeType: row.route_type,
      connectionHub: row.connection_hub, parkingEligible: !!row.parking_eligible,
      parkingCode: includePrivate ? row.parking_code : '',
      parkingGeneratedAt: includePrivate ? row.parking_generated_at : null,
      passengerCount: passengers.length, passengers, status: row.status, createdAt: row.created_at,
      driver: { id: Number(row.driver_id), name: row.driver_name, career: row.driver_career,
        studentId: row.driver_student_id, verified: !!row.driver_verified }
    };
  }));
}

async function handleApi(req, res, url, ip) {
  const method = req.method, pathname = url.pathname;
  if (await pushService.handle(req, res, url, ip)) return;
  if (method === 'GET' && pathname === '/api/health') {
    await pool.query('SELECT 1');
    return json(res, 200, { ok: true, version: APP_VERSION, time: nowIso(), database: 'postgresql' });
  }
  if (method === 'GET' && pathname === '/api/session') {
    const s = await ensureSession(req, res);
    const user = s.row.user_id ? publicUser({ id: s.row.account_id, name: s.row.name,
      student_id: s.row.student_id, email: s.row.email, career: s.row.career,
      role: s.row.role, verified: s.row.verified, created_at: s.row.user_created_at }) : null;
    return json(res, 200, { user, csrfToken: s.row.csrf_token,
      allowedDomains: ALLOWED_DOMAINS, community: await communityStats() });
  }
  if (method === 'GET' && pathname === '/api/community-stats') return json(res, 200, { stats: await communityStats() });

  if (method === 'GET' && pathname === '/api/parking/verify') {
    const code = cleanText(url.searchParams.get('codigo'), 120);
    if (!/^RUP-\d+-[A-Za-z0-9_-]{20,}$/.test(code)) return json(res, 400, { error: 'Código de pase inválido.' });
    const found = await value(pool, 'SELECT id FROM rides WHERE parking_code=$1', [code]);
    if (!found) return json(res, 404, { error: 'Pase no encontrado.' });
    const ride = (await ridePublicSelect('WHERE r.id=$1', [found.id], true))[0];
    const valid = !!ride && ride.parkingEligible && ride.passengerCount >= 2 && ride.status !== 'cancelled';
    return json(res, 200, { valid, pass: {
      code, passengerCount: ride.passengerCount,
      seatsConfirmed: ride.passengers.reduce((sum, p) => sum + p.seats, 0),
      passengers: ride.passengers.map(p => ({ name: p.name, career: p.career, studentId: p.studentId, seats: p.seats })),
      driver: { name: ride.driver.name, studentId: ride.driver.studentId },
      origin: ride.origin, destination: ride.destination, departureAt: ride.departureAt,
      vehicle: ride.vehicle, color: ride.color, plateLast4: ride.plateLast4,
      status: ride.status, generatedAt: ride.parkingGeneratedAt
    } });
  }

  if (method === 'POST' && pathname === '/api/register') {
    if (!rateLimit(ip, 'register', 10, 15 * 60000)) return json(res, 429, { error: 'Demasiados intentos de registro.' });
    const s = await ensureSession(req, res); if (!requireCsrf(req, res, s)) return;
    const body = await readBody(req);
    const name = cleanText(body.name, 80), studentId = cleanText(body.studentId, 24).toUpperCase();
    const email = normalizeEmail(body.email), career = cleanText(body.career, 80), password = String(body.password || '');
    if (name.length < 3) return json(res, 400, { error: 'Nombre inválido.' });
    if (studentId.length < 5) return json(res, 400, { error: 'Matrícula inválida.' });
    if (!isValidEmail(email) || !isAllowedDomain(email)) return json(res, 400, { error: 'Usa un correo @utpuebla.edu.mx o @alumno.utpuebla.edu.mx.' });
    if (career.length < 4) return json(res, 400, { error: 'Indica tu carrera.' });
    if (!isStrongPassword(password)) return json(res, 400, { error: 'La contraseña debe incluir mayúscula, minúscula y número.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const newUser = (await client.query(`INSERT INTO users (name,student_id,email,career,password_hash,verified,role,created_at)
        VALUES ($1,$2,$3,$4,$5,TRUE,'user',NOW()) RETURNING *`, [name, studentId, email, career, hashPassword(password)])).rows[0];
      await client.query("INSERT INTO eco_events (user_id,points,reason,created_at) VALUES ($1,30,'Bienvenida EcoRodando',NOW())", [newUser.id]);
      await client.query('COMMIT');
      const fresh = await rotateSession(res, s, newUser.id);
      return json(res, 201, { user: publicUser(newUser), csrfToken: fresh.csrf });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      if (e.code === '23505') return json(res, 409, { error: 'La matrícula o el correo ya están registrados.' });
      throw e;
    } finally { client.release(); }
  }
  if (method === 'POST' && pathname === '/api/login') {
    if (!rateLimit(ip, 'login', 15, 15 * 60000)) return json(res, 429, { error: 'Demasiados intentos de acceso.' });
    const s = await ensureSession(req, res); if (!requireCsrf(req, res, s)) return;
    const body = await readBody(req);
    const user = await value(pool, 'SELECT * FROM users WHERE email=$1', [normalizeEmail(body.email)]);
    if (!user || !verifyPassword(String(body.password || ''), user.password_hash)) return json(res, 401, { error: 'Correo o contraseña incorrectos.' });
    const fresh = await rotateSession(res, s, user.id);
    return json(res, 200, { user: publicUser(user), csrfToken: fresh.csrf });
  }
  if (method === 'POST' && pathname === '/api/logout') {
    const s = await requireAuth(req, res); if (!s || !requireCsrf(req, res, s)) return;
    await pool.query('DELETE FROM sessions WHERE id=$1', [s.row.id]);
    res.setHeader('Set-Cookie', `rodando_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${PROD ? '; Secure' : ''}`);
    return json(res, 200, { ok: true });
  }

  if (method === 'GET' && pathname === '/api/rides') {
    const origin = cleanText(url.searchParams.get('origin'), 60), date = cleanText(url.searchParams.get('date'), 10);
    const routeType = cleanText(url.searchParams.get('routeType'), 20);
    const where = ["r.status='active'", 'r.departure_at >= $1'];
    const params = [new Date(Date.now() - 5 * 60000).toISOString()];
    if (origin) { params.push(`%${origin}%`); where.push(`r.origin ILIKE $${params.length}`); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) { params.push(date); where.push(`(r.departure_at AT TIME ZONE 'America/Mexico_City')::date = $${params.length}::date`); }
    if (['connection', 'direct'].includes(routeType)) { params.push(routeType); where.push(`r.route_type = $${params.length}`); }
    return json(res, 200, { rides: await ridePublicSelect('WHERE ' + where.join(' AND '), params) });
  }
  if (method === 'POST' && pathname === '/api/rides') {
    if (!rateLimit(ip, 'publish', 20, 60 * 60000)) return json(res, 429, { error: 'Límite temporal de publicaciones.' });
    const s = await requireAuth(req, res); if (!s || !requireCsrf(req, res, s)) return;
    const body = await readBody(req);
    const origin = cleanText(body.origin, 60), pickupPoint = cleanText(body.pickupPoint, 90);
    const departureAt = safeFutureDateTime(body.departureAt), seats = parseIntRange(body.seatsTotal, 1, 6);
    const contribution = parseMoney(body.contribution), vehicle = cleanText(body.vehicle, 60);
    const color = cleanText(body.color, 30), plate = cleanText(body.plateLast4, 4).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const notes = cleanText(body.notes, 220), type = body.routeType === 'connection' ? 'connection' : 'direct';
    const hub = cleanText(body.connectionHub, 80), parking = !!body.parkingEligible;
    if (!origin || !pickupPoint || !departureAt || !seats || contribution === null || vehicle.length < 3 || color.length < 3 || plate.length < 3) {
      return json(res, 400, { error: 'Revisa los datos de la ruta.' });
    }
    if (type === 'connection' && hub.length < 3) return json(res, 400, { error: 'Indica el punto de conexión.' });
    const client = await pool.connect();
    let id;
    try {
      await client.query('BEGIN');
      const result = await client.query(`INSERT INTO rides (driver_id,origin,pickup_point,departure_at,seats_total,contribution_cents,
        vehicle,color,plate_last4,notes,route_type,connection_hub,parking_eligible,status,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'active',NOW()) RETURNING id`,
        [s.row.user_id, origin, pickupPoint, departureAt, seats, contribution, vehicle, color, plate, notes, type, type === 'connection' ? hub : '', parking]);
      id = result.rows[0].id;
      await client.query("INSERT INTO eco_events (user_id,points,reason,created_at) VALUES ($1,20,'Ruta publicada',NOW())", [s.row.user_id]);
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; }
    finally { client.release(); }
    return json(res, 201, { ride: (await ridePublicSelect('WHERE r.id=$1', [id]))[0] });
  }

  const reserveMatch = pathname.match(/^\/api\/rides\/(\d+)\/reserve$/);
  if (reserveMatch && method === 'POST') {
    const s = await requireAuth(req, res); if (!s || !requireCsrf(req, res, s)) return;
    const seats = parseIntRange((await readBody(req)).seats, 1, 3);
    if (!seats) return json(res, 400, { error: 'Número de lugares inválido.' });
    const rideId = Number(reserveMatch[1]);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // FOR UPDATE serializa las reservaciones concurrentes de la misma ruta.
      const ride = (await client.query('SELECT * FROM rides WHERE id=$1 FOR UPDATE', [rideId])).rows[0];
      if (!ride || ride.status !== 'active' || new Date(ride.departure_at).getTime() < Date.now()) throw errorWithStatus('Ruta no disponible.', 404);
      if (Number(ride.driver_id) === Number(s.row.user_id)) throw errorWithStatus('No puedes reservar tu propia ruta.');
      const taken = await value(client, "SELECT COALESCE(SUM(seats),0) AS n FROM reservations WHERE ride_id=$1 AND status='confirmed'", [rideId]);
      if (ride.seats_total - asNumber(taken.n) < seats) throw errorWithStatus('No hay suficientes lugares disponibles.', 409);
      const existing = await value(client, 'SELECT id,status FROM reservations WHERE ride_id=$1 AND passenger_id=$2', [rideId, s.row.user_id]);
      if (existing?.status === 'confirmed') throw errorWithStatus('Ya reservaste esta ruta.', 409);
      if (existing) {
        await client.query("UPDATE reservations SET seats=$1,status='confirmed',created_at=NOW() WHERE id=$2", [seats, existing.id]);
      } else {
        await client.query("INSERT INTO reservations (ride_id,passenger_id,seats,status,created_at) VALUES ($1,$2,$3,'confirmed',NOW())", [rideId, s.row.user_id, seats]);
      }
      if (!existing) await client.query("INSERT INTO eco_events (user_id,points,reason,created_at) VALUES ($1,15,'Lugar reservado',NOW())", [s.row.user_id]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      if (e.status) return json(res, e.status, { error: e.message });
      throw e;
    } finally { client.release(); }
    // La reserva se confirmó en PostgreSQL. Avisos opcionales nunca revierten el viaje.
    const bookedRide = (await ridePublicSelect('WHERE r.id=$1', [rideId]))[0];
    await Promise.allSettled([
      pushService.notifyUser(bookedRide.driver.id, 'Nueva reserva en Rodando UTP',
        'Un estudiante reservó un lugar en tu viaje. Consulta tu panel.', '/#dashboard'),
      pushService.notifyUser(s.row.user_id, 'Tu reserva fue confirmada',
        'Tu lugar está confirmado. Revisa los detalles en Mi panel.', '/#dashboard')
    ]);
    return json(res, 201, { ride: bookedRide });
  }
  if (reserveMatch && method === 'DELETE') {
    const s = await requireAuth(req, res); if (!s || !requireCsrf(req, res, s)) return;
    const rideId = Number(reserveMatch[1]);
    const client = await pool.connect(); let changes = 0;
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM rides WHERE id=$1 FOR UPDATE', [rideId]);
      const updated = await client.query("UPDATE reservations SET status='cancelled' WHERE ride_id=$1 AND passenger_id=$2 AND status='confirmed'", [rideId, s.row.user_id]);
      changes = updated.rowCount;
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; }
    finally { client.release(); }
    return changes ? json(res, 200, { ok: true }) : json(res, 404, { error: 'No existe una reserva activa.' });
  }
  const rideIdMatch = pathname.match(/^\/api\/rides\/(\d+)$/);
  if (rideIdMatch && method === 'DELETE') {
    const s = await requireAuth(req, res); if (!s || !requireCsrf(req, res, s)) return;
    const result = await pool.query("UPDATE rides SET status='cancelled' WHERE id=$1 AND driver_id=$2 AND status='active'", [Number(rideIdMatch[1]), s.row.user_id]);
    return result.rowCount ? json(res, 200, { ok: true }) : json(res, 404, { error: 'No se pudo cancelar la ruta.' });
  }
  const complete = pathname.match(/^\/api\/rides\/(\d+)\/complete$/);
  if (complete && method === 'POST') {
    const s = await requireAuth(req, res); if (!s || !requireCsrf(req, res, s)) return;
    const rideId = Number(complete[1]);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ride = await value(client, 'SELECT * FROM rides WHERE id=$1 FOR UPDATE', [rideId]);
      if (!ride || Number(ride.driver_id) !== Number(s.row.user_id)) throw errorWithStatus('Solo el conductor puede finalizar el viaje.', 403);
      if (ride.status !== 'active') throw errorWithStatus('La ruta ya no está activa.', 409);
      if (new Date(ride.departure_at) > new Date()) throw errorWithStatus('El viaje solo puede finalizarse después de la hora de salida.');
      const pax = await value(client, "SELECT COUNT(*) AS n, COALESCE(SUM(seats),0) AS seats FROM reservations WHERE ride_id=$1 AND status='confirmed'", [rideId]);
      if (asNumber(pax.n) < 1) throw errorWithStatus('El viaje requiere al menos un pasajero confirmado.');
      await client.query("UPDATE rides SET status='completed' WHERE id=$1", [rideId]);
      await client.query("INSERT INTO eco_events (user_id,points,reason,created_at) VALUES ($1,$2,'Viaje completado como conductor',NOW())", [s.row.user_id, 40 + asNumber(pax.seats) * 10]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      if (e.status) return json(res, e.status, { error: e.message });
      throw e;
    } finally { client.release(); }
    return json(res, 200, { ok: true,
      ride: (await ridePublicSelect('WHERE r.id=$1', [rideId]))[0], eco: await userEco(s.row.user_id) });
  }
  const parking = pathname.match(/^\/api\/rides\/(\d+)\/parking-pass$/);
  if (parking && method === 'POST') {
    const s = await requireAuth(req, res); if (!s || !requireCsrf(req, res, s)) return;
    const rideId = Number(parking[1]);
    const client = await pool.connect(); let code, generatedAt;
    try {
      await client.query('BEGIN');
      const ride = await value(client, 'SELECT * FROM rides WHERE id=$1 FOR UPDATE', [rideId]);
      if (!ride || Number(ride.driver_id) !== Number(s.row.user_id)) throw errorWithStatus('Solo el conductor puede generar el pase.', 403);
      if (!ride.parking_eligible || ride.status === 'cancelled') throw errorWithStatus('Esta ruta no participa en Rodando Parking.');
      const pax = await value(client, "SELECT COUNT(*) AS n FROM reservations WHERE ride_id=$1 AND status='confirmed'", [rideId]);
      if (asNumber(pax.n) < 1) throw errorWithStatus('Se requieren al menos 1 pasajero confirmado.');
      code = ride.parking_code || `RUP-${rideId}-${randomToken(18)}`;
      generatedAt = ride.parking_generated_at || nowIso();
      if (!ride.parking_code) {
        await client.query('UPDATE rides SET parking_code=$1,parking_generated_at=$2 WHERE id=$3', [code, generatedAt, rideId]);
        await client.query("INSERT INTO eco_events (user_id,points,reason,created_at) VALUES ($1,35,'Rodando Parking',NOW())", [s.row.user_id]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      if (e.status) return json(res, e.status, { error: e.message });
      throw e;
    } finally { client.release(); }
    const ride = (await ridePublicSelect('WHERE r.id=$1', [rideId], true))[0];
    return json(res, 200, { pass: { code, generatedAt, passengerCount: ride.passengerCount, ride,
      qrPayload: `/verificar-pase.html?codigo=${encodeURIComponent(code)}` } });
  }

  if (method === 'GET' && pathname === '/api/dashboard') {
    const s = await requireAuth(req, res); if (!s) return;
    const published = await ridePublicSelect('WHERE r.driver_id=$1', [s.row.user_id], true);
    const reservationRows = (await pool.query(`SELECT rs.id AS reservation_id,rs.seats,rs.status AS reservation_status,r.id AS ride_id
      FROM reservations rs JOIN rides r ON r.id=rs.ride_id WHERE rs.passenger_id=$1 ORDER BY r.departure_at ASC`, [s.row.user_id])).rows;
    const reservations = await Promise.all(reservationRows.map(async row => ({
      reservationId: Number(row.reservation_id), seats: row.seats, reservationStatus: row.reservation_status,
      ride: (await ridePublicSelect('WHERE r.id=$1', [row.ride_id], true))[0]
    })));
    return json(res, 200, { published, reservations, eco: await userEco(s.row.user_id) });
  }
  if (method === 'GET' && pathname === '/api/admin/overview') {
    const s = await requireAdmin(req, res); if (!s) return;
    const data = await value(pool, `SELECT
      (SELECT COUNT(*) FROM users WHERE role='user') AS users,
      (SELECT COUNT(*) FROM rides) AS rides,
      (SELECT COUNT(*) FROM rides WHERE status='active') AS active_rides,
      (SELECT COUNT(*) FROM reservations WHERE status='confirmed') AS reservations,
      (SELECT COUNT(*) FROM rides WHERE parking_eligible=TRUE) AS parking_enabled,
      (SELECT COUNT(*) FROM rides WHERE route_type='connection') AS connection_rides,
      (SELECT COUNT(*) FROM eco_events) AS eco_events`);
    return json(res, 200, { totals: {
      users: asNumber(data.users), rides: asNumber(data.rides), activeRides: asNumber(data.active_rides),
      reservations: asNumber(data.reservations), parkingEnabled: asNumber(data.parking_enabled),
      connectionRides: asNumber(data.connection_rides), ecoEvents: asNumber(data.eco_events)
    }, community: await communityStats() });
  }
  if (method === 'GET' && pathname === '/api/admin/users') {
    const s = await requireAdmin(req, res); if (!s) return;
    const rows = (await pool.query(`SELECT u.id,u.name,u.student_id,u.email,u.career,u.role,u.verified,u.created_at,
      (SELECT COUNT(*) FROM rides r WHERE r.driver_id=u.id) AS ride_count,
      (SELECT COUNT(*) FROM reservations rs WHERE rs.passenger_id=u.id AND rs.status='confirmed') AS reservation_count,
      (SELECT COALESCE(SUM(ev.points),0) FROM eco_events ev WHERE ev.user_id=u.id) AS eco_points
      FROM users u ORDER BY u.role DESC, u.created_at DESC`)).rows;
    return json(res, 200, { users: rows.map(r => ({ id: Number(r.id), name: r.name, studentId: r.student_id,
      email: r.email, career: r.career, role: r.role, verified: !!r.verified,
      rideCount: asNumber(r.ride_count), reservationCount: asNumber(r.reservation_count),
      ecoPoints: asNumber(r.eco_points), createdAt: r.created_at })) });
  }
  const adminUser = pathname.match(/^\/api\/admin\/users\/(\d+)$/);
  if (adminUser && method === 'PATCH') {
    const s = await requireAdmin(req, res); if (!s || !requireCsrf(req, res, s)) return;
    const body = await readBody(req);
    const role = body.role === 'admin' ? 'admin' : 'user';
    const verified = body.verified === true;
    const target = Number(adminUser[1]);
    if (target === Number(s.row.user_id) && role !== 'admin') return json(res, 400, { error: 'No puedes quitarte el rol de administrador a ti mismo.' });
    const result = await pool.query('UPDATE users SET role=$1,verified=$2 WHERE id=$3', [role, verified, target]);
    return result.rowCount ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Usuario no encontrado.' });
  }
  if (adminUser && method === 'DELETE') {
    const s = await requireAdmin(req, res); if (!s || !requireCsrf(req, res, s)) return;
    const target = Number(adminUser[1]);
    if (target === Number(s.row.user_id)) return json(res, 400, { error: 'No puedes eliminar tu propia cuenta.' });
    const result = await pool.query('DELETE FROM users WHERE id=$1', [target]);
    return result.rowCount ? json(res, 200, { ok: true }) : json(res, 404, { error: 'Usuario no encontrado.' });
  }
  return json(res, 404, { error: 'Endpoint no encontrado.' });
}

function serveStatic(req, res, url) {
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { res.statusCode = 400; return res.end('Bad Request'); }
  if (pathname === '/') pathname = '/index.html';
  const filepath = path.resolve(PUBLIC_ROOT, '.' + pathname);
  if (!filepath.startsWith(PUBLIC_ROOT + path.sep)) { res.statusCode = 403; return res.end('Forbidden'); }
  fs.stat(filepath, (err, stat) => {
    if (err || !stat.isFile()) { res.statusCode = 404; return res.end('Not Found'); }
    const ext = path.extname(filepath).toLowerCase();
    res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', ['.html','.css','.js','.webmanifest'].includes(ext) ? 'no-cache' : 'public, max-age=86400');
    fs.createReadStream(filepath).pipe(res);
  });
}

async function start() {
  const schema = fs.readFileSync(path.join(ROOT, 'docs', 'schema-postgres.sql'), 'utf8');
  await pool.query(schema);
  await ensureAdminUser();
  await pool.query('SELECT 1');
  const server = http.createServer(async (req, res) => {
    securityHeaders(res);
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    try {
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url, req.socket.remoteAddress || 'unknown');
      if (!['GET','HEAD'].includes(req.method)) return json(res, 405, { error: 'Método no permitido.' });
      return serveStatic(req, res, url);
    } catch (e) {
      console.error('API:', e.message);
      if (!res.headersSent) json(res, e.status || 500, { error: e.status ? e.message : 'Error interno del servidor.' });
      else res.end();
    }
  });
  server.listen(PORT, '0.0.0.0', () => console.log(`Rodando UTP + Neon listo en http://localhost:${PORT}`));
}
start().catch(async e => {
  console.error('No se pudo iniciar el backend PostgreSQL:', e.message);
  await pool.end().catch(() => {});
  process.exitCode = 1;
});
