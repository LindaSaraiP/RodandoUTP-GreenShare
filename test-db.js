require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function probarConexion() {
  try {
    const resultado = await pool.query(
      'SELECT current_database(), NOW()'
    );

    console.log('Conexión exitosa con Neon');
    console.log(resultado.rows[0]);
  } catch (error) {
    console.error('Error de conexión:', error.message);
  } finally {
    await pool.end();
  }
}

probarConexion();