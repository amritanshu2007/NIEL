'use strict';

/**
 * Predictive Monsoon - monsoon_runs run ledger (audit + metrics).
 */

const pool = require('../../../src/config/db');

const MODEL_VERSION = 'baseline-v1';
const DEFAULT_HORIZON_DAYS = 30;
const MONSOON_MONTHS = [5, 6, 7, 8, 9];
const INCIDENT_TYPES = ['Flood', 'Landslide', 'Road_Block', 'Bridge_Damage'];
const CACHE_TTL_HOURS = 3;

async function startRun({ objective = 'baseline', districts, months, incidentTypes }) {
  const { rows } = await pool.query(
    `INSERT INTO monsoon_runs
       (model_version, districts_count, horizon_days, objective, source, inputs, status)
     VALUES ($1, $2, $3, $4, 'analytics-baseline', $5, 'running')
     RETURNING id`,
    [
      MODEL_VERSION,
      districts ? districts.length : 0,
      DEFAULT_HORIZON_DAYS,
      objective,
      JSON.stringify({ months, incidentTypes, districts }),
    ]
  );
  return rows[0].id;
}

async function completeRun(runId, summary) {
  await pool.query(
    `UPDATE monsoon_runs
        SET status = 'completed', finished_at = NOW(), inputs = $2
      WHERE id = $1`,
    [runId, JSON.stringify(summary)]
  );
}

async function failRun(runId, error) {
  await pool.query(
    `UPDATE monsoon_runs
        SET status = 'failed', finished_at = NOW(), error = $2
      WHERE id = $1`,
    [runId, String(error).slice(0, 2000)]
  );
}

async function latestRun() {
  const { rows } = await pool.query(
    `SELECT * FROM monsoon_runs ORDER BY started_at DESC LIMIT 1`
  );
  return rows[0] || null;
}

async function runStats() {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'completed') AS completed,
       COUNT(*) FILTER (WHERE status = 'failed') AS failed,
       COUNT(*) FILTER (WHERE status = 'running') AS running,
       COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS last_7d,
       ROUND(AVG(EXTRACT(EPOCH FROM (finished_at - started_at)))::numeric)::int AS avg_duration_s
       FROM monsoon_runs`
  );
  return rows[0];
}

module.exports = {
  MODEL_VERSION,
  DEFAULT_HORIZON_DAYS,
  MONSOON_MONTHS,
  INCIDENT_TYPES,
  CACHE_TTL_HOURS,
  startRun,
  completeRun,
  failRun,
  latestRun,
  runStats,
};