'use strict';
const pool = require('../db');
(async () => {
  try {
    const db = await pool.query('SELECT current_database() AS nombre');
    const data = await pool.query(`SELECT
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM rides) AS rides,
      (SELECT COUNT(*) FROM reservations) AS reservations,
      (SELECT COUNT(*) FROM eco_events) AS eco_events`);
    console.log('Conectada a:', db.rows[0].nombre);
    console.table(data.rows);
  } catch (e) {
    console.error('No se pudo consultar Neon:', e.message);
    process.exitCode = 1;
  } finally { await pool.end(); }
})();
