'use strict';

/**
 * Pruebas de integración v6.4 para Rodando UTP GreenShare.
 * - Usa la base PostgreSQL real y limpia al final únicamente los registros creados por la prueba.
 * - No imprime contraseñas ni cadenas de conexión.
 * Ejecutar con: node scripts/test-v64.js
 */
require('dotenv').config();
const assert = require('node:assert/strict');
const pool = require('../db');

const BASE = process.env.TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@utpuebla.edu.mx';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const DEMO_PASSWORD = 'DemoEco2026';
const results = [];
let testRideId = null;
const startedAt = new Date().toISOString();

function ok(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, error) {
  results.push({ name, ok: false, detail: error.message });
  console.error(`FAIL  ${name} — ${error.message}`);
}

async function check(name, fn) {
  try { const detail = await fn(); ok(name, detail); }
  catch (error) { fail(name, error); throw error; }
}

function createClient() {
  return { cookie: '', csrf: '' };
}

async function request(client, path, { method = 'GET', body, headers = {}, raw = false } = {}) {
  const opts = { method, redirect: 'manual', headers: { Accept: 'application/json', ...headers } };
  if (client.cookie) opts.headers.Cookie = client.cookie;
  if (client.csrf && !['GET', 'HEAD'].includes(method)) opts.headers['X-CSRF-Token'] = client.csrf;
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, opts);
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  const sessionCookie = setCookies.map(value => value.split(';')[0]).find(value => value.startsWith('rodando_session='));
  if (sessionCookie) client.cookie = sessionCookie;
  if (raw) return { res, buffer: Buffer.from(await res.arrayBuffer()) };
  let data = {};
  try { data = await res.json(); } catch {}
  return { res, data };
}

async function bootstrap(client) {
  const { res, data } = await request(client, '/api/session');
  assert.equal(res.status, 200, 'No se pudo abrir la sesión');
  client.csrf = data.csrfToken;
  return data;
}

async function login(client, email, password) {
  await bootstrap(client);
  const { res, data } = await request(client, '/api/login', { method: 'POST', body: { email, password } });
  assert.equal(res.status, 200, `Login falló para ${email}: ${data.error || res.status}`);
  client.csrf = data.csrfToken;
  return data.user;
}

async function cleanup() {
  if (!testRideId) return;
  const id = testRideId;
  await pool.query('DELETE FROM parking_passes WHERE ride_id=$1', [id]);
  await pool.query('DELETE FROM reservations WHERE ride_id=$1', [id]);
  await pool.query('DELETE FROM rides WHERE id=$1', [id]);
  await pool.query(`DELETE FROM eco_events WHERE created_at >= $1 AND reason IN
    ('Ruta publicada','Lugar reservado','Rodando Parking')`, [startedAt]);
  console.log(`INFO  Datos de prueba eliminados (viaje ${id}).`);
}

