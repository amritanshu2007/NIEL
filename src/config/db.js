require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT) || 5432,
  database: process.env.PGDATABASE || 'ner_logistics',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || '',
  max: 20,                                  // max clients in the pool
  idleTimeoutMillis: 30000,                 // client idling past this is released
  connectionTimeoutMillis: 5000,            // fail fast if DB is unreachable
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

module.exports = pool;