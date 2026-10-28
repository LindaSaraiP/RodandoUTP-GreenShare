'use strict';
// Importación opcional de datos existentes de SQLite a PostgreSQL.
// Nunca se importan sesiones; cada usuario debe volver a iniciar sesión.
// Por seguridad, solo se ejecuta cuando la base Neon no contiene usuarios regulares ni viajes.
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const pool = require('../db');

const source = path.resolve(process.argv[2] || path.join(__dirname, '..', 'data', 'rodando-utp.db'));
const allowed = process.env.ALLOW_SQLITE_IMPORT === 'true';
async function main() {
  if (!allowed) throw new Error('Importación bloqueada. Configura ALLOW_SQLITE_IMPORT=true en .env solamente durante la importación.');
  if (!fs.existsSync(source)) throw new Error(`No existe el SQLite original: ${source}`);
  const sqlite = new DatabaseSync(source, { readOnly: true });
  const client = await pool.connect();
  try {
    const users = sqlite.prepare('SELECT * FROM users ORDER BY id').all();
    const rides = sqlite.prepare('SELECT * FROM rides ORDER BY id').all();
    const bookings = sqlite.prepare('SELECT * FROM reservations ORDER BY id').all();
    const eco = sqlite.prepare('SELECT * FROM eco_events ORDER BY id').all();
    await client.query('BEGIN');
    const counts = (await client.query(`SELECT
      (SELECT COUNT(*) FROM users WHERE role='user') AS u,
      (SELECT COUNT(*) FROM rides) AS r,
      (SELECT COUNT(*) FROM eco_events) AS e`)).rows[0];
    if (Number(counts.u) || Number(counts.r) || Number(counts.e)) {
      throw new Error('Neon ya contiene usuarios/viajes/EcoPuntos. La importación se canceló para proteger los datos existentes.');
    }
    const mapUser = new Map(), mapRide = new Map();
    let numUsers = 0;
    for (const user of users) {
      if (user.role === 'admin') continue; // Administrador nuevo se crea desde ADMIN_PASSWORD.
      const r = await client.query(`INSERT INTO users (name,student_id,email,career,password_hash,verified,role,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,'user',$7) RETURNING id`,
        [user.name, user.student_id, user.email, user.career, user.password_hash, !!user.verified, user.created_at]);
      mapUser.set(Number(user.id), r.rows[0].id); numUsers++;
    }
    let numRides = 0;
    for (const ride of rides) {
      const driver = mapUser.get(Number(ride.driver_id));
      if (!driver) continue;
      const r = await client.query(`INSERT INTO rides (driver_id,origin,pickup_point,destination,departure_at,seats_total,
        contribution_cents,vehicle,color,plate_last4,notes,route_type,connection_hub,parking_eligible,
        parking_code,parking_generated_at,status,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
        [driver, ride.origin, ride.pickup_point, ride.destination, ride.departure_at, Number(ride.seats_total),
          Number(ride.contribution_cents), ride.vehicle, ride.color, ride.plate_last4, ride.notes,
          ride.route_type, ride.connection_hub, !!ride.parking_eligible, ride.parking_code || '',
          ride.parking_generated_at || null, ride.status, ride.created_at]);
      mapRide.set(Number(ride.id), r.rows[0].id); numRides++;
    }
    let numBookings = 0;
    for (const booking of bookings) {
      const ride = mapRide.get(Number(booking.ride_id)), passenger = mapUser.get(Number(booking.passenger_id));
      if (!ride || !passenger) continue;
      await client.query(`INSERT INTO reservations (ride_id,passenger_id,seats,status,created_at) VALUES ($1,$2,$3,$4,$5)`,
        [ride, passenger, Number(booking.seats), booking.status, booking.created_at]);
      numBookings++;
    }
    let numEco = 0;
    for (const event of eco) {
      const userId = mapUser.get(Number(event.user_id));
      if (!userId) continue;
      await client.query('INSERT INTO eco_events (user_id,points,reason,created_at) VALUES ($1,$2,$3,$4)',
        [userId, Number(event.points), event.reason, event.created_at]);
      numEco++;
    }
    await client.query('COMMIT');
    console.log(`Importación completada. Usuarios: ${numUsers}; viajes: ${numRides}; reservaciones: ${numBookings}; EcoEventos: ${numEco}`);
    console.log('Sesiones NO importadas: inicia sesión otra vez.');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release(); sqlite.close();
  }
}
main().catch(e => { console.error('No se importaron datos:', e.message); process.exitCode = 1; }).finally(() => pool.end());