(async () => {
  const mariana = createClient();
  const diego = createClient();
  const valeria = createClient();
  const admin = createClient();

  try {
    await check('Salud del backend PostgreSQL', async () => {
      const { res, data } = await request(createClient(), '/api/health');
      assert.equal(res.status, 200);
      assert.equal(data.database, 'postgresql');
      assert.equal(data.ok, true);
      return data.version;
    });

    await check('Inicio de sesión de conductor, pasajero, usuario ajeno y administrador', async () => {
      const driver = await login(mariana, 'mariana.lopez@alumno.utpuebla.edu.mx', DEMO_PASSWORD);
      const passenger = await login(diego, 'diego.hernandez@alumno.utpuebla.edu.mx', DEMO_PASSWORD);
      const outsider = await login(valeria, 'valeria.cruz@alumno.utpuebla.edu.mx', DEMO_PASSWORD);
      assert.equal(driver.role, 'user');
      assert.equal(passenger.role, 'user');
      assert.equal(outsider.role, 'user');
      if (ADMIN_PASSWORD) {
        const adminUser = await login(admin, ADMIN_EMAIL, ADMIN_PASSWORD);
        assert.equal(adminUser.role, 'admin');
        return '4 sesiones activas';
      }
      return '3 sesiones activas (admin sin contraseña configurada)';
    });

    await check('Listado público sin datos privados y con nuevos campos', async () => {
      const { res, data } = await request(createClient(), '/api/rides');
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(data.rides));
      for (const ride of data.rides) {
        assert.equal(ride.parkingCode, '', 'El listado público no debe revelar folios');
        assert.equal(ride.plateFull, '', 'El listado público no debe revelar placas');
        assert.ok(ride.occupantCount >= 1);
        assert.ok(['to_utp', 'from_utp'].includes(ride.direction));
        for (const passenger of ride.passengers) {
          assert.equal(passenger.studentId, '', 'El listado público no debe revelar matrículas');
          assert.equal(passenger.career, '', 'El listado público no debe revelar carreras');
        }
      }
      return `${data.rides.length} viajes públicos verificados`;
    });

    await check('Publicar viaje de regreso desde la UTP con coordenadas reales', async () => {
      const departure = new Date(Date.now() + 3 * 3600000).toISOString();
      const { res, data } = await request(mariana, '/api/rides', {
        method: 'POST',
        body: {
          origin: 'UTP', destination: 'Cholula', direction: 'from_utp',
          pickupPoint: 'Prueba técnica v6.4', departureAt: departure,
          seatsTotal: 1, contribution: 25, vehicle: 'Vehículo de prueba', color: 'Verde',
          plateFull: 'TST123A', routeType: 'direct', connectionHub: '',
          parkingEligible: true, notes: 'Registro temporal de pruebas automatizadas',
          originLat: 19.0433, originLng: -98.1981,
          destinationLat: 19.0641, destinationLng: -98.3035,
          pickupLat: 19.0435, pickupLng: -98.1983
        }
      });
      assert.equal(res.status, 201, data.error || 'No se pudo publicar');
      testRideId = data.ride.id;
      assert.equal(data.ride.direction, 'from_utp');
      assert.equal(data.ride.pickupLat, 19.0435);
      assert.equal(data.ride.occupantCount, 1);
      return `viaje ${testRideId} creado`;
    });

    await check('Filtros por sentido, zona, fecha y cercanía', async () => {
      const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
      const params = new URLSearchParams({
        origin: 'UTP', direction: 'from_utp', date,
        nearby: '1', lat: '19.0433', lng: '-98.1981', radius: '1'
      });
      const { res, data } = await request(createClient(), `/api/rides?${params}`);
      assert.equal(res.status, 200);
      const found = data.rides.find(ride => ride.id === testRideId);
      assert.ok(found, 'El viaje de prueba no apareció con los filtros');
      assert.ok(found.distanceKm != null && found.distanceKm <= 1);
      assert.equal(data.nearby.radiusKm, 1);
      return `${found.distanceKm} km del punto consultado`;
    });

    await check('Reserva real y bloqueo de sobreventa', async () => {
      const first = await request(diego, `/api/rides/${testRideId}/reserve`, { method: 'POST', body: { seats: 1 } });
      assert.ok([200, 201].includes(first.res.status), first.data.error || 'Reserva falló');
      const second = await request(valeria, `/api/rides/${testRideId}/reserve`, { method: 'POST', body: { seats: 1 } });
      assert.equal(second.res.status, 409, 'La sobreventa debió bloquearse');
      const detail = await request(mariana, '/api/dashboard');
      const ride = detail.data.published.find(item => item.id === testRideId);
      assert.equal(ride.occupantCount, 2);
      assert.equal(ride.seatsConfirmed, 1);
      assert.equal(ride.passengerCount, 1);
      return '1 conductor + 1 plaza confirmada';
    });

    await check('Usuario ajeno no puede generar ni descargar el pase', async () => {
      const generate = await request(valeria, `/api/rides/${testRideId}/parking-pass`, { method: 'POST' });
      assert.equal(generate.res.status, 403);
      const pdf = await request(valeria, `/api/rides/${testRideId}/parking-pass.pdf`, { raw: true });
      assert.equal(pdf.res.status, 403);
      return '403 en generación y PDF';
    });

    await check('Conductor genera el pase con ocupantes correctos', async () => {
      const { res, data } = await request(mariana, `/api/rides/${testRideId}/parking-pass`, { method: 'POST' });
      assert.equal(res.status, 200, data.error || 'No se generó el pase');
      const pass = data.pass;
      assert.match(pass.code, new RegExp(`^RUP-${testRideId}-[A-Za-z0-9_-]{20,}$`));
      assert.equal(pass.occupantCount, 2);
      assert.equal(pass.seatsConfirmed, 1);
      assert.equal(pass.passengerCount, 1);
      assert.equal(pass.status, 'vigente');
      assert.equal(pass.driver.name, 'Mariana López');
      assert.equal(pass.plate, 'TST123A');
      return pass.code;
    });

    await check('Pasajero confirmado obtiene el mismo pase y folio', async () => {
      const driverPass = await request(mariana, `/api/rides/${testRideId}/parking-pass`);
      const passengerPass = await request(diego, `/api/rides/${testRideId}/parking-pass`, { method: 'POST' });
      assert.equal(passengerPass.res.status, 200, passengerPass.data.error || 'Pasajero sin acceso');
      assert.equal(passengerPass.data.pass.code, driverPass.data.pass.code);
      assert.equal(passengerPass.data.pass.occupantCount, 2);
      assert.equal(passengerPass.data.pass.driver.name, 'Mariana López');
      return 'mismo folio para conductor y pasajero';
    });

    await check('PDF real descargable con nombre RodandoParking', async () => {
      const { res, buffer } = await request(mariana, `/api/rides/${testRideId}/parking-pass.pdf`, { raw: true });
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') || '', /application\/pdf/);
      assert.match(res.headers.get('content-disposition') || '', /RodandoParking_RUP-/);
      assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
      assert.ok(buffer.length > 10000, 'El PDF es demasiado pequeño');
      return `${buffer.length} bytes`;
    });

    await check('Verificación pública mínima sin datos personales', async () => {
      const driverPass = await request(mariana, `/api/rides/${testRideId}/parking-pass`);
      const code = driverPass.data.pass.code;
      const { res, data } = await request(createClient(), `/api/parking/verify?codigo=${encodeURIComponent(code)}`);
      assert.equal(res.status, 200);
      assert.equal(data.authorized, false);
      assert.equal(data.valid, true);
      assert.equal(data.pass.driver.name, 'Conductor verificado');
      assert.equal(data.pass.plate, undefined);
      assert.equal(data.pass.passengers[0].name, 'Pasajero 1');
      assert.equal(data.pass.passengers[0].studentId, undefined);
      return 'datos enmascarados';
    });

    await check('Verificación autorizada muestra nombres, matrícula y placa', async () => {
      const driverPass = await request(mariana, `/api/rides/${testRideId}/parking-pass`);
      const code = driverPass.data.pass.code;
      const { res, data } = await request(diego, `/api/parking/verify?codigo=${encodeURIComponent(code)}`);
      assert.equal(res.status, 200);
      assert.equal(data.authorized, true);
      assert.equal(data.pass.driver.name, 'Mariana López');
      assert.equal(data.pass.driver.studentId, 'UTP24001');
      assert.equal(data.pass.plate, 'TST123A');
      assert.equal(data.pass.passengers[0].name, 'Diego Hernández');
      assert.equal(data.pass.passengers[0].studentId, 'UTP24002');
      return 'participantes autorizados';
    });

    await check('Cancelar el viaje invalida el pase y bloquea el PDF', async () => {
      const cancel = await request(mariana, `/api/rides/${testRideId}`, { method: 'DELETE' });
      assert.equal(cancel.res.status, 200, cancel.data.error || 'No se canceló');
      assert.equal(cancel.data.parkingPassInvalidated, true);
      const driverPass = await request(mariana, `/api/rides/${testRideId}/parking-pass`);
      const code = driverPass.data.pass.code;
      const verify = await request(createClient(), `/api/parking/verify?codigo=${encodeURIComponent(code)}`);
      assert.equal(verify.res.status, 200);
      assert.equal(verify.data.valid, false);
      assert.equal(verify.data.pass.status, 'cancelado');
      const pdf = await request(mariana, `/api/rides/${testRideId}/parking-pass.pdf`, { raw: true });
      assert.equal(pdf.res.status, 409);
      return 'estado cancelado e invalidación confirmados';
    });

    await check('Laboratorio EcoRodando exclusivo para administración', async () => {
      const denied = await request(mariana, '/api/admin/eco-lab');
      assert.equal(denied.res.status, 403);
      if (!ADMIN_PASSWORD) return '403 para usuario normal; admin no probado';
      const allowed = await request(admin, '/api/admin/eco-lab');
      assert.equal(allowed.res.status, 200, allowed.data.error || 'Admin sin acceso');
      assert.equal(allowed.data.mode, 'simulation');
      assert.equal(allowed.data.readOnly, true);
      assert.match(allowed.data.notice, /MODO SIMULACIÓN/);
      assert.equal(allowed.data.levels.length, 5);
      return '403 para usuario, metadatos de solo lectura para admin';
    });

    await check('PWA y recursos estáticos actualizados', async () => {
      const sw = await request(createClient(), '/service-worker.js', { raw: true });
      const swText = sw.buffer.toString();
      assert.equal(sw.res.status, 200);
      const swVersion = swText.match(/const VERSION = '([^']+)'/);
      assert.equal(swVersion?.[1], '6.4.1', 'Versión del service worker desactualizada');
      assert.match(swText, /rodando-utp-greenshare-v\$\{VERSION\}/);
      assert.match(swText, /PRIVATE_PATH_PREFIXES = \['\/api\/', '\/auth\/'\]/);
      assert.match(swText, /\/vendor\/leaflet\/leaflet\.js/);
      const manifest = await request(createClient(), '/manifest.webmanifest');
      assert.equal(manifest.res.status, 200);
      assert.equal(manifest.data.short_name, 'Rodando UTP');
      assert.ok(Array.isArray(manifest.data.shortcuts));
      const css = await request(createClient(), '/css/styles.css', { raw: true });
      const cssText = css.buffer.toString();
      assert.match(cssText, /\.eco-world-scene/);
      assert.match(cssText, /\.rides-map/);
      const html = await request(createClient(), '/', { raw: true });
      const expectedVersion = swVersion[1].replace(/\./g, '\\.');
      assert.match(html.buffer.toString(), new RegExp(`styles\\.css\\?v=${expectedVersion}`));
      return `service worker v${swVersion[1]}, manifest, CSS y HTML`;
    });

    const failed = results.filter(item => !item.ok);
    console.log(`\nRESULTADO: ${results.length - failed.length}/${results.length} pruebas correctas.`);
    if (failed.length) process.exitCode = 1;
  } catch (error) {
    console.error(`\nPrueba abortada: ${error.message}`);
    process.exitCode = 1;
  } finally {
    try { await cleanup(); } catch (error) { console.error(`No se pudo limpiar: ${error.message}`); process.exitCode = 1; }
    await pool.end().catch(() => {});
  }
})();
