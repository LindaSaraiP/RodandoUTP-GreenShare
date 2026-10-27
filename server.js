'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const PUBLIC_ROOT = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'rodando-utp.db');
const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const SESSION_DAYS = 7;
const APP_VERSION = '6.1.0-responsive';
const MAX_BODY = 256 * 1024;
const ALLOWED_DOMAINS = ['utpuebla.edu.mx', 'alumno.utpuebla.edu.mx'];
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@utpuebla.edu.mx';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'RodandoEco2026';
const ADMIN_NAME = 'Administrador Rodando UTP';

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

function nowIso() { return new Date().toISOString(); }
function daysFromNow(days) { return new Date(Date.now() + days * 86400000).toISOString(); }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function randomToken(bytes = 32) { return crypto.randomBytes(bytes).toString('base64url'); }
function cleanText(value = '', max = 120) { return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max); }
function normalizeEmail(v = '') { return String(v || '').trim().toLowerCase(); }
function parseIntRange(v, min, max) { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : null; }
function parseMoney(v) { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 500 ? Math.round(n * 100) : null; }
function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function isAllowedDomain(email) { return ALLOWED_DOMAINS.some(domain => email.endsWith(`@${domain}`)); }
function isStrongPassword(password = '') { return password.length >= 8 && password.length <= 128 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password); }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  try {
    const [salt, expected] = String(stored).split(':');
    const actual = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}
function safeFutureDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getTime() < Date.now() - 5 * 60000) return null;
  if (date.getTime() > Date.now() + 180 * 86400000) return null;
  return date.toISOString();
}
function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    studentId: row.student_id,
    email: row.email,
    career: row.career,
    role: row.role,
    verified: !!row.verified,
    createdAt: row.created_at
  };
}

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      student_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      career TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 1,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      token_hash TEXT NOT NULL UNIQUE,
      csrf_token TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS rides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      driver_id INTEGER NOT NULL,
      origin TEXT NOT NULL,
      pickup_point TEXT NOT NULL,
      destination TEXT NOT NULL DEFAULT 'Universidad Tecnológica de Puebla',
      departure_at TEXT NOT NULL,
      seats_total INTEGER NOT NULL,
      contribution_cents INTEGER NOT NULL,
      vehicle TEXT NOT NULL,
      color TEXT NOT NULL,
      plate_last4 TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      route_type TEXT NOT NULL DEFAULT 'direct' CHECK (route_type IN ('direct','connection')),
      connection_hub TEXT NOT NULL DEFAULT '',
      parking_eligible INTEGER NOT NULL DEFAULT 0,
      parking_code TEXT NOT NULL DEFAULT '',
      parking_generated_at TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','completed')),
      created_at TEXT NOT NULL,
      FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ride_id INTEGER NOT NULL,
      passenger_id INTEGER NOT NULL,
      seats INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled')),
      created_at TEXT NOT NULL,
      UNIQUE (ride_id, passenger_id),
      FOREIGN KEY (ride_id) REFERENCES rides(id) ON DELETE CASCADE,
      FOREIGN KEY (passenger_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS eco_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      points INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_rides_departure ON rides(departure_at);
    CREATE INDEX IF NOT EXISTS idx_reservations_ride ON reservations(ride_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
  `);

  const admin = db.prepare('SELECT id FROM users WHERE email=?').get(ADMIN_EMAIL);
  if (!admin) {
    db.prepare("INSERT INTO users (name, student_id, email, career, password_hash, verified, role, created_at) VALUES (?, ?, ?, ?, ?, 1, 'admin', ?)")
      .run(ADMIN_NAME, 'ADM-UTP-001', ADMIN_EMAIL, 'Administración', hashPassword(ADMIN_PASSWORD), nowIso());
  } else {
    db.prepare("UPDATE users SET role='admin', verified=1 WHERE id=?").run(admin.id);
  }

  const totalUsers = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  const totalRides = db.prepare('SELECT COUNT(*) AS count FROM rides').get().count;
  const totalEco = db.prepare('SELECT COUNT(*) AS count FROM eco_events').get().count;
  if (totalUsers < 13) seedData();
  if (totalRides < 12) seedRidesAndReservations();
  if (totalEco < 12) seedEcoEvents();
}

const careers = [
  'Desarrollo de Software', 'Mecatrónica', 'Procesos Industriales', 'Logística', 'Energías Renovables', 'Nanotecnología',
  'Mantenimiento Industrial', 'Diseño Digital', 'Negocios', 'Redes Inteligentes', 'Automatización', 'Administración'
];

function getUserByEmail(email) { return db.prepare('SELECT * FROM users WHERE email=?').get(email); }

function seedData() {
  const samples = [
    ['Mariana López', 'UTP24001', 'mariana.lopez@alumno.utpuebla.edu.mx', careers[0]],
    ['Diego Hernández', 'UTP24002', 'diego.hernandez@alumno.utpuebla.edu.mx', careers[1]],
    ['Valeria Cruz', 'UTP24003', 'valeria.cruz@alumno.utpuebla.edu.mx', careers[2]],
    ['José Ramírez', 'UTP24004', 'jose.ramirez@alumno.utpuebla.edu.mx', careers[3]],
    ['Andrea Gómez', 'UTP24005', 'andrea.gomez@alumno.utpuebla.edu.mx', careers[4]],
    ['Sofía Torres', 'UTP24006', 'sofia.torres@alumno.utpuebla.edu.mx', careers[5]],
    ['Luis Ortega', 'UTP24007', 'luis.ortega@alumno.utpuebla.edu.mx', careers[6]],
    ['Camila Flores', 'UTP24008', 'camila.flores@alumno.utpuebla.edu.mx', careers[7]],
    ['Carlos Medina', 'UTP24009', 'carlos.medina@alumno.utpuebla.edu.mx', careers[8]],
    ['Fernanda Ríos', 'UTP24010', 'fernanda.rios@alumno.utpuebla.edu.mx', careers[9]],
    ['Miguel Santos', 'UTP24011', 'miguel.santos@alumno.utpuebla.edu.mx', careers[10]],
    ['Paula Vargas', 'UTP24012', 'paula.vargas@utpuebla.edu.mx', careers[11]]
  ];
  const stmt = db.prepare("INSERT OR IGNORE INTO users (name, student_id, email, career, password_hash, verified, role, created_at) VALUES (?, ?, ?, ?, ?, 1, 'user', ?)");
  for (const [name, studentId, email, career] of samples) {
    stmt.run(name, studentId, email, career, hashPassword('DemoEco2026'), nowIso());
  }
}

function allRegularUsers() {
  return db.prepare("SELECT * FROM users WHERE role='user' ORDER BY id ASC").all();
}

function seedRidesAndReservations() {
  const users = allRegularUsers();
  if (users.length < 12) return;
  const origins = ['Cholula', 'Angelópolis', 'Amozoc', 'La Paz', 'Bosques de San Sebastián', 'Mayorazgo', 'Xonaca', 'San Ramón', 'San Pedro Cholula', 'Cuautlancingo', 'Amalucan', 'Forjadores'];
  const hubs = ['Parque Puebla', 'Explanada Puebla', 'Solesta', 'CAPU', 'Paseo Destino', 'Plaza Dorada'];
  const vehicles = ['Nissan Versa', 'Kia Rio', 'Chevrolet Aveo', 'Mazda 2', 'Volkswagen Vento', 'Seat Ibiza'];
  const colors = ['Blanco', 'Verde', 'Gris', 'Azul', 'Negro', 'Plateado'];
  const insertRide = db.prepare(`INSERT INTO rides
    (driver_id, origin, pickup_point, destination, departure_at, seats_total, contribution_cents, vehicle, color, plate_last4, notes, route_type, connection_hub, parking_eligible, status, created_at)
    VALUES (?, ?, ?, 'Universidad Tecnológica de Puebla', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  for (let i = 0; i < 12; i++) {
    const user = users[i % users.length];
    const isPast = i < 6;
    const date = new Date(Date.now() + (isPast ? -(7 - i) : (i + 1)) * 86400000);
    date.setHours(6 + (i % 5), 20 + (i * 7) % 30, 0, 0);
    const routeType = i % 3 === 0 ? 'connection' : 'direct';
    const info = insertRide.run(
      user.id,
      origins[i % origins.length],
      routeType === 'connection' ? hubs[i % hubs.length] : `Paradero ${origins[i % origins.length]}`,
      date.toISOString(),
      3 + (i % 2),
      (25 + (i % 4) * 5) * 100,
      vehicles[i % vehicles.length],
      colors[i % colors.length],
      `${1000 + i}`.slice(-4),
      routeType === 'connection' ? 'Ruta ecológica con punto de conexión.' : 'Ruta directa para compartir viaje y reducir emisiones.',
      routeType,
      routeType === 'connection' ? hubs[(i + 2) % hubs.length] : '',
      i % 2,
      isPast ? 'completed' : 'active',
      nowIso()
    );
    const rideId = Number(info.lastInsertRowid);
    const otherUsers = users.filter(u => u.id !== user.id);
    const passengerA = otherUsers[(i + 1) % otherUsers.length];
    const passengerB = otherUsers[(i + 3) % otherUsers.length];
    db.prepare("INSERT OR IGNORE INTO reservations (ride_id, passenger_id, seats, status, created_at) VALUES (?, ?, 1, 'confirmed', ?)").run(rideId, passengerA.id, nowIso());
    if (i % 2 === 0) db.prepare("INSERT OR IGNORE INTO reservations (ride_id, passenger_id, seats, status, created_at) VALUES (?, ?, 1, 'confirmed', ?)").run(rideId, passengerB.id, nowIso());
    if (!isPast && i % 4 === 0) {
      db.prepare('UPDATE rides SET parking_eligible=1 WHERE id=?').run(rideId);
    }
  }
}

function seedEcoEvents() {
  const users = allRegularUsers();
  const reasons = ['Viaje compartido', 'Conductor ecológico', 'Rodando Parking', 'Reserva puntual', 'Semana verde', 'Logro de comunidad'];
  const stmt = db.prepare('INSERT INTO eco_events (user_id, points, reason, created_at) VALUES (?, ?, ?, ?)');
  let created = 0;
  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    stmt.run(user.id, 60 + (i % 4) * 15, reasons[i % reasons.length], nowIso());
    created++;
    if (i < 6) { stmt.run(user.id, 25 + (i % 3) * 10, reasons[(i + 2) % reasons.length], nowIso()); created++; }
  }
  return created;
}

initDb();

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const rate = new Map();
function rateLimit(ip, bucket, limit, windowMs) {
  const key = `${ip}:${bucket}`;
  const now = Date.now();
  const value = rate.get(key);
  if (!value || now > value.reset) { rate.set(key, { count: 1, reset: now + windowMs }); return true; }
  if (value.count >= limit) return false;
  value.count += 1; return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rate) if (val.reset < now) rate.delete(key);
}, 10 * 60 * 1000).unref();

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; manifest-src 'self'; worker-src 'self'");
  if (NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}
