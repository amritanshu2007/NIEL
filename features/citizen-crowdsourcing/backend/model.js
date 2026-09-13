'use strict';

/**
 * Citizen Crowdsourcing Portal - data access layer.
 *
 * The requested citizen_reports schema (report_id, citizen_identifier,
 * incident_type, description, severity, latitude/longitude/geom, photo_url,
 * status, reviewed_by, reviewed_at, rejection_reason) matches the layout the
 * NIEL database has always used for crowdsourcing. This model reads/writes
 * exactly that layout, co-locating the same incident with a PostGIS
 * geometry(Point, 4326) plus spatial index.
 *
 * A canonical fallback (fresh-install, `category`/`location` columns) is
 * supported so this module never breaks a brand-new database.
 */

const pool = require('../../../src/config/db');
const {
  INCIDENT_TYPES,
  SEVERITIES,
  normalizeStatus,
} = require('./validation');

let schemaCache = null;

/** Probe which citizen_reports layout this database actually has. */
async function detectLegacySchema() {
  if (schemaCache !== null) return schemaCache;
  const { rows } = await pool.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_name = 'citizen_reports'`
  );
  const cols = new Set(rows.map((r) => r.column_name));
  schemaCache = cols.has('latitude') && cols.has('longitude');
  return schemaCache;
}

/** Reset cached schema detection (used by tests / after DDL). */
function resetSchemaCache() {
  schemaCache = null;
}

/** Human-friendly sequential report id: CR-YYYYMMDD-XXXXXX */
function reportId() {
  const d = new Date();
  const ymd = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('');
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `CR-${ymd}-${rand}`;
}

function statusValue(status) {
  return normalizeStatus(status);
}

const LEGACY_FIELDS = `
  id, report_id, citizen_identifier, incident_type, description, severity,
  latitude, longitude, photo_url, status, reviewed_by, reviewed_at,
  rejection_reason, verification_notes, confidence_score,
  upvotes_count, downvotes_count, promoted_incident_id,
  reporter_name, reporter_phone, district, nearest_landmark,
  created_at, updated_at`;

const CANONICAL_FIELDS = `
  id, report_id, citizen_identifier, category AS incident_type, description, severity,
  ST_X(location) AS longitude, ST_Y(location) AS latitude,
  image_url AS photo_url, status, reviewed_by_user_id AS reviewed_by, reviewed_at,
  rejection_reason, review_notes AS verification_notes, created_at, updated_at`;

/**
 * Maps a legacy/canonical DB row to the API contract:
 * always exposes `lat`, `lng` and a `location` GeoJSON string for the map.
 */
function normalizeRow(r) {
  if (!r) return null;
  const lat = r.latitude != null ? Number(r.latitude) : null;
  const lng = r.longitude != null ? Number(r.longitude) : null;
  return {
    ...r,
    lat,
    lng,
    location:
      lat != null && lng != null
        ? { type: 'Point', coordinates: [lng, lat] }
        : null,
  };
}

/**
 * Create a citizen report. Initial status is ALWAYS UNVERIFIED.
 */
const createReport = async ({
  lng,
  lat,
  incidentType,
  severity = 'Medium',
  description = null,
  citizenIdentifier = null,
  photoUrl = null,
  deviceKey = null,
}) => {
  const legacy = await detectLegacySchema();
  const rid = reportId();

  let sql;
  let params;
  if (legacy) {
    sql = `
      INSERT INTO citizen_reports
        (report_id, citizen_identifier, incident_type, description, severity,
         latitude, longitude, geom, photo_url, status, device_key)
      VALUES
        ($1, $2, $3, $4, $5,
         $6, $7, ST_SetSRID(ST_MakePoint($7, $6), 4326), $8, 'UNVERIFIED', $9)
      RETURNING ${LEGACY_FIELDS}`;
    params = [rid, citizenIdentifier, incidentType, description, severity, lat, lng, photoUrl, deviceKey];
  } else {
    sql = `
      INSERT INTO citizen_reports
        (report_id, citizen_identifier, category, description, severity,
         location, image_url, status)
      VALUES
        ($1, $2, $3, $4, $5,
         ST_SetSRID(ST_MakePoint($6, $7), 4326), $8, 'unverified')
      RETURNING ${CANONICAL_FIELDS}`;
    params = [rid, citizenIdentifier, incidentType, description, severity, lng, lat, photoUrl];
  }

  const { rows } = await pool.query(sql, params);
  return normalizeRow(rows[0] || null);
};

/**
 * Fetch a report by numeric id OR human-friendly report_id.
 */
const getById = async (idOrReportId) => {
  const legacy = await detectLegacySchema();
  const fields = legacy ? LEGACY_FIELDS : CANONICAL_FIELDS;
  const { rows } = await pool.query(
    `SELECT ${fields}
       FROM citizen_reports
      WHERE id = $1 OR report_id = $1
      LIMIT 1`,
    [String(idOrReportId)]
  );
  return normalizeRow(rows[0] || null);
};

/** A citizen's own reports, matching their session identifier. */
const findByCitizenIdentifier = async (identifier, limit = 50) => {
  const legacy = await detectLegacySchema();
  const fields = legacy ? LEGACY_FIELDS : CANONICAL_FIELDS;
  const { rows } = await pool.query(
    `SELECT ${fields}
       FROM citizen_reports
      WHERE citizen_identifier = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [identifier, Math.min(Number(limit) || 50, 200)]
  );
  return rows.map(normalizeRow);
};

