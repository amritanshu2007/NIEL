'use strict';

const pool = require('../config/db');

const ROAD_STATUSES = ['OPEN', 'RISKY', 'BLOCKED'];

// Roads are stored as GEOMETRY(LineString, 4326); path is the GeoJSON
// representation of the full geographic line.
const ROAD_FIELDS = `
  id, road_name, district, status, updated_at,
  ST_AsGeoJSON(geom) AS path`;

const listRoads = async ({ status, district } = {}) => {
  const params = [];
  const conditions = [];

  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (district) {
    params.push(district);
    conditions.push(`district = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT ${ROAD_FIELDS}
       FROM roads
       ${where}
      ORDER BY district, road_name`,
    params
  );

  return rows;
};

const findById = async (id) => {
  const { rows } = await pool.query(
    `SELECT ${ROAD_FIELDS}
       FROM roads
      WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
};

const updateStatus = async (id, status) => {
  const { rows } = await pool.query(
    `UPDATE roads
        SET status = $2
      WHERE id = $1
      RETURNING ${ROAD_FIELDS}`,
    [id, status]
  );
  return rows[0] || null;
};

module.exports = { listRoads, findById, updateStatus, ROAD_STATUSES };