'use strict';

/**
 * Lightweight migration runner.
 * Reads every *.sql file in /migrations in alpha-numeric order and
 * applies each once, tracking completed files in schema_migrations.
 *
 * Run:  node scripts/run-migrations.js
 * Prereq: database + user must already exist (see .env)
 */

const fs = require('fs');
const path = require('path');
const pool = require('../src/config/db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function main() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        file_name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => /.\.sql$/i.test(f))
      .sort();

    for (const file of files) {
      const { rows } = await client.query(
        'SELECT 1 FROM schema_migrations WHERE file_name = $1',
        [file]
      );
      if (rows.length > 0) {
        console.log(`SKIP   ${file} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (file_name) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`APPLIED ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`${file} failed: ${err.message}`);
      }
    }
    console.log('All migrations up to date.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});