/**
 * Offline-sync upsert (POST /reports/:id/sync).
 *
 * Replays a locally drafted report idempotently, keyed by the client-supplied
 * `report_id`. Creating a brand-new draft does NOT disturb the UNVERIFIED
 * initial status; replaying an existing draft refreshes only its content
 * (never its status / review outcome).
 */
const upsertByReportId = async ({
  reportId: rid,
  incidentType,
  severity = 'Medium',
  description = null,
  lat,
  lng,
  photoUrl = null,
  citizenIdentifier = null,
  deviceKey = null,
}) => {
  const legacy = await detectLegacySchema();
  const existing = await getById(rid);

  if (existing) {
    let sql;
    let params;
    if (legacy) {
      sql = `
        UPDATE citizen_reports SET
          incident_type  = COALESCE($2, incident_type),
          description    = COALESCE($3, description),
          severity       = COALESCE($4, severity),
          latitude       = $5,
          longitude      = $6,
          geom           = ST_SetSRID(ST_MakePoint($6, $5), 4326),
          photo_url      = COALESCE($7, photo_url),
          updated_at     = NOW()
        WHERE report_id = $1 OR id = $1
        RETURNING ${LEGACY_FIELDS}`;
      params = [rid, incidentType, description, severity, lat, lng, photoUrl];
    } else {
      sql = `
        UPDATE citizen_reports SET
          category    = COALESCE($2, category),
          description = COALESCE($3, description),
          severity    = COALESCE($4, severity),
          location    = ST_SetSRID(ST_MakePoint($6, $5), 4326),
          image_url   = COALESCE($7, image_url),
          updated_at  = NOW()
        WHERE report_id = $1 OR id = $1
        RETURNING ${CANONICAL_FIELDS}`;
      params = [rid, incidentType, description, severity, lat, lng, photoUrl];
    }
    const { rows } = await pool.query(sql, params);
    return { report: normalizeRow(rows[0] || null), created: false };
  }

  const report = await createReport({
    lng,
    lat,
    incidentType,
    severity,
    description,
    citizenIdentifier,
    photoUrl,
    deviceKey,
  });
  const updated = report ? await getById(report.id) : null;
  return { report: updated, created: true };
};

/**
 * Public community listing - VERIFIED / RESOLVED reports only.
 */