function json(res, status, payload, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(payload));
}
function parseCookies(req) {
  const out = {};
  const raw = String(req.headers.cookie || '');
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('too_large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('invalid_json'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}
function createSession(res, userId = null) {
  const token = randomToken(32);
  const csrf = randomToken(24);
  db.prepare('INSERT INTO sessions (user_id, token_hash, csrf_token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(userId, sha256(token), csrf, daysFromNow(SESSION_DAYS), nowIso());
  const secure = NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `rodando_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}${secure}`);
  return { token, csrf };
}
function sessionFromReq(req) {
  const token = parseCookies(req).rodando_session;
  if (!token) return null;
  const row = db.prepare(`SELECT s.*, u.id AS account_id, u.name, u.student_id, u.email, u.career, u.verified, u.role, u.created_at AS user_created_at
    FROM sessions s LEFT JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>?`).get(sha256(token), nowIso());
  if (!row) return null;
  return { token, row };
}
function ensureSession(req, res) {
  const existing = sessionFromReq(req);
  if (existing) return existing;
  const fresh = createSession(res, null);
  return { token: fresh.token, row: { user_id: null, csrf_token: fresh.csrf } };
}
function rotateSession(res, old, userId) {
  if (old?.row?.id) db.prepare('DELETE FROM sessions WHERE id=?').run(old.row.id);
  return createSession(res, userId);
}
function requireAuth(req, res) {
  const session = sessionFromReq(req);
  if (!session || !session.row.user_id) { json(res, 401, { error: 'Debes iniciar sesión.' }); return null; }
  return session;
}
function requireAdmin(req, res) {
  const session = requireAuth(req, res);
  if (!session) return null;
  if (session.row.role !== 'admin') { json(res, 403, { error: 'Acceso solo para administrador.' }); return null; }
  return session;
}
function requireCsrf(req, res, session) {
  const expected = String(session?.row?.csrf_token || '');
  const provided = String(req.headers['x-csrf-token'] || '');
  if (!expected || !provided || provided.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
    json(res, 403, { error: 'Token CSRF inválido. Recarga la página.' });
    return false;
  }
  return true;
}

function ecoLevel(points) {
  if (points >= 700) return { name: 'Bosque UTP', code: 'BU', nextAt: null };
  if (points >= 450) return { name: 'Árbol Vivo', code: 'AV', nextAt: 700 };
  if (points >= 250) return { name: 'Raíz Verde', code: 'RV', nextAt: 450 };
  if (points >= 120) return { name: 'Brote', code: 'BR', nextAt: 250 };
  return { name: 'Semilla', code: 'SE', nextAt: 120 };
}
function userEco(userId) {
  const row = db.prepare('SELECT COALESCE(SUM(points),0) AS points, COUNT(*) AS events FROM eco_events WHERE user_id=?').get(userId);
  const rides = db.prepare("SELECT COUNT(*) AS published FROM rides WHERE driver_id=? AND status IN ('active','completed')").get(userId).published;
  const completed = db.prepare(`SELECT COUNT(*) AS trips FROM rides WHERE driver_id=? AND status='completed'`).get(userId).trips;
  const reservations = db.prepare(`SELECT COUNT(*) AS trips FROM reservations WHERE passenger_id=? AND status='confirmed'`).get(userId).trips;
  const sharedSeats = db.prepare(`SELECT COALESCE(SUM(seats),0) AS seats FROM reservations WHERE passenger_id=? AND status='confirmed'`).get(userId).seats;
  const communitySeats = db.prepare(`SELECT COALESCE(SUM(rs.seats),0) AS seats FROM rides r LEFT JOIN reservations rs ON rs.ride_id=r.id AND rs.status='confirmed' WHERE r.driver_id=?`).get(userId).seats;
  const points = Number(row.points || 0);
  const totalSeats = Number(sharedSeats || 0) + Number(communitySeats || 0);
  const co2 = Number((totalSeats * 1.8).toFixed(1));
  const level = ecoLevel(points);
  const badges = [
    { name: 'Primer viaje', code: 'P1', unlocked: points >= 60 },
    { name: 'Conexión verde', code: 'CV', unlocked: points >= 140 },
    { name: 'Parking colaborativo', code: 'PK', unlocked: points >= 240 },
    { name: 'Guardian ecológico', code: 'GE', unlocked: points >= 360 },
    { name: 'Bosque UTP', code: 'BU', unlocked: points >= 700 }
  ];
  return {
    points,
    level,
    published: Number(rides),
    completedTrips: Number(completed) + Number(reservations),
    sharedSeats: totalSeats,
    co2Kg: co2,
    badges,
    events: Number(row.events || 0),
    treeStage: Math.min(5, Math.max(1, Math.ceil(points / 140)))
  };
}
function communityStats() {
  const users = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='user'").get().count;
  const rides = db.prepare('SELECT COUNT(*) AS count FROM rides').get().count;
  const seats = db.prepare("SELECT COALESCE(SUM(seats),0) AS count FROM reservations WHERE status='confirmed'").get().count;
  const points = db.prepare('SELECT COALESCE(SUM(points),0) AS points FROM eco_events').get().points;
  return {
    users: Number(users),
    rides: Number(rides),
    sharedSeats: Number(seats),
    ecoPoints: Number(points),
    estimatedCo2Kg: Number((Number(seats) * 1.8).toFixed(1)),
    gasolineSavedLiters: Number((Number(seats) * 0.45).toFixed(1)),
    monthlySavingsPesos: Number((Number(seats) * 32).toFixed(0))
  };
}

function ridePublicSelect(where = 'WHERE 1=1', params = [], includePrivate = false) {
  return db.prepare(`
    SELECT r.*, u.name AS driver_name, u.email AS driver_email, u.career AS driver_career, u.student_id AS driver_student_id, u.verified AS driver_verified,
    (r.seats_total - COALESCE((SELECT SUM(seats) FROM reservations rs WHERE rs.ride_id=r.id AND rs.status='confirmed'),0)) AS seats_available
    FROM rides r JOIN users u ON u.id=r.driver_id
    ${where}
    ORDER BY r.departure_at ASC
  `).all(...params).map(row => {
    const passengers = db.prepare(`
      SELECT rs.id, rs.seats, u.id AS user_id, u.name, u.student_id, u.career
      FROM reservations rs JOIN users u ON u.id=rs.passenger_id
      WHERE rs.ride_id=? AND rs.status='confirmed'
      ORDER BY rs.created_at ASC
    `).all(row.id).map(p => ({ id: p.user_id, name: includePrivate ? p.name : p.name.split(' ')[0], studentId: includePrivate ? p.student_id : '', career: includePrivate ? p.career : '', seats: p.seats }));

    return {
      id: row.id,
      origin: row.origin,
      pickupPoint: row.pickup_point,
      destination: row.destination,
      departureAt: row.departure_at,
      seatsTotal: row.seats_total,
      seatsAvailable: Number(row.seats_available),
      contribution: row.contribution_cents / 100,
      vehicle: row.vehicle,
      color: row.color,
      plateLast4: row.plate_last4,
      notes: row.notes,
      routeType: row.route_type,
      connectionHub: row.connection_hub,
      parkingEligible: !!row.parking_eligible,
      parkingCode: includePrivate ? row.parking_code : '',
      parkingGeneratedAt: includePrivate ? row.parking_generated_at : null,
      passengerCount: passengers.length,
      passengers,
      status: row.status,
      createdAt: row.created_at,
      driver: {
        id: row.driver_id,
        name: row.driver_name,
        career: row.driver_career,
        studentId: row.driver_student_id,
        verified: !!row.driver_verified
      }
    };
  });
}

async function handleApi(req, res, url, ip) {
  if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, version: APP_VERSION, time: nowIso() });

  if (req.method === 'GET' && url.pathname === '/api/session') {
    const session = ensureSession(req, res);
    const user = session.row.user_id
      ? publicUser({ id: session.row.account_id, name: session.row.name, student_id: session.row.student_id, email: session.row.email, career: session.row.career, role: session.row.role, verified: session.row.verified, created_at: session.row.user_created_at })
      : null;
    return json(res, 200, { user, csrfToken: session.row.csrf_token, allowedDomains: ALLOWED_DOMAINS, community: communityStats() });
  }

  if (req.method === 'GET' && url.pathname === '/api/community-stats') return json(res, 200, { stats: communityStats() });

  if (req.method === 'GET' && url.pathname === '/api/parking/verify') {
    const code = cleanText(url.searchParams.get('codigo') || '', 120);
    if (!/^RUP-\d+-[A-Za-z0-9_-]{20,}$/.test(code)) return json(res, 400, { error: 'Código de pase inválido.' });
    const found = db.prepare('SELECT id FROM rides WHERE parking_code=?').get(code);
    if (!found) return json(res, 404, { error: 'Pase no encontrado.' });
    const ride = ridePublicSelect('WHERE r.id=?', [found.id], true)[0];
    const valid = !!ride && ride.parkingEligible && ride.passengerCount >= 2 && ride.status !== 'cancelled';
    return json(res, 200, { valid, pass: {
      code,
      passengerCount: ride.passengerCount,
      seatsConfirmed: ride.passengers.reduce((total, p) => total + Number(p.seats), 0),
      passengers: ride.passengers.map(p => ({ name: p.name, career: p.career, studentId: p.studentId, seats: p.seats })),
      driver: { name: ride.driver.name, studentId: ride.driver.studentId },
      origin: ride.origin,
      destination: ride.destination,
      departureAt: ride.departureAt,
      vehicle: ride.vehicle,
      color: ride.color,
      plateLast4: ride.plateLast4,
      status: ride.status,
      generatedAt: ride.parkingGeneratedAt
    } });
  }


  if (req.method === 'POST' && url.pathname === '/api/register') {
    if (!rateLimit(ip, 'register', 10, 15 * 60000)) return json(res, 429, { error: 'Demasiados intentos de registro.' });
    const session = ensureSession(req, res); if (!requireCsrf(req, res, session)) return;
    const body = await readBody(req);
    const name = cleanText(body.name, 80);
    const studentId = cleanText(body.studentId, 24).toUpperCase();
    const email = normalizeEmail(body.email);
    const career = cleanText(body.career, 80);
    const password = String(body.password || '');
    if (name.length < 3) return json(res, 400, { error: 'Nombre inválido.' });
    if (studentId.length < 5) return json(res, 400, { error: 'Matrícula inválida.' });
    if (!isValidEmail(email) || !isAllowedDomain(email)) return json(res, 400, { error: 'Usa un correo @utpuebla.edu.mx o @alumno.utpuebla.edu.mx.' });
    if (career.length < 4) return json(res, 400, { error: 'Indica tu carrera.' });
    if (!isStrongPassword(password)) return json(res, 400, { error: 'La contraseña debe incluir mayúscula, minúscula y número.' });
    try {
      const createdAt = nowIso();
      const result = db.prepare("INSERT INTO users (name, student_id, email, career, password_hash, verified, role, created_at) VALUES (?, ?, ?, ?, ?, 1, 'user', ?)")
        .run(name, studentId, email, career, hashPassword(password), createdAt);
      db.prepare("INSERT INTO eco_events (user_id, points, reason, created_at) VALUES (?, 30, 'Bienvenida EcoRodando', ?)").run(Number(result.lastInsertRowid), createdAt);
      const fresh = rotateSession(res, session, Number(result.lastInsertRowid));
      return json(res, 201, { user: publicUser({ id: Number(result.lastInsertRowid), name, student_id: studentId, email, career, role: 'user', verified: 1, created_at: createdAt }), csrfToken: fresh.csrf });
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) return json(res, 409, { error: 'La matrícula o el correo ya están registrados.' });
      throw e;
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/login') {
    if (!rateLimit(ip, 'login', 15, 15 * 60000)) return json(res, 429, { error: 'Demasiados intentos de acceso.' });
    const session = ensureSession(req, res); if (!requireCsrf(req, res, session)) return;
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    const user = getUserByEmail(email);
    if (!user || !verifyPassword(password, user.password_hash)) return json(res, 401, { error: 'Correo o contraseña incorrectos.' });
    const fresh = rotateSession(res, session, user.id);
    return json(res, 200, { user: publicUser(user), csrfToken: fresh.csrf });
  }

  if (req.method === 'POST' && url.pathname === '/api/logout') {
    const session = requireAuth(req, res); if (!session) return; if (!requireCsrf(req, res, session)) return;
    db.prepare('DELETE FROM sessions WHERE id=?').run(session.row.id);
    const secure = NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `rodando_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${secure}`);
    return json(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/api/rides') {
    const origin = cleanText(url.searchParams.get('origin') || '', 60);
    const date = cleanText(url.searchParams.get('date') || '', 10);
    const routeType = cleanText(url.searchParams.get('routeType') || '', 20);
    const conditions = ["WHERE r.status='active' AND r.departure_at>=?"];
    const params = [new Date(Date.now() - 5 * 60000).toISOString()];
    if (origin) { conditions.push('AND LOWER(r.origin) LIKE LOWER(?)'); params.push(`%${origin}%`); }
    if (date) { conditions.push('AND substr(r.departure_at,1,10)=?'); params.push(date); }
    if (routeType === 'connection' || routeType === 'direct') { conditions.push('AND r.route_type=?'); params.push(routeType); }
    return json(res, 200, { rides: ridePublicSelect(conditions.join(' '), params) });
  }

  if (req.method === 'POST' && url.pathname === '/api/rides') {
    const session = requireAuth(req, res); if (!session) return; if (!requireCsrf(req, res, session)) return;
    const body = await readBody(req);
    const origin = cleanText(body.origin, 60);
    const pickupPoint = cleanText(body.pickupPoint, 90);
    const departureAt = safeFutureDateTime(body.departureAt);
    const seatsTotal = parseIntRange(body.seatsTotal, 1, 6);
    const contribution = parseMoney(body.contribution);
    const vehicle = cleanText(body.vehicle, 60);
    const color = cleanText(body.color, 30);
    const plateLast4 = cleanText(body.plateLast4, 4).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const notes = cleanText(body.notes, 220);
    const routeType = cleanText(body.routeType || 'direct', 20) === 'connection' ? 'connection' : 'direct';
    const connectionHub = cleanText(body.connectionHub || '', 80);
    const parkingEligible = body.parkingEligible ? 1 : 0;
    if (!origin || !pickupPoint || !departureAt || !seatsTotal || contribution === null || vehicle.length < 3 || color.length < 3 || plateLast4.length < 3) {
      return json(res, 400, { error: 'Revisa los datos de la ruta.' });
    }
    if (routeType === 'connection' && connectionHub.length < 3) return json(res, 400, { error: 'Indica el punto de conexión.' });
    const result = db.prepare(`INSERT INTO rides
      (driver_id, origin, pickup_point, destination, departure_at, seats_total, contribution_cents, vehicle, color, plate_last4, notes, route_type, connection_hub, parking_eligible, status, created_at)
      VALUES (?, ?, ?, 'Universidad Tecnológica de Puebla', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`)
      .run(session.row.user_id, origin, pickupPoint, departureAt, seatsTotal, contribution, vehicle, color, plateLast4, notes, routeType, routeType === 'connection' ? connectionHub : '', parkingEligible, nowIso());
    db.prepare("INSERT INTO eco_events (user_id, points, reason, created_at) VALUES (?, 20, 'Ruta publicada', ?)").run(session.row.user_id, nowIso());
    return json(res, 201, { ride: ridePublicSelect('WHERE r.id=?', [Number(result.lastInsertRowid)])[0] });
  }

  const reserveMatch = url.pathname.match(/^\/api\/rides\/(\d+)\/reserve$/);
  if (reserveMatch) {
    const rideId = Number(reserveMatch[1]);
    if (req.method === 'POST') {
      const session = requireAuth(req, res); if (!session) return; if (!requireCsrf(req, res, session)) return;
      const body = await readBody(req);
      const seats = parseIntRange(body.seats, 1, 3);
      if (!seats) return json(res, 400, { error: 'Número de lugares inválido.' });
      try {
        db.exec('BEGIN IMMEDIATE');
        const ride = db.prepare("SELECT *, (seats_total - COALESCE((SELECT SUM(seats) FROM reservations WHERE ride_id=rides.id AND status='confirmed'),0)) AS seats_available FROM rides WHERE id=?").get(rideId);
        if (!ride || ride.status !== 'active' || new Date(ride.departure_at).getTime() < Date.now()) throw Object.assign(new Error('Ruta no disponible.'), { status: 404 });
        if (ride.driver_id === session.row.user_id) throw Object.assign(new Error('No puedes reservar tu propia ruta.'), { status: 400 });
        if (Number(ride.seats_available) < seats) throw Object.assign(new Error('No hay suficientes lugares disponibles.'), { status: 409 });
        const existing = db.prepare('SELECT * FROM reservations WHERE ride_id=? AND passenger_id=?').get(rideId, session.row.user_id);
        if (existing && existing.status === 'confirmed') throw Object.assign(new Error('Ya reservaste esta ruta.'), { status: 409 });
        if (existing) db.prepare("UPDATE reservations SET seats=?, status='confirmed', created_at=? WHERE id=?").run(seats, nowIso(), existing.id);
        else db.prepare("INSERT INTO reservations (ride_id, passenger_id, seats, status, created_at) VALUES (?, ?, ?, 'confirmed', ?)").run(rideId, session.row.user_id, seats, nowIso());
        db.prepare("INSERT INTO eco_events (user_id, points, reason, created_at) VALUES (?, 15, 'Lugar reservado', ?)").run(session.row.user_id, nowIso());
        db.exec('COMMIT');
        return json(res, 201, { ride: ridePublicSelect('WHERE r.id=?', [rideId])[0] });
      } catch (e) {
        try { db.exec('ROLLBACK'); } catch {}
        return json(res, e.status || 500, { error: e.status ? e.message : 'No fue posible reservar.' });
      }
    }
    if (req.method === 'DELETE') {
      const session = requireAuth(req, res); if (!session) return; if (!requireCsrf(req, res, session)) return;
      const result = db.prepare("UPDATE reservations SET status='cancelled' WHERE ride_id=? AND passenger_id=? AND status='confirmed'").run(rideId, session.row.user_id);
      if (!result.changes) return json(res, 404, { error: 'No existe una reserva activa.' });
      return json(res, 200, { ok: true });
    }
  }

  const rideIdMatch = url.pathname.match(/^\/api\/rides\/(\d+)$/);
  if (rideIdMatch && req.method === 'DELETE') {
    const session = requireAuth(req, res); if (!session) return; if (!requireCsrf(req, res, session)) return;
    const result = db.prepare("UPDATE rides SET status='cancelled' WHERE id=? AND driver_id=? AND status='active'").run(Number(rideIdMatch[1]), session.row.user_id);
    if (!result.changes) return json(res, 404, { error: 'No se pudo cancelar la ruta.' });
    return json(res, 200, { ok: true });
  }

  const completeMatch = url.pathname.match(/^\/api\/rides\/(\d+)\/complete$/);
  if (completeMatch && req.method === 'POST') {
    const session = requireAuth(req, res); if (!session) return; if (!requireCsrf(req, res, session)) return;
    const rideId = Number(completeMatch[1]);
    const ride = db.prepare('SELECT * FROM rides WHERE id=?').get(rideId);
    if (!ride || ride.driver_id !== session.row.user_id) return json(res, 403, { error: 'Solo el conductor puede finalizar el viaje.' });
    if (ride.status !== 'active') return json(res, 409, { error: 'La ruta ya no está activa.' });
    if (new Date(ride.departure_at).getTime() > Date.now()) return json(res, 400, { error: 'El viaje solo puede finalizarse después de la hora de salida.' });
    const confirmed = db.prepare("SELECT COUNT(*) AS total FROM reservations WHERE ride_id=? AND status='confirmed'").get(rideId).total;
    if (confirmed < 1) return json(res, 400, { error: 'El viaje requiere al menos un pasajero confirmado.' });
    db.prepare("UPDATE rides SET status='completed' WHERE id=?").run(rideId);
    const passengerSeats = db.prepare("SELECT COALESCE(SUM(seats),0) AS seats FROM reservations WHERE ride_id=? AND status='confirmed'").get(rideId).seats;
    db.prepare("INSERT INTO eco_events (user_id, points, reason, created_at) VALUES (?, ?, 'Viaje completado como conductor', ?)").run(session.row.user_id, 40 + (Number(passengerSeats) * 10), nowIso());
    return json(res, 200, { ok: true, ride: ridePublicSelect('WHERE r.id=?', [rideId])[0], eco: userEco(session.row.user_id) });
  }

  const parkingMatch = url.pathname.match(/^\/api\/rides\/(\d+)\/parking-pass$/);
  if (parkingMatch && req.method === 'POST') {
    const session = requireAuth(req, res); if (!session) return; if (!requireCsrf(req, res, session)) return;
    const rideId = Number(parkingMatch[1]);
    const ride = ridePublicSelect('WHERE r.id=?', [rideId], true)[0];
    if (!ride || ride.driver.id !== session.row.user_id) return json(res, 403, { error: 'Solo el conductor puede generar el pase.' });
    if (!ride.parkingEligible) return json(res, 400, { error: 'Esta ruta no participa en Rodando Parking.' });
    if (ride.passengerCount < 2) return json(res, 400, { error: 'Se requieren al menos 2 pasajeros confirmados.' });
    const code = ride.parkingCode || `RUP-${ride.id}-${randomToken(18)}`;
    const generatedAt = ride.parkingGeneratedAt || nowIso();
    if (!ride.parkingCode) {
      db.prepare('UPDATE rides SET parking_code=?, parking_generated_at=? WHERE id=?').run(code, generatedAt, ride.id);
      db.prepare("INSERT INTO eco_events (user_id, points, reason, created_at) VALUES (?, 35, 'Rodando Parking', ?)").run(session.row.user_id, generatedAt);
    }
    const updated = ridePublicSelect('WHERE r.id=?', [ride.id], true)[0];
    const qrPayload = `/verificar-pase.html?codigo=${encodeURIComponent(code)}`;
    return json(res, 200, { pass: { code, generatedAt, passengerCount: updated.passengerCount, ride: updated, qrPayload } });
  }

  if (req.method === 'GET' && url.pathname === '/api/dashboard') {
    const session = requireAuth(req, res); if (!session) return;
    const published = ridePublicSelect('WHERE r.driver_id=?', [session.row.user_id], true);
    const reservations = db.prepare(`
      SELECT rs.id AS reservation_id, rs.seats, rs.status AS reservation_status, r.id AS ride_id
      FROM reservations rs JOIN rides r ON r.id=rs.ride_id
      WHERE rs.passenger_id=? ORDER BY r.departure_at ASC
    `).all(session.row.user_id).map(row => ({
      reservationId: row.reservation_id,
      seats: row.seats,
      reservationStatus: row.reservation_status,
      ride: ridePublicSelect('WHERE r.id=?', [row.ride_id], true)[0]
    }));
    const eco = userEco(session.row.user_id);
    return json(res, 200, { published, reservations, eco });
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/overview') {
    const session = requireAdmin(req, res); if (!session) return;
    const overview = {
      totals: {
        users: db.prepare("SELECT COUNT(*) AS count FROM users WHERE role='user'").get().count,
        rides: db.prepare('SELECT COUNT(*) AS count FROM rides').get().count,
        activeRides: db.prepare("SELECT COUNT(*) AS count FROM rides WHERE status='active'").get().count,
        reservations: db.prepare("SELECT COUNT(*) AS count FROM reservations WHERE status='confirmed'").get().count,
        parkingEnabled: db.prepare('SELECT COUNT(*) AS count FROM rides WHERE parking_eligible=1').get().count,
        connectionRides: db.prepare("SELECT COUNT(*) AS count FROM rides WHERE route_type='connection'").get().count,
        ecoEvents: db.prepare('SELECT COUNT(*) AS count FROM eco_events').get().count
      },
      community: communityStats()
    };
    return json(res, 200, overview);
  }

  if (req.method === 'GET' && url.pathname === '/api/admin/users') {
    const session = requireAdmin(req, res); if (!session) return;
    const users = db.prepare(`SELECT u.*,
      (SELECT COUNT(*) FROM rides r WHERE r.driver_id=u.id) AS ride_count,
      (SELECT COUNT(*) FROM reservations rs WHERE rs.passenger_id=u.id AND rs.status='confirmed') AS reservation_count,
      (SELECT COALESCE(SUM(ev.points),0) FROM eco_events ev WHERE ev.user_id=u.id) AS eco_points
      FROM users u ORDER BY u.role DESC, u.created_at DESC`).all().map(row => ({
        id: row.id,
        name: row.name,
        studentId: row.student_id,
        email: row.email,
        career: row.career,
        role: row.role,
        verified: !!row.verified,
        rideCount: Number(row.ride_count || 0),
        reservationCount: Number(row.reservation_count || 0),
        ecoPoints: Number(row.eco_points || 0),
        createdAt: row.created_at
      }));
    return json(res, 200, { users });
  }

  const adminUserMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)$/);
  if (adminUserMatch) {
    const session = requireAdmin(req, res); if (!session) return;
    const userId = Number(adminUserMatch[1]);
    if (req.method === 'PATCH') {
      if (!requireCsrf(req, res, session)) return;
      const body = await readBody(req);
      const role = body.role === 'admin' ? 'admin' : 'user';
      const verified = body.verified ? 1 : 0;
      db.prepare('UPDATE users SET role=?, verified=? WHERE id=?').run(role, verified, userId);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'DELETE') {
      if (!requireCsrf(req, res, session)) return;
      if (userId === session.row.user_id) return json(res, 400, { error: 'No puedes eliminar tu propia cuenta.' });
      const result = db.prepare('DELETE FROM users WHERE id=?').run(userId);
      if (!result.changes) return json(res, 404, { error: 'Usuario no encontrado.' });
      return json(res, 200, { ok: true });
    }
  }

  return json(res, 404, { error: 'Endpoint no encontrado.' });
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const normalized = path.posix.normalize(pathname).replace(/^\.\.(\/|\\)/, '');
  const filePath = path.join(PUBLIC_ROOT, normalized);
  if (!filePath.startsWith(PUBLIC_ROOT)) { res.statusCode = 403; return res.end('Forbidden'); }
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      const fallback = path.join(PUBLIC_ROOT, 'index.html');
      if (req.method === 'GET' && !path.extname(pathname)) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return fs.createReadStream(fallback).pipe(res);
      }
      res.statusCode = 404; return res.end('Not Found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
    if (['.html', '.css', '.js', '.webmanifest'].includes(ext)) res.setHeader('Cache-Control', 'no-cache');
    else res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  securityHeaders(res);
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const ip = req.socket.remoteAddress || 'unknown';
  try {
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url, ip);
    if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'Método no permitido.' });
    return serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    const status = error.status || 500;
    return json(res, status, { error: status === 500 ? 'Error interno del servidor.' : error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Rodando UTP GreenShare en http://localhost:${PORT}`);
  console.log(`Cuenta de administración: ${ADMIN_EMAIL}`);
  console.log(`Base de datos: ${DB_PATH}`);
});