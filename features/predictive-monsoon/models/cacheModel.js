'use strict';

/**
 * Predictive Monsoon - monsoon_risk_cache persistence.
 */

const pool = require('../../../src/config/db');

async function getFresh(cacheKey) {
  const { rows } = await pool.query(
    `SELECT * FROM monsoon_risk_cache
      WHERE cache_key = $1 AND expires_at > NOW()`,
    [cacheKey]
  );
  return rows[0] || null;
}

/** True when at least one fresh row exists under the given key prefix. */
async function hasFresh(prefix) {
  const { rows } = await pool.query(
    `SELECT 1 FROM monsoon_risk_cache
      WHERE cache_key LIKE $1 AND expires_at > NOW()
      LIMIT 1`,
    [`${prefix}%`]
  );
  return rows.length > 0;
}

/** All non-expired rows under a key prefix, with geometry as GeoJSON. */
async function readByPrefix(prefix) {
  const { rows } = await pool.query(
    `SELECT id, cache_key AS "cacheKey", month, incident_type AS "incidentType",
            district, road_name AS "roadName", road_id AS "roadId",
            method, model_version AS "modelVersion",
            risk_score AS "riskScore", risk_level AS "riskLevel",
            confidence, contribution_score AS "clusterDensity",
            historical_count AS "historicalCount",
            seasonal_recurrence AS "seasonalRecurrence",
            data_coverage AS "dataCoverage", factors,
            ST_AsGeoJSON(geometry) AS geojson
       FROM monsoon_risk_cache
      WHERE cache_key LIKE $1 AND expires_at > NOW()`,
    [`${prefix}%`]
  );
  return rows.map((r) => ({
    ...r,
    factors: r.factors,
    geojson: r.geojson ? JSON.parse(r.geojson) : null,
  }));
}

// Column order for indexed inserts: 1..17 then the geometry (18th).
const COLUMNS = `(cache_key, month, incident_type, district, road_name, road_id,
  method, model_version, risk_score, risk_level, confidence,
  contribution_score, historical_count, cluster_count,
  seasonal_recurrence, data_coverage, factors, geometry)`;

/** Upsert many scored features into the cache (idempotent by cache_key). */
async function upsertMany(rows) {
  if (!rows.length) return 0;
  const params = [];
  const tuples = rows.map((r) => {
    const baseIndex = params.length; // next param starts at baseIndex+1
    params.push(
      r.cacheKey,
      r.month,
      r.incidentType,
      r.district,
      r.roadName,
      r.roadId,
      r.method,
      r.modelVersion,
      r.score,
      r.level,
      r.confidence,
      r.clusterDensity,
      r.historicalCount,
      r.clusterCount || 0,
      r.seasonalRecurrence,
      r.dataCoverage,
      r.factors ? JSON.stringify(r.factors) : null,
    );
    // geometry param (index baseIndex+18), NULL when no geojson
    params.push(r.geojson || null);
    const idx = (k) => `$${baseIndex + k}`;
    const geom = r.geojson
      ? `ST_SetSRID(ST_GeomFromGeoJSON($${baseIndex + 18}), 4326)`
      : 'NULL';
    return `(${idx(1)}, ${idx(2)}, ${idx(3)}, ${idx(4)}, ${idx(5)}, ${idx(6)}, ${idx(7)}, ${idx(8)}, ${idx(9)}, ${idx(10)}, ${idx(11)}, ${idx(12)}, ${idx(13)}, ${idx(14)}, ${idx(15)}, ${idx(16)}, ${idx(17)}, ${geom})`;
  });

  await pool.query(
    `INSERT INTO monsoon_risk_cache ${COLUMNS}
     VALUES ${tuples.join(', ')}
     ON CONFLICT (cache_key) DO UPDATE SET
       month = EXCLUDED.month,
       incident_type = EXCLUDED.incident_type,
       district = EXCLUDED.district,
       road_name = EXCLUDED.road_name,
       road_id = EXCLUDED.road_id,
       method = EXCLUDED.method,
       model_version = EXCLUDED.model_version,
       risk_score = EXCLUDED.risk_score,
       risk_level = EXCLUDED.risk_level,
       confidence = EXCLUDED.confidence,
       contribution_score = EXCLUDED.contribution_score,
       historical_count = EXCLUDED.historical_count,
       cluster_count = EXCLUDED.cluster_count,
       seasonal_recurrence = EXCLUDED.seasonal_recurrence,
       data_coverage = EXCLUDED.data_coverage,
       factors = EXCLUDED.factors,
       geometry = EXCLUDED.geometry,
       expires_at = NOW() + INTERVAL '3 hours'`,
    params
  );
  return rows.length;
}

async function purgeExpired() {
  const { rowCount } = await pool.query(
    'DELETE FROM monsoon_risk_cache WHERE expires_at <= NOW()'
  );
  return rowCount || 0;
}

async function stats() {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE data_coverage = 'adequate') AS adequate,
       COUNT(*) FILTER (WHERE data_coverage = 'insufficient') AS insufficient,
       COUNT(DISTINCT district) AS districts,
       COUNT(DISTINCT month) AS months,
       MAX(created_at) AS last_generated,
       COUNT(*) FILTER (WHERE expires_at <= NOW()) AS expired
       FROM monsoon_risk_cache`
  );
  return rows[0];
}

module.exports = { getFresh, upsertMany, purgeExpired, stats };