const listPublic = async ({ incidentType = null, limit = 50, offset = 0 } = {}) => {
  const legacy = await detectLegacySchema();
  const fields = legacy ? LEGACY_FIELDS : CANONICAL_FIELDS;
  const params = [];
  const conds = [];
  if (legacy) {
    params.push('VERIFIED', 'RESOLVED');
    conds.push(`status IN ($1, $2)`);
  } else {
    params.push('verified', 'resolved');
    conds.push(`status IN ($1, $2)`);
  }
  if (incidentType) {
    params.push(incidentType);
    conds.push(`(LOWER(incident_type) = $${params.length} OR LOWER(COALESCE(category,'')) = $${params.length})`);
  }
  params.push(Math.min(Number(limit) || 50, 200), Number(offset) || 0);
  const { rows } = await pool.query(
    `SELECT ${fields}
       FROM citizen_reports
      WHERE ${conds.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows.map(normalizeRow);
};

/**
 * Admin review queue - any status with optional filters.
 */
const adminListReports = async ({ status = null, incidentType = null, limit = 50, offset = 0 } = {}) => {
  const legacy = await detectLegacySchema();
  const fields = legacy ? LEGACY_FIELDS : CANONICAL_FIELDS;
  const params = [];
  const conds = [];

  if (status) {
    params.push(statusValue(status));
    conds.push(`LOWER(status) = $${params.length}`);
  }
  if (incidentType) {
    params.push(String(incidentType).trim());
    conds.push(`LOWER(incident_type) = $${params.length}`);
  }
  params.push(Math.min(Number(limit) || 50, 200), Number(offset) || 0);
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT ${fields}
       FROM citizen_reports
       ${where}
      ORDER BY
        CASE status WHEN 'UNVERIFIED' THEN 0 WHEN 'UNDER_REVIEW' THEN 1 ELSE 2 END,
        created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows.map(normalizeRow);
};

/**
 * Admin status transition. The controller enforces the allowed lifecycle;
 * this layer just persists the outcome + review trail.
 */
const updateStatus = async ({
  id,
  status,
  reviewedByUser,
  rejectionReason = null,
  reviewNotes = null,
}) => {
  const legacy = await detectLegacySchema();
  const statusVal = statusValue(status);
  const reviewerId = reviewedByUser?.id ?? reviewedByUser ?? null;
  const reviewerName = reviewedByUser && reviewedByUser.name ? reviewedByUser.name : reviewerId;

  let sql;
  let params;
  if (legacy) {
    sql = `
      UPDATE citizen_reports SET
        status            = $2,
        reviewed_by       = $3,
        reviewed_at       = NOW(),
        rejection_reason  = CASE WHEN $2 = 'REJECTED' THEN $4 ELSE NULL END,
        verification_notes = CASE WHEN $2 IN ('VERIFIED','RESOLVED') THEN COALESCE($5, 'Approved by NIEL') ELSE NULL END,
        updated_at        = NOW()
      WHERE id = $1 OR report_id = $1
      RETURNING ${LEGACY_FIELDS}`;
    params = [String(id), statusVal, reviewerName, rejectionReason, reviewNotes];
  } else {
    sql = `
      UPDATE citizen_reports SET
        status                = $2,
        reviewed_by_user_id   = $3,
        reviewed_at           = NOW(),
        rejection_reason      = CASE WHEN $2 = 'rejected' THEN $4 ELSE NULL END,
        review_notes          = CASE WHEN $2 IN ('verified','resolved') THEN COALESCE($5, 'Approved by NIEL') ELSE NULL END,
        updated_at            = NOW()
      WHERE id = $1 OR report_id = $1
      RETURNING ${CANONICAL_FIELDS}`;
    params = [String(id), statusVal.toLowerCase(), reviewerId, rejectionReason, reviewNotes];
  }

  const { rows } = await pool.query(sql, params);
  return normalizeRow(rows[0] || null);
};

/** Record which incident a verified report was promoted into. */
const setPromotedIncidentId = async (id, incidentId) => {
  await pool.query(
    `UPDATE citizen_reports SET promoted_incident_id = $2, updated_at = NOW()
      WHERE id = $1`,
    [id, incidentId]
  );
};

/** Per-status counts (uppercase keys) for the review dashboard. */
const getReportCounts = async () => {
  const legacy = await detectLegacySchema();
  const key = legacy ? 'status' : 'LOWER(status)::text';
  const { rows } = await pool.query(
    `SELECT ${key} AS status, COUNT(*)::int AS count
       FROM citizen_reports
      GROUP BY ${key}`
  );
  const out = {
    UNVERIFIED: 0,
    UNDER_REVIEW: 0,
    VERIFIED: 0,
    RESOLVED: 0,
    REJECTED: 0,
  };
  for (const r of rows) {
    const s = String(r.status).toUpperCase();
    if (Object.prototype.hasOwnProperty.call(out, s)) {
      out[s] = r.count;
    }
  }
  return out;
};

module.exports = {
  createReport,
  getById,
  findByCitizenIdentifier,
  upsertByReportId,
  listPublic,
  adminListReports,
  updateStatus,
  setPromotedIncidentId,
  getReportCounts,
  reportId,
  resetSchemaCache,
  INCIDENT_TYPES,
  SEVERITIES,
};