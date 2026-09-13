'use strict';

const pool = require('../config/db');

const INCIDENT_TYPES = ['Landslide', 'Flood', 'Bridge_Damage', 'Road_Block'];
const SEVERITIES = ['High', 'Medium', 'Low'];

// location is returned as the GeoJSON representation of the
// GEOMETRY(Point, 4326) column.
const INCIDENT_FIELDS = `
  id, reported_by_user_id, incident_type, photo_url, severity,
  ST_AsGeoJSON(location) AS location, created_at`;

const createIncident = async ({
  reportedByUserId,
  lng,
  lat,
  incidentType,
  photoUrl = null,
  severity = 'Medium',
}) => {
  const { rows } = await pool.query(
    `INSERT INTO incidents (reported_by_user_id, location, incident_type, photo_url, severity)
     VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326), $4, $5, $6)
     RETURNING ${INCIDENT_FIELDS}`,
    [reportedByUserId, lng, lat, incidentType, photoUrl, severity]
  );
  return rows[0];
};

const listIncidents = async ({ severity, incidentType } = {}) => {
  const params = [];
  const conditions = [];

  if (severity) {
    params.push(severity);
    conditions.push(`severity = $${params.length}`);
  }
  if (incidentType) {
    params.push(incidentType);
    conditions.push(`incident_type = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT ${INCIDENT_FIELDS}
       FROM incidents
       ${where}
      ORDER BY created_at DESC`,
    params
  );

  return rows;
};

module.exports = { createIncident, listIncidents, INCIDENT_TYPES, SEVERITIES };