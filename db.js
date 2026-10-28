'use strict';
require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('Falta DATABASE_URL. Configúrala en .env (local) o en Environment de Render.');
}

// Neon incluye sslmode=require en la URL; no desactives la verificación de certificados.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 8,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000
});

pool.on('error', err => console.error('Conexión PostgreSQL inactiva:', err.message));
module.exports = pool;
