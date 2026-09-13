'use strict';

/**
 * Predictive Monsoon - read-only analytics dataset service.
 *
 * This service only ever SELECTs from the existing incidents / roads /
 * monsoon_climatology tables. It NEVER writes to or transforms the source
 * records - predictions and caches live in monsoon_risk_cache /
 * monsoon_runs only.
 */

const pool = require('../../../src/config/db');

async function loadRoads({ district, roadIds, limit = 2000 } = {}) {
  const params = [];
  const conds = [];
  if (district) {
    params.push(district);
    conds.push(`r.district = $${params.length}`);
  }
  if (roadIds && roadIds.length) {
    params.push(roadIds);
    conds.push(`r.id = ANY($${params.length})`);
  }
  params.push(limit);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT r.id, r.road_name AS "roadName", r.district, r.status,
            ST_AsGeoJSON(r.geom) AS geojson,
            ROUND(ST_Length(r.geom::geography)::numeric)::float8 AS "lengthM"
       FROM roads r
      ${where}
      ORDER BY r.district, r.road_name
      LIMIT $${params.length}`,
    params
  );
  return rows.map((r) => ({
    ...r,
    coords: r.geojson ? JSON.parse(r.geojson).coordinates : [],
  }));
}

/**
 * Load incidents with monthly window + optional type/district filters.
 * District is derived via the nearest road (PostGIS <->), so incident
 * rows can be attributed to roads for segmentation.
 */
async function loadIncidents({ month, incidentType, district } = {}) {
  const params = [];
  const conds = [];
  if (month !== undefined && month !== null) {
    params.push(Number(month));
    conds.push(`EXTRACT(MONTH FROM i.created_at) = $${params.length}`);
  }
  if (incidentType) {
    params.push(incidentType);
    conds.push(`i.incident_type = $${params.length}`);
  }
  if (district) {
    params.push(district);
    conds.push(`rd.district = $${params.length}`);
  }
  const where = conds.length ? `AND ${conds.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT i.id,
            i.incident_type AS "incidentType",
            i.severity,
            i.created_at,
            ST_Y(i.location) AS lat,
            ST_X(i.location) AS lng,
            EXTRACT(YEAR FROM i.created_at)::int AS year,
            EXTRACT(MONTH FROM i.created_at)::int AS month,
            rd.district AS district,
            rd.id AS "nearestRoadId"
       FROM incidents i
       LEFT JOIN LATERAL (
         SELECT r.id, r.district FROM roads r
         ORDER BY i.location <-> r.geom
         LIMIT 1
       ) rd ON true
      WHERE true
      ${where}
      ORDER BY i.created_at DESC
      LIMIT 20000`,
    params
  );
  return rows;
}

/** Monthly climatology rows for a month (or the full table). */
async function loadClimatology({ month, districts } = {}) {
  const params = [];
  const conds = [];
  if (month !== undefined && month !== null) {
    params.push(Number(month));
    conds.push(`month = $${params.length}`);
  }
  if (districts && districts.length) {
    params.push(districts);
    conds.push(`district = ANY($${params.length})`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT district, month,
            typical_mm_day::float8 AS "typicalMmDay",
            peak_intensity_mmh::float8 AS "peakIntensityMmh",
            wet_fraction::float8 AS "wetFraction"
       FROM monsoon_climatology
      ${where}`,
    params
  );
  return rows;
}

/** Global counts feeding the metrics endpoint. */
async function loadAnalyticsCounts() {
  const { rows } = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM incidents) AS incidents,
       (SELECT COUNT(*) FROM roads) AS roads,
       (SELECT COUNT(DISTINCT incident_type) FROM incidents) AS incident_types,
       (SELECT COUNT(DISTINCT district) FROM roads) AS districts,
       (SELECT MIN(created_at) FROM incidents) AS first_incident,
       (SELECT MAX(created_at) FROM incidents) AS last_incident,
       (SELECT COUNT(*) FROM incidents
         WHERE incident_type = 'Flood' OR incident_type = 'Landslide') AS monsoon_type_incidents`
  );
  return rows[0];
}

module.exports = {
  loadRoads,
  loadIncidents,
  loadClimatology,
  loadAnalyticsCounts,
};