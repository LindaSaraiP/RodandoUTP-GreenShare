'use strict';
const fs = require('node:fs');
const path = require('node:path');
const pool = require('../db');
(async () => {
  try {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'docs', 'schema-postgres.sql'), 'utf8');
    await pool.query(sql);
    const { rows } = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
    console.log('Tablas en Neon:', rows.map(r => r.table_name).join(', '));
  } catch (error) {
    console.error('No se pudo crear el esquema:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
