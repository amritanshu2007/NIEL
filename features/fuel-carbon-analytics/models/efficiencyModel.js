'use strict';

/**
 * Fuel & Carbon Analytics - data access layer.
 * vehicle_efficiency_profiles / emission_factors / route_efficiency_records.
 */

const pool = require('../../../src/config/db');

// ---------------------------------------------------------- profiles
const PROFILE_COLS = `id, profile_name AS "profileName", vehicle_type AS "vehicleType",
  fuel_type AS "fuelType", efficiency::float8 AS efficiency,
  efficiency_unit AS "efficiencyUnit", fuel_price_per_unit::float8 AS "fuelPricePerUnit",
  payload_factor::float8 AS "payloadFactor", source, active, created_at, updated_at`;

async function listProfiles({ fuelType, vehicleType, active = true } = {}) {
  const params = [];
  const conds = [];
  if (active) conds.push('active = TRUE');
  if (fuelType) {
    params.push(fuelType.toUpperCase());
    conds.push(`fuel_type = $${params.length}`);
  }
  if (vehicleType) {
    params.push(vehicleType);
    conds.push(`vehicle_type = $${params.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT ${PROFILE_COLS} FROM vehicle_efficiency_profiles
      ${where}
     ORDER BY fuel_type, vehicle_type, profile_name`,
    params
  );
  return rows;
}

async function getProfile(id) {
  const { rows } = await pool.query(
    `SELECT ${PROFILE_COLS} FROM vehicle_efficiency_profiles WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function createProfile(values) {
  const { rows } = await pool.query(
    `INSERT INTO vehicle_efficiency_profiles
       (profile_name, vehicle_type, fuel_type, efficiency, efficiency_unit,
        fuel_price_per_unit, payload_factor, source, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${PROFILE_COLS}`,
    [
      values.profileName,
      values.vehicleType,
      values.fuelType,
      values.efficiency,
      values.efficiencyUnit,
      values.fuelPricePerUnit,
      values.payloadFactor === null ? null : values.payloadFactor,
      values.source || null,
      values.active !== false,
    ]
  );
  return rows[0];
}

async function updateProfile(id, patch) {
  const fields = [];
  const params = [id];
  const push = (col, v) => {
    params.push(v);
    fields.push(`${col} = $${params.length}`);
  };
  if (patch.profileName !== undefined) push('profile_name', patch.profileName);
  if (patch.vehicleType !== undefined) push('vehicle_type', patch.vehicleType);
  if (patch.fuelType !== undefined) push('fuel_type', patch.fuelType);
  if (patch.efficiency !== undefined) push('efficiency', patch.efficiency);
  if (patch.efficiencyUnit !== undefined) push('efficiency_unit', patch.efficiencyUnit);
  if (patch.fuelPricePerUnit !== undefined) push('fuel_price_per_unit', patch.fuelPricePerUnit);
  if (patch.payloadFactor !== undefined) push('payload_factor', patch.payloadFactor === null ? null : patch.payloadFactor);
  if (patch.source !== undefined) push('source', patch.source);
  if (patch.active !== undefined) push('active', patch.active !== false);
  if (!fields.length) return getProfile(id);
  const { rows } = await pool.query(
    `UPDATE vehicle_efficiency_profiles SET ${fields.join(', ')} WHERE id = $1 RETURNING ${PROFILE_COLS}`,
    params
  );
  return rows[0] || null;
}

async function deleteProfile(id) {
  const { rows } = await pool.query(
    `DELETE FROM vehicle_efficiency_profiles WHERE id = $1 RETURNING id`,
    [id]
  );
  return rows.length > 0;
}

// ------------------------------------------------------- emission factors
async function listEmissionFactors() {
  const { rows } = await pool.query(
    `SELECT id, fuel_type AS "fuelType", factor_type AS "factorType",
            factor_value::float8 AS "factorValue", source, effective_from AS "effectiveFrom",
            updated_at
       FROM emission_factors
      ORDER BY fuel_type`
  );
  return rows;
}

async function getEmissionFactor(fuelType) {
  const { rows } = await pool.query(
    `SELECT * FROM emission_factors WHERE fuel_type = $1`,
    [fuelType]
  );
  return rows[0] || null;
}

async function upsertEmissionFactor({ fuelType, factorType, factorValue, source }) {
  const { rows } = await pool.query(
    `INSERT INTO emission_factors (fuel_type, factor_type, factor_value, source)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (fuel_type) DO UPDATE SET
       factor_type = EXCLUDED.factor_type,
       factor_value = EXCLUDED.factor_value,
       source = COALESCE(EXCLUDED.source, emission_factors.source)
     RETURNING *`,
    [fuelType, factorType, factorValue, source || null]
  );
  return rows[0];
}

// ---------------------------------------------------------- vehicles
async function listVehicles() {
  const { rows } = await pool.query(
    `SELECT v.id, v.vehicle_number AS "vehicleNumber", v.driver_name AS "driverName",
            v.phone, v.cargo_type AS "cargoType", v.status,
            ST_Y(v.current_location) AS lat, ST_X(v.current_location) AS lng,
            v.destination, p.profile_name AS "profileName", p.fuel_type AS "fuelType",
            p.efficiency, p.efficiency_unit AS "efficiencyUnit",
            p.fuel_price_per_unit AS "fuelPricePerUnit", p.payload_factor AS "payloadFactor"
       FROM vehicles v
       LEFT JOIN vehicle_efficiency_profiles p ON p.active = TRUE
         AND p.vehicle_type = (
            SELECT vehicle_type FROM vehicle_efficiency_profiles
            WHERE vehicle_type = p.vehicle_type
            ORDER BY p.id LIMIT 1)
       ORDER BY v.vehicle_number`,
    []
  );
  return rows.map((r) => ({ ...r, lat: Number(r.lat), lng: Number(r.lng) }));
}

// ---------------------------------------------------- route records
async function createRecord(r) {
  const { rows } = await pool.query(
    `INSERT INTO route_efficiency_records
       (vehicle_id, profile_id, calculated_by,
        origin_name, origin_lat, origin_lng, destination_name, destination_lat, destination_lng,
        baseline_distance_km, baseline_duration_min,
        optimized_distance_km, optimized_duration_min, optimized_source,
        distance_saved_km, time_saved_min, distance_saved_pct, time_saved_pct,
        baseline_fuel_units, optimized_fuel_units, fuel_unit,
        fuel_saved_units, fuel_saved_cost_inr,
        baseline_co2_kg, optimized_co2_kg, co2_saved_kg, co2_saved_pct,
        payload_factor)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
             $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
     RETURNING *`,
    [
      r.vehicleId || null,
      r.profileId || null,
      r.calculatedBy || null,
      r.originName || null,
      r.originLat,
      r.originLng,
      r.destinationName || null,
      r.destinationLat,
      r.destinationLng,
      r.baseline.distanceKm,
      r.baseline.durationMin,
      r.optimized.distanceKm,
      r.optimized.durationMin,
      r.optimized.source,
      r.savings.distanceSavedKm,
      r.savings.timeSavedMin,
      r.savings.distanceSavedPct,
      r.savings.timeSavedPct,
      r.baselineFuelUnits,
      r.optimizedFuelUnits,
      r.fuelUnit,
      r.savings.fuelSavedUnits,
      r.savings.fuelSavedCostInr,
      r.baselineCo2Kg,
      r.optimizedCo2Kg,
      r.savings.co2SavedKg,
      r.savings.co2SavedPct,
      r.payloadFactor === null ? null : r.payloadFactor,
    ]
  );
  return rows[0];
}

async function listRecords({ from, to, vehicleId, vehicleType, fuelType, limit = 500, offset = 0 } = {}) {
  const params = [];
  const conds = [];
  if (from) {
    params.push(from);
    conds.push(`r.calculated_at >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    conds.push(`r.calculated_at < $${params.length} + INTERVAL '1 day'`);
  }
  if (vehicleId) {
    params.push(Number(vehicleId));
    conds.push(`r.vehicle_id = $${params.length}`);
  }
  if (vehicleType) {
    params.push(vehicleType);
    conds.push(`p.vehicle_type = $${params.length}`);
  }
  if (fuelType) {
    params.push(fuelType.toUpperCase());
    conds.push(`p.fuel_type = $${params.length}`);
  }
  params.push(limit, offset);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT r.*, p.profile_name AS "profileName", p.vehicle_type AS "vehicleType",
            p.fuel_type AS "fuelType", p.efficiency, p.efficiency_unit AS "efficiencyUnit",
            v.vehicle_number AS "vehicleNumber"
       FROM route_efficiency_records r
       LEFT JOIN vehicle_efficiency_profiles p ON p.id = r.profile_id
       LEFT JOIN vehicles v ON v.id = r.vehicle_id
      ${where}
      ORDER BY r.calculated_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

/**
 * Totals over a record set (for /summary and the report).
 * @returns {Promise<object>} aggregate totals + per-period and per-dimension series
 */
async function aggregateRecords({ from, to, vehicleId, vehicleType, fuelType } = {}) {
  const params = [];
  const conds = [];
  if (from) {
    params.push(from);
    conds.push(`r.calculated_at >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    conds.push(`r.calculated_at < $${params.length} + INTERVAL '1 day'`);
  }
  if (vehicleId) {
    params.push(Number(vehicleId));
    conds.push(`r.vehicle_id = $${params.length}`);
  }
  if (vehicleType) {
    params.push(vehicleType);
    conds.push(`p.vehicle_type = $${params.length}`);
  }
  if (fuelType) {
    params.push(fuelType.toUpperCase());
    conds.push(`p.fuel_type = $${params.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const totals = await pool.query(
    `SELECT
       COUNT(*) AS routeCount,
       COALESCE(SUM(r.distance_saved_km), 0) AS distanceSavedKm,
       COALESCE(SUM(r.time_saved_min), 0) AS timeSavedMin,
       COALESCE(SUM(r.fuel_saved_units), 0) AS fuelSavedUnits,
       COALESCE(SUM(r.fuel_saved_cost_inr), 0) AS costSavedInr,
       COALESCE(SUM(r.co2_saved_kg), 0) AS co2SavedKg,
       COALESCE(AVG(r.distance_saved_pct), 0) AS avgImprovementPct,
       COALESCE(AVG(r.co2_saved_pct), 0) AS avgCo2SavedPct,
       COALESCE(SUM(r.optimized_distance_km), 0) AS optimizedDistanceKm,
       COALESCE(SUM(r.baseline_distance_km), 0) AS baselineDistanceKm
       FROM route_efficiency_records r
       LEFT JOIN vehicle_efficiency_profiles p ON p.id = r.profile_id
      ${where}`,
    params
  );

  const daily = await pool.query(
    `SELECT to_char(r.calculated_at, 'YYYY-MM-DD') AS period,
       COUNT(*) AS routes,
       COALESCE(SUM(r.distance_saved_km), 0) AS distanceSavedKm,
       COALESCE(SUM(r.fuel_saved_units), 0) AS fuelSavedUnits,
       COALESCE(SUM(r.co2_saved_kg), 0) AS co2SavedKg,
       COALESCE(SUM(r.fuel_saved_cost_inr), 0) AS costSavedInr
       FROM route_efficiency_records r
       LEFT JOIN vehicle_efficiency_profiles p ON p.id = r.profile_id
      ${where}
      GROUP BY 1 ORDER BY 1`,
    params
  );

  const monthly = await pool.query(
    `SELECT to_char(r.calculated_at, 'YYYY-MM') AS period,
       COUNT(*) AS routes,
       COALESCE(SUM(r.distance_saved_km), 0) AS distanceSavedKm,
       COALESCE(SUM(r.fuel_saved_units), 0) AS fuelSavedUnits,
       COALESCE(SUM(r.co2_saved_kg), 0) AS co2SavedKg,
       COALESCE(SUM(r.fuel_saved_cost_inr), 0) AS costSavedInr
       FROM route_efficiency_records r
       LEFT JOIN vehicle_efficiency_profiles p ON p.id = r.profile_id
      ${where}
      GROUP BY 1 ORDER BY 1`,
    params
  );

  const byVehicle = await pool.query(
    `SELECT COALESCE(v.vehicle_number, 'profile:' || p.profile_name) AS vehicle,
       COALESCE(p.vehicle_type, 'n/a') AS "vehicleType",
       COALESCE(p.fuel_type, 'n/a') AS "fuelType",
       COUNT(*) AS routes,
       COALESCE(SUM(r.distance_saved_km), 0) AS distanceSavedKm,
       COALESCE(SUM(r.fuel_saved_units), 0) AS fuelSavedUnits,
       COALESCE(SUM(r.co2_saved_kg), 0) AS co2SavedKg
       FROM route_efficiency_records r
       LEFT JOIN vehicle_efficiency_profiles p ON p.id = r.profile_id
       LEFT JOIN vehicles v ON v.id = r.vehicle_id
      ${where}
      GROUP BY 1, 2, 3 ORDER BY 4 DESC`,
    params
  );

  const byRoute = await pool.query(
    `SELECT COALESCE(r.origin_name, 'origin') || ' -> ' || COALESCE(r.destination_name, 'dest') AS route,
       COUNT(*) AS trips,
       COALESCE(SUM(r.distance_saved_km), 0) AS distanceSavedKm,
       COALESCE(AVG(r.distance_saved_pct), 0) AS avgSavePct,
       COALESCE(SUM(r.co2_saved_kg), 0) AS co2SavedKg
       FROM route_efficiency_records r
      ${where}
      GROUP BY 1 ORDER BY 3 DESC`,
    params
  );

  return {
    totals: totals.rows[0],
    daily: daily.rows,
    monthly: monthly.rows,
    byVehicle: byVehicle.rows,
    byRoute: byRoute.rows,
  };
}

module.exports = {
  listProfiles,
  getProfile,
  createProfile,
  updateProfile,
  deleteProfile,
  listEmissionFactors,
  getEmissionFactor,
  upsertEmissionFactor,
  listVehicles,
  createRecord,
  listRecords,
  aggregateRecords,
};