'use strict';

/**
 * Citizen Crowdsourcing Portal - validation & sanitization helpers.
 * Pure functions (no I/O) so they can be unit-tested in isolation.
 */

// Incident types citizens can report (matches the PWA picker).
const INCIDENT_TYPES = [
  'Pothole',
  'Road_Blockage',
  'Road_Damage',
  'Fallen_Tree',
  'Debris',
  'Waterlogging',
  'Landslide',
  'Other',
];

// The citizen report lifecycle. Initial status is ALWAYS UNVERIFIED; a report
// is never auto-promoted to verified - that decision belongs to an admin.
const REPORT_STATUSES = [
  'UNVERIFIED',
  'UNDER_REVIEW',
  'VERIFIED',
  'RESOLVED',
  'REJECTED',
];

// Allowed lifecycle transitions:
//   UNVERIFIED -> UNDER_REVIEW | VERIFIED* | REJECTED
//   UNDER_REVIEW -> VERIFIED* | REJECTED
//   VERIFIED -> RESOLVED
//   (*) VERIFIED is the only "approved" state; it happens solely via admin action.
const ALLOWED_TRANSITIONS = {
  UNVERIFIED: ['UNDER_REVIEW', 'VERIFIED', 'REJECTED'],
  UNDER_REVIEW: ['VERIFIED', 'REJECTED'],
  VERIFIED: ['RESOLVED'],
  RESOLVED: [],
  REJECTED: [],
};

const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];

const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_NAME_LENGTH = 120;

/**
 * Validate lat/lng. Returns normalized {lat, lng} or null when out of range,
 * NaN, or non-numeric. Prevents malformed geometry from ever reaching PostGIS.
 */
function validateCoordinates(lat, lng) {
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (Number.isNaN(latNum) || Number.isNaN(lngNum)) return null;
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null;
  if (latNum < -90 || latNum > 90) return null;
  if (lngNum < -180 || lngNum > 180) return null;
  return { lat: latNum, lng: lngNum };
}

function validateIncidentType(type) {
  return typeof type === 'string' && INCIDENT_TYPES.includes(type.trim());
}

function validateSeverity(severity) {
  return typeof severity === 'string' && SEVERITIES.includes(severity);
}

function validateStatus(status) {
  return typeof status === 'string' && REPORT_STATUSES.includes(status.trim().toUpperCase());
}

/** Canonical, always-uppercase status used by the feature. */
function normalizeStatus(status) {
  return String(status || '').trim().toUpperCase();
}

/** Is `to` a legal next status given current status `from`? */
function allowedTransition(from, to) {
  const f = normalizeStatus(from);
  const t = normalizeStatus(to);
  return (ALLOWED_TRANSITIONS[f] || []).includes(t);
}

/**
 * Sanitize free text: strips control characters, trims, caps the length.
 * Never trusts client input verbatim.
 */
function sanitizeText(value, maxLength = MAX_DESCRIPTION_LENGTH) {
  if (value === undefined || value === null) return null;
  const text = String(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.slice(0, maxLength);
}

function sanitizeName(value) {
  return sanitizeText(value, MAX_NAME_LENGTH);
}

/**
 * Build a public (contact-safe) view of a report. Private fields
 * (reporter name/phone, citizen identifier, exact photo access is fine but
 * identifiers are masked) are stripped unless the caller is an admin.
 */
function maskReport(report, canViewContact = false) {
  if (!report) return report;
  const copy = { ...report };
  if (!canViewContact) {
    copy.reporter_name = null;
    copy.reporter_phone = copy.reporter_phone ? maskPhone(copy.reporter_phone) : null;
    copy.citizen_identifier = copy.citizen_identifier ? maskIdentifier(copy.citizen_identifier) : null;
  }
  return copy;
}

/** Last-4 only phone, e.g. '*****6789'. */
function maskPhone(phone) {
  const p = String(phone);
  return p.length > 4 ? `*****${p.slice(-4)}` : '*****';
}

/** e.g. 'u_ab12**…' */
function maskIdentifier(id) {
  const s = String(id);
  if (s.length <= 6) return `${s.slice(0, 2)}***`;
  return `${s.slice(0, 2)}***${s.slice(-2)}`;
}

module.exports = {
  INCIDENT_TYPES,
  REPORT_STATUSES,
  ALLOWED_TRANSITIONS,
  SEVERITIES,
  validateCoordinates,
  validateIncidentType,
  validateSeverity,
  validateStatus,
  normalizeStatus,
  allowedTransition,
  sanitizeText,
  sanitizeName,
  maskReport,
  maskPhone,
  maskIdentifier,
};