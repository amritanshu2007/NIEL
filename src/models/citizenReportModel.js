'use strict';

const pool = require('../config/db');

const REPORT_CATEGORIES = [
  'Road_Damage',
  'Landslide',
  'Flood',
  'Bridge_Issue',
  'Traffic_Hazard',
  'Infrastructure_Damage',
  'Other'
];

const REPORT_STATUSES = ['unverified', 'verified', 'rejected'];

const REPORT_FIELDS = `
  id,
  ST_AsGeoJSON(location) AS location,
  category,
  description,
  image_url,
  image_filename,
  image_mime_type,
  status,
  reviewed_by_user_id,
  reviewed_at,
  review_notes,
  contact_email,
  contact_phone,
  created_at,
  updated_at
`;

/**
 * Create a new citizen report with geolocation and optional image
 */
const createReport = async ({
  lng,
  lat,
  category,
  description = null,
  imageUrl = null,
  imageFilename = null,
  imageMimeType = null,
  contactEmail = null,
  contactPhone = null,
}) => {
  const { rows } = await pool.query(
    `INSERT INTO citizen_reports (
       location, category, description, image_url, image_filename,
       image_mime_type, contact_email, contact_phone
     )
     VALUES (
       ST_SetSRID(ST_MakePoint($1, $2), 4326), $3, $4, $5, $6, $7, $8, $9
     )
     RETURNING ${REPORT_FIELDS}`,
    [lng, lat, category, description, imageUrl, imageFilename, imageMimeType, contactEmail, contactPhone]
  );
  return rows[0];
};

/**
 * List citizen reports with optional filters
 */
const listReports = async ({ status, category, limit = 50, offset = 0 } = {}) => {
  const params = [];
  const conditions = [];

  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (category) {
    params.push(category);
    conditions.push(`category = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(limit, offset);
  const limitParam = params.length - 1;
  const offsetParam = params.length;

  const { rows } = await pool.query(
    `SELECT ${REPORT_FIELDS}
       FROM citizen_reports
       ${where}
       ORDER BY created_at DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
    params
  );

  return rows;
};

/**
 * Get a single report by ID
 */
const getReportById = async (id) => {
  const { rows } = await pool.query(
    `SELECT ${REPORT_FIELDS} FROM citizen_reports WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
};

/**
 * Update report status (admin review)
 */
const updateReportStatus = async ({
  id,
  status,
  reviewedByUserId,
  reviewNotes = null,
}) => {
  const { rows } = await pool.query(
    `UPDATE citizen_reports
       SET status = $2,
           reviewed_by_user_id = $3,
           reviewed_at = NOW(),
           review_notes = $4,
           updated_at = NOW()
     WHERE id = $1
     RETURNING ${REPORT_FIELDS}`,
    [id, status, reviewedByUserId, reviewNotes]
  );
  return rows[0] || null;
};

/**
 * Get count of reports by status (for admin dashboard)
 */
const getReportCounts = async () => {
  const { rows } = await pool.query(`
    SELECT status, COUNT(*) as count
    FROM citizen_reports
    GROUP BY status
  `);
  return rows.reduce((acc, row) => {
    acc[row.status] = parseInt(row.count, 10);
    return acc;
  }, {});
};

module.exports = {
  createReport,
  listReports,
  getReportById,
  updateReportStatus,
  getReportCounts,
  REPORT_CATEGORIES,
  REPORT_STATUSES,
};