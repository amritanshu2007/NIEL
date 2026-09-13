'use strict';

/**
 * Weather <-> road network correlation model.
 *
 * All heavy lifting happens in PostGIS so the monitor never loads the
 * full shapefile into Node memory:
 *   - district_monitoring holds a centroid (Point) + bounding box
 *     (Polygon) per district, both SRID 4326.
 *   - ST_DWithin correlates a rainfall observation at the district
 *     centroid with the roads physically close to it, returning their
 *     current status so the monitor can evaluate the escalation matrix.
 *   - applyWeatherStatusChange() atomically writes the new status AND
 *     the immutable audit row inside one transaction.
 */

const pool = require('../config/db');

const ROAD_ROW = `
  id, road_name, district, status, updated_at,
  ST_AsGeoJSON(geom) AS path`;

/**
 * Ensure a district_monitoring row exists for every district that has
 * roads. Idempotent (ON CONFLICT DO NOTHING); creates centroid + bbox
 * straight from the road network so a newly added district is pickable
 * on the next polling cycle.
 */
const ensureMonitoringDistricts = async () => {
  const { rows } = await pool.query(`
    INSERT INTO district_monitoring (district, centroid, bounding_box, active)
    SELECT r.district,
           ST_SetSRID(ST_Centroid(ST_Collect(r.geom)), 4326),
           CASE
             WHEN GeometryType(ST_Envelope(ST_Collect(r.geom))) = 'POLYGON'
             THEN ST_Envelope(ST_Collect(r.geom))
             ELSE NULL
           END,
           TRUE
      FROM roads r
     GROUP BY r.district
    ON CONFLICT (district) DO NOTHING
    RETURNING district`);
  return rows;
};

/**
 * Active monitoring districts with their sampling centroid coordinates.
 * @returns {Promise<Array<{district: string, lon: number, lat: number}>>}
 */
const listMonitoringDistricts = async () => {
  const { rows } = await pool.query(`
    SELECT district,
           ST_X(centroid) AS lon,
           ST_Y(centroid) AS lat
      FROM district_monitoring
     WHERE active = TRUE
     ORDER BY district`);
  return rows.map((r) => ({
    district: r.district,
    lon: Number(r.lon),
    lat: Number(r.lat),
  }));
};

/**
 * Persist the latest observation for a district centroid.
 */
const recordObservation = async (district, obs) => {
  await pool.query(
    `UPDATE district_monitoring
        SET last_observed_at  = NOW(),
            last_rainfall_mmh = $2,
            last_forecast_mmh = $3,
            last_source       = $4
      WHERE district = $1`,
    [district, obs.mmh, obs.forecastMmh, obs.source]
  );
};

/**
 * Spatial correlation: roads inside `radiusKm` of the district centroid.
 * Uses ST_DWithin (ellipsoid-aware via /111.32 degree-per-km conversion)
 * over the GIST index on roads.geom. Also returns distance from centroid.
 *
 * @param {string} district
 * @param {number} radiusKm
 * @returns {Promise<Array>} road rows with current status
 */
const findCorrelatedRoads = async (district, radiusKm) => {
  const { rows } = await pool.query(
    `SELECT r.id, r.road_name, r.district,
            r.status AS current_status,
            ST_AsGeoJSON(r.geom) AS path,
            round((ST_Distance(r.geom, dm.centroid) / 1000)::numeric, 1) AS dist_km
       FROM roads r
       JOIN district_monitoring dm ON dm.district = r.district
      WHERE dm.district = $1
        AND ST_DWithin(r.geom, dm.centroid, $2::float / 111.32)
      ORDER BY ST_Distance(r.geom, dm.centroid)`,
    [district, radiusKm]
  );
  return rows;
};

/**
 * Atomic status change + audit insert.
 *
 * @param {string|number} roadId
 * @param {'OPEN'|'RISKY'|'BLOCKED'} newStatus
 * @param {object} opts { previousStatus, reason, source, rainfallMmh, observedAt }
 * @returns updated road row (same shape as /api/roads), or null if row vanished
 */
const applyWeatherStatusChange = async (roadId, newStatus, opts = {}) => {
  const {
    previousStatus,
    reason = `Automated weather correlation (${opts.rainfallMmh ?? 'n/a'} mm/h)`,
    source = 'weather',
    rainfallMmh = null,
    observedAt = new Date().toISOString(),
  } = opts;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE roads
          SET status = $2, updated_at = NOW()
        WHERE id = $1
          AND status IS DISTINCT FROM $2
        RETURNING ${ROAD_ROW}`,
      [roadId, newStatus]
    );

    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return null; // already in the requested state
    }

    await client.query(
      `INSERT INTO road_status_history
         (road_id, previous_status, new_status, change_reason, source, rainfall_mmh, changed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        roadId,
        previousStatus,
        newStatus,
        reason,
        source,
        rainfallMmh,
        new Date(observedAt).toISOString(),
      ]
    );

    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Latest persisted observation for a district (used by status endpoint).
 */
const latestObservations = async () => {
  const { rows } = await pool.query(`
    SELECT district, last_rainfall_mmh AS rainfall_mmh,
           last_forecast_mmh AS forecast_mmh, last_source AS source,
           last_observed_at AS observed_at
      FROM district_monitoring
     WHERE active = TRUE AND last_observed_at IS NOT NULL
     ORDER BY district`);
  return rows;
};

module.exports = {
  ensureMonitoringDistricts,
  listMonitoringDistricts,
  recordObservation,
  findCorrelatedRoads,
  applyWeatherStatusChange,
  latestObservations,
};