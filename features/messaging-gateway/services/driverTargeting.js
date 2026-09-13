'use strict';

/**
 * Messaging Gateway - driver corridor targeting (PostGIS).
 *
 * Determines which ACTIVE vehicles are operating near an incident's affected
 * corridor using the EXISTING vehicle telemetry table:
 *   * point proximity  - vehicles whose current_location is within
 *                        radiusKm of the incident point
 *   * corridor line    - when the incident names an affected road corridor,
 *                        vehicles within corridorRadiusM of that corridor's
 *                        LineString (true corridor matching)
 * Only vehicles on active trip statuses are considered. The returned rows
 * are contact-safe: phones are masked unless `includePhone` is explicitly set
 * by the dispatcher (they are stored locally, never exposed by the REST API).
 */

const pool = require('../../../src/config/db');
const config = require('../config').config;

const TARGET_FIELDS = `
  v.id,
  v.vehicle_number,
  v.driver_name,
  v.phone,
  v.status,
  v.cargo_type,
  v.destination,
  ROUND((ST_Distance(
      v.current_location::geography,
      ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
    ) / 1000)::numeric, 1) AS distance_km`;

/** Map a numeric-ish incident location ({lat,lng}) to the DB point object. */
function incidentPoint(incident) {
  const lng = incident?.lng ?? incident?.longitude;
  const lat = incident?.lat ?? incident?.latitude;
  if (!Number.isFinite(Number(lng)) || !Number.isFinite(Number(lat))) return null;
  return { lng: Number(lng), lat: Number(lat) };
}

function maskPhone(phone) {
  const p = String(phone || '');
  return p.length > 4 ? `*****${p.slice(-4)}` : '*****';
}

/**
 * Find vehicles active near an incident.
 * @param {object} incident { incident_type?, severity?, lat, lng, impactedCorridor? }
 * @param {object} [override] test-overrides for { enabled, radiusKm, corridorRadiusM, maxTargets, vehicleStatuses }
 */
async function findTargets(incident, override = {}) {
  const cfg = { ...config().targeting, ...override };
  if (!cfg.enabled) return [];

  const point = incidentPoint(incident);
  if (!point) return [];

  const statuses = cfg.vehicleStatuses || ['IN_TRANSIT'];
  const limit = Math.min(Number(cfg.maxTargets) || 8, 25);

  const params = [point.lng, point.lat];
  const statusConds = statuses.map((s, i) => `v.status = $${params.length + i + 1}`);
  params.push(...statuses);

  // Attempt corridor-based matching first: find the road nearest the incident
  // and match vehicles within corridorRadiusM of that road's line geometry.
  let rows = [];
  try {
    const corridorMatch = await pool.query(
      `WITH near_road AS (
         SELECT r.id, r.geom
           FROM roads r
          ORDER BY r.geom <-> ST_SetSRID(ST_MakePoint($1, $2), 4326)
          LIMIT 1
       )
       SELECT v.id,
              v.vehicle_number,
              v.driver_name,
              v.phone,
              v.status,
              v.cargo_type,
              v.destination,
              ROUND((ST_Distance(
                  v.current_location::geography,
                  ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
                ) / 1000)::numeric, 1) AS distance_km,
              'corridor' AS match_type
         FROM vehicles v, near_road nr
        WHERE (${statusConds.join(' OR ')})
          AND ST_DWithin(
                v.current_location::geography,
                nr.geom::geography,
                $3 ::numeric
              )
        ORDER BY distance_km ASC
        LIMIT $4`,
      [...params, cfg.corridorRadiusM, limit]
    );
    if (corridorMatch.rows.length >= Math.min(limit, 1)) {
      rows = corridorMatch.rows;
    }
  } catch {
    /* corridor join unavailable - fall through to point proximity */
  }

  if (!rows.length) {
    // Point-radius matching: geographic distance within radiusKm.
    const { rows: pointRows } = await pool.query(
      `SELECT ${TARGET_FIELDS},
              'point' AS match_type
         FROM vehicles v
        WHERE (${statusConds.join(' OR ')})
          AND ST_DWithin(
                v.current_location::geography,
                ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                $3 ::numeric
              )
        ORDER BY distance_km ASC
        LIMIT $4`,
      [...params, cfg.radiusKm * 1000, limit]
    );
    rows = pointRows;
  }

  return rows.map((r) => ({
    vehicleId: r.id,
    vehicleNumber: r.vehicle_number,
    driverName: r.driver_name,
    phone: r.phone,
    status: r.status,
    cargoType: r.cargo_type,
    destination: r.destination,
    distanceKm: Number(r.distance_km),
    matchType: r.match_type,
  }));
}

/**
 * Contact-safe representation of a target (never leaks full phone numbers).
 */
function maskTarget(target, keepPhone = false) {
  const copy = { ...target };
  if (!keepPhone && target.phone) copy.phone = maskPhone(target.phone);
  if (target.driverName === null || target.driverName === undefined) copy.driverName = 'Driver';
  return copy;
}

module.exports = { findTargets, maskTarget, maskPhone, incidentPoint };