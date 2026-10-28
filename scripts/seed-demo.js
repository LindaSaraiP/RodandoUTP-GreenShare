'use strict';
// Datos ficticios: solo para demostración académica.
// La carga es explícita y solo funciona en BD sin estudiantes.
const crypto = require('node:crypto');
const pool = require('../db');
const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) =>
  `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;

const accounts = [
  ['Mariana López', 'UTP24001', 'mariana.lopez@alumno.utpuebla.edu.mx', 'Desarrollo de Software'],
  ['Diego Hernández', 'UTP24002', 'diego.hernandez@alumno.utpuebla.edu.mx', 'Mecatrónica'],
  ['Valeria Cruz', 'UTP24003', 'valeria.cruz@alumno.utpuebla.edu.mx', 'Procesos Industriales'],
  ['José Ramírez', 'UTP24004', 'jose.ramirez@alumno.utpuebla.edu.mx', 'Logística'],
  ['Andrea Gómez', 'UTP24005', 'andrea.gomez@alumno.utpuebla.edu.mx', 'Energías Renovables'],
  ['Sofía Torres', 'UTP24006', 'sofia.torres@alumno.utpuebla.edu.mx', 'Nanotecnología'],
  ['Luis Ortega', 'UTP24007', 'luis.ortega@alumno.utpuebla.edu.mx', 'Mantenimiento Industrial'],
  ['Camila Flores', 'UTP24008', 'camila.flores@alumno.utpuebla.edu.mx', 'Diseño Digital'],
  ['Carlos Medina', 'UTP24009', 'carlos.medina@alumno.utpuebla.edu.mx', 'Negocios'],
  ['Fernanda Ríos', 'UTP24010', 'fernanda.rios@alumno.utpuebla.edu.mx', 'Redes Inteligentes'],
  ['Miguel Santos', 'UTP24011', 'miguel.santos@alumno.utpuebla.edu.mx', 'Automatización'],
  ['Paula Vargas', 'UTP24012', 'paula.vargas@utpuebla.edu.mx', 'Administración']
];
const origins = ['Cholula', 'Angelópolis', 'Amozoc', 'La Paz', 'Bosques de San Sebastián', 'Mayorazgo', 'Xonaca', 'San Ramón', 'San Pedro Cholula', 'Cuautlancingo', 'Amalucan', 'Forjadores'];
const hubs = ['Parque Puebla', 'Explanada Puebla', 'Solesta', 'CAPU', 'Paseo Destino', 'Plaza Dorada'];
const vehicles = ['Nissan Versa', 'Kia Rio', 'Chevrolet Aveo', 'Mazda 2', 'Volkswagen Vento', 'Seat Ibiza'];
const colors = ['Blanco', 'Verde', 'Gris', 'Azul', 'Negro', 'Plateado'];
const reasons = ['Viaje compartido', 'Conductor ecológico', 'Rodando Parking', 'Reserva puntual', 'Semana verde', 'Logro de comunidad'];

async function seed() {
  if (process.env.ALLOW_DEMO_SEED !== 'true') {
    throw new Error('Carga deshabilitada. Para datos ficticios, pon ALLOW_DEMO_SEED=true en .env y vuelve a intentarlo.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = (await client.query("SELECT COUNT(*) AS n FROM users WHERE role='user'")).rows[0].n;
    if (Number(existing) > 0) throw new Error('Ya hay usuarios normales en Neon. Se canceló la carga para no duplicar ni modificar registros.');
    const userIds = [];
    for (const [name, studentId, email, career] of accounts) {
      const { rows } = await client.query(`INSERT INTO users (name, student_id, email, career, password_hash, verified, role, created_at)
        VALUES ($1,$2,$3,$4,$5,TRUE,'user',NOW()) RETURNING id`,
        [name, studentId, email, career, hashPassword('DemoEco2026')]);
      userIds.push(rows[0].id);
    }
    for (let i = 0; i < 12; i++) {
      const isPast = i < 6;
      const date = new Date(Date.now() + (isPast ? -(7 - i) : i + 1) * 86400000);
      date.setHours(6 + (i % 5), 20 + (i * 7) % 30, 0, 0);
      const type = i % 3 === 0 ? 'connection' : 'direct';
      const start = type === 'connection' ? hubs[i % hubs.length] : `Paradero ${origins[i]}`;
      const { rows } = await client.query(`INSERT INTO rides (driver_id,origin,pickup_point,departure_at,
        seats_total,contribution_cents,vehicle,color,plate_last4,notes,route_type,connection_hub,parking_eligible,status,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW()) RETURNING id`,
        [userIds[i], origins[i], start, date.toISOString(), 3 + i % 2, (25 + (i % 4) * 5) * 100,
          vehicles[i % vehicles.length], colors[i % colors.length], `${1000 + i}`.slice(-4),
          type === 'connection' ? 'Ruta ecológica con conexión.' : 'Ruta directa para compartir viaje.',
          type, type === 'connection' ? hubs[(i + 2) % hubs.length] : '', i % 2 === 0,
          isPast ? 'completed' : 'active']);
      const rideId = rows[0].id;
      // Para evitar que el conductor se reserve a sí mismo.
      const other = userIds.filter(id => id !== userIds[i]);
      const a = other[(i + 1) % other.length], b = other[(i + 3) % other.length];
      await client.query("INSERT INTO reservations (ride_id,passenger_id,seats,status,created_at) VALUES ($1,$2,1,'confirmed',NOW())", [rideId, a]);
      if (i % 2 === 0) await client.query("INSERT INTO reservations (ride_id,passenger_id,seats,status,created_at) VALUES ($1,$2,1,'confirmed',NOW())", [rideId, b]);
    }
    for (let i = 0; i < 12; i++) {
      await client.query('INSERT INTO eco_events (user_id,points,reason,created_at) VALUES ($1,$2,$3,NOW())',
        [userIds[i], 60 + i % 4 * 15, reasons[i % reasons.length]]);
      if (i < 6) await client.query('INSERT INTO eco_events (user_id,points,reason,created_at) VALUES ($1,$2,$3,NOW())',
        [userIds[i], 25 + i % 3 * 10, reasons[(i + 2) % reasons.length]]);
    }
    await client.query('COMMIT');
    console.log('Datos ficticios cargados: 12 estudiantes, 12 viajes, 18 reservaciones y 18 EcoEventos.');
    console.log('Clave de las cuentas DEMO: DemoEco2026');
    console.log('Desactiva ALLOW_DEMO_SEED al terminar.');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { client.release(); }
}
seed().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => pool.end());
