'use strict';

const pool = require('../config/db');

const CARGOS = ['Medicine', 'Food', 'Construction', 'Agriculture'];
const VEHICLE_STATUSES = ['IN_TRANSIT', 'DELIVERED', 'DELAYED'];

// current_location is returned as the GeoJSON representation of the
// GEOMETRY(Point, 4326) column.
const VEHICLE_FIELDS = `
  id, vehicle_number, driver_name, phone, cargo_type,
  ST_AsGeoJSON(current_location) AS current_location,
  destination, status, created_at, updated_at`;

const registerVehicle = async ({
  vehicleNumber,
  driverName,
  phone,
  cargoType,
  lng,
  lat,
  destination,
  status = 'IN_TRANSIT',
}) => {
  const { rows } = await pool.query(
    `INSERT INTO vehicles
       (vehicle_number, driver_name, phone, cargo_type, current_location, destination, status)
     VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326), $7, $8)
     RETURNING ${VEHICLE_FIELDS}`,
    [vehicleNumber, driverName, phone, cargoType, lng, lat, destination, status]
  );
  return rows[0];
};

const updateLocation = async ({ vehicleNumber, lng, lat, status }) => {
  // Only touch status when explicitly provided, so a live GPS ping never
  // clobbers a DELIVERED / DELAYED state.
  const hasStatus = status !== undefined;

  const { rows } = await pool.query(
    `UPDATE vehicles
        SET current_location = ST_SetSRID(ST_MakePoint($2, $3), 4326)${hasStatus ? `,
            status = $4` : ''}
      WHERE vehicle_number = $1
      RETURNING ${VEHICLE_FIELDS}`,
    hasStatus
      ? [vehicleNumber, lng, lat, status]
      : [vehicleNumber, lng, lat]
  );

  return rows[0] || null;
};

const listVehicles = async ({ status, cargoType } = {}) => {
  const params = [];
  const conditions = [];

  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (cargoType) {
    params.push(cargoType);
    conditions.push(`cargo_type = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT ${VEHICLE_FIELDS}
       FROM vehicles
       ${where}
      ORDER BY updated_at DESC`,
    params
  );

  return rows;
};

module.exports = { registerVehicle, updateLocation, listVehicles, CARGOS, VEHICLE_STATUSES };