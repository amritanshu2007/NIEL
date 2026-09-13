'use strict';

/**
 * Citizen Crowdsourcing Portal - request handlers.
 * Mounted by the aggregator at /api/v1/features/citizen-crowdsourcing
 *
 * Security posture:
 *   * Public submissions are rate-limited per IP; admins/field-staff bypass.
 *   * All payloads are validated server-side; text is sanitized.
 *   * GET /reports/:id only exposes private drafts to the admin, the owner
 *     (matching citizen_identifier supplied via the same session header),
 *     or as a public VERIFIED/RESOLVED report.
 *   * Status changes require admin + a legal lifecycle transition.
 *   * Upload endpoints require a matching citizen session (or admin).
 */

const citizenModel = require('./model');
const citizenService = require('./service');
const {
  INCIDENT_TYPES,
  REPORT_STATUSES,
  SEVERITIES,
  validateCoordinates,
  validateIncidentType,
  validateSeverity,
  validateStatus,
  allowedTransition,
  sanitizeText,
  sanitizeName,
  maskReport,
} = require('./validation');
const { photoUrlFromRequest } = require('./upload');
const wrap = require('../../../src/utils/wrap');

// ---------------------------------------------------------------- rate-limit
// Lightweight in-memory per-IP rate limiting for PUBLIC endpoints only.
const hits = new Map();

function prune(key) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < 60 * 60 * 1000);
  hits.set(key, list);
  return list;
}

function assertWithinLimit(ip, action, maxPerHour) {
  const key = `${ip}:${action}`;
  const list = prune(key);
  if (list.length >= maxPerHour) {
    const err = new Error(`Rate limit exceeded (max ${maxPerHour}/hour)`);
    err.status = 429;
    err.isPublic = true;
    throw err;
  }
  list.push(Date.now());
}

function clientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
    .toString()
    .split(',')[0]
    .trim();
}

function isAdmin(req) {
  return Boolean(req.user && req.user.role === 'admin');
}

// ------------------------------------------------------------- session ids
const IDENTIFIER_RE = /^[A-Za-z0-9_-]{6,128}$/;

function sessionIdentifier(req) {
  const raw = (req.headers['x-citizen-identifier'] || req.body?.citizen_identifier || '').toString().trim();
  return IDENTIFIER_RE.test(raw) ? raw : null;
}

function newSessionIdentifier(req) {
  // Device-key style fallback when a citizen doesn't supply an id.
  const ip = clientIp(req);
  const dev = (req.body?.device_key || '').toString().trim();
  const base = dev || ip.replace(/[^A-Za-z0-9]/g, '').slice(0, 24) || 'anon';
  const candidate = `anon-${base}-${Math.random().toString(36).slice(2, 8)}`;
  return candidate.slice(0, 128);
}

function ownerOf(report, req) {
  const sid = sessionIdentifier(req);
  return Boolean(sid && report.citizen_identifier && sid === report.citizen_identifier);
}

function publicStatuses(report) {
  return ['VERIFIED', 'RESOLVED'].includes(String(report.status).toUpperCase());
}

// ------------------------------------------------------------------ handlers

// POST /reports  (public, rate-limited; admin bypass)
const createReport = wrap(async (req, res) => {
  const admin = isAdmin(req);
  if (!admin) assertWithinLimit(clientIp(req), 'create', 12);

  const { incident_type, severity, description, device_key, lat: rawLat, lng: rawLng } = req.body || {};

  const coords = validateCoordinates(rawLat, rawLng);
  if (!coords) {
    return res.status(400).json({ error: 'lat must be in [-90,90] and lng in [-180,180]' });
  }
  if (!validateIncidentType(incident_type)) {
    return res.status(400).json({ error: `incident_type must be one of: ${INCIDENT_TYPES.join(', ')}` });
  }
  if (!validateSeverity(severity || 'Medium')) {
    return res.status(400).json({ error: `severity must be one of: ${SEVERITIES.join(', ')}` });
  }

  const citizenIdentifier = sessionIdentifier(req) || newSessionIdentifier(req);
  const photoUrl = photoUrlFromRequest(req);

  const report = await citizenModel.createReport({
    lng: coords.lng,
    lat: coords.lat,
    incidentType: incident_type.trim(),
    severity: severity.trim(),
    description: sanitizeText(description),
    citizenIdentifier,
    photoUrl,
    deviceKey: sanitizeName(device_key),
  });

  citizenService.broadcastNewReport(req.app.get('io'), report);
  return res.status(201).json({
    report: maskReport(report, admin),
    reportId: report.report_id,
    submissionId: report.report_id,
    status: report.status,
  });
});

// GET /reports  (public - verified community map)
const listPublic = wrap(async (req, res) => {
  const { incident_type, limit, offset } = req.query;
  if (incident_type && !validateIncidentType(incident_type)) {
    return res.status(400).json({ error: `incident_type must be one of: ${INCIDENT_TYPES.join(', ')}` });
  }
  const reports = await citizenModel.listPublic({
    incidentType: incident_type || null,
    limit,
    offset,
  });
  return res.json(reports.map((r) => maskReport(r, false)));
});

// GET /reports/:id  (public for VERIFIED/RESOLVED; private otherwise)
const getReport = wrap(async (req, res) => {
  const report = await citizenModel.getById(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });

  const admin = isAdmin(req);
  if (!publicStatuses(report) && !admin && !ownerOf(report, req)) {
    return res.status(404).json({ error: 'Report not found' });
  }
  return res.json(maskReport(report, admin));
});

// POST /reports/:id/sync  (offline draft replay; owner- or admin-gated)
const syncReport = wrap(async (req, res) => {
  const admin = isAdmin(req);
  if (!admin) assertWithinLimit(clientIp(req), 'sync', 24);

  const {
    incident_type,
    severity,
    description,
    lat: rawLat,
    lng: rawLng,
    report_id,
    citizen_identifier,
    device_key,
  } = req.body || {};

  const ll = Number(rawLat);
  const rr = Number(rawLng);
  const coords = validateCoordinates(ll, rr);
  if (!coords) {
    return res.status(400).json({ error: 'lat must be in [-90,90] and lng in [-180,180]' });
  }
  if (!validateIncidentType(incident_type)) {
    return res.status(400).json({ error: `incident_type must be one of: ${INCIDENT_TYPES.join(', ')}` });
  }

  const clientReportId = String(report_id || req.params.id).trim();
  if (!clientReportId) {
    return res.status(400).json({ error: 'report_id is required for offline sync' });
  }

  // Owner gate: the client replay must prove ownership of the draft it updates.
  const existing = await citizenModel.getById(clientReportId);
  const ownerClaims = sessionIdentifier(req) ||
    (String(req.body?.citizen_identifier || '').trim());
  if (existing && !admin && !(ownerClaims && existing.citizen_identifier === ownerClaims)) {
    return res.status(404).json({ error: 'Report not found' });
  }

  const photoUrl = photoUrlFromRequest(req);

  const { report, created } = await citizenModel.upsertByReportId({
    reportId: clientReportId,
    incidentType: incident_type.trim(),
    severity: String(severity || 'Medium').trim(),
    description: sanitizeText(description),
    lat: coords.lat,
    lng: coords.lng,
    photoUrl,
    citizenIdentifier: existing
      ? existing.citizen_identifier
      : sessionIdentifier(req) || newSessionIdentifier(req),
    deviceKey: sanitizeName(device_key),
  });

  if (created) citizenService.broadcastNewReport(req.app.get('io'), report);
  return res.json({
    synced: true,
    created,
    clientReportId,
    reportId: report.report_id,
    status: report.status,
    report: maskReport(report, admin),
  });
});

// GET /admin/reports  (admin review queue)
const adminList = wrap(async (req, res) => {
  const { status, incident_type, limit, offset } = req.query;
  if (status && !validateStatus(status)) {
    return res.status(400).json({ error: `status must be one of: ${REPORT_STATUSES.join(', ')}` });
  }
  if (incident_type && !validateIncidentType(incident_type)) {
    return res.status(400).json({ error: `incident_type must be one of: ${INCIDENT_TYPES.join(', ')}` });
  }
  const reports = await citizenModel.adminListReports({
    status: status || null,
    incidentType: incident_type || null,
    limit,
    offset,
  });
  return res.json(reports.map((r) => maskReport(r, true)));
});

// GET /admin/reports/stats  (dashboard counts)
const adminStats = wrap(async (_req, res) => {
  const counts = await citizenModel.getReportCounts();
  return res.json({ ...counts, statuses: REPORT_STATUSES, incidentTypes: INCIDENT_TYPES });
});

// PATCH /admin/reports/:id/status  (admin lifecycle action)
const adminPatchStatus = wrap(async (req, res) => {
  const { status, rejection_reason, review_notes } = req.body || {};

  if (!validateStatus(status)) {
    return res.status(400).json({ error: `status must be one of: ${REPORT_STATUSES.join(', ')}` });
  }

  const report = await citizenModel.getById(req.params.id);
  if (!report) return res.status(404).json({ error: 'Report not found' });

  const target = status.trim().toUpperCase();
  if (!allowedTransition(report.status, target)) {
    return res.status(409).json({
      error: `Illegal transition ${report.status} -> ${target}`,
      currentStatus: report.status,
      allowed: [...REPORT_STATUSES],
    });
  }

  const sanitizedReason =
    target === 'REJECTED' ? sanitizeText(rejection_reason, 500) : null;
  const updated = await citizenModel.updateStatus({
    id: report.id,
    status: target,
    reviewedByUser: req.user,
    rejectionReason: sanitizedReason || null,
    reviewNotes: sanitizeText(review_notes, 1000),
  });

  // VERIFIED integrates the report into the existing incident ecosystem.
  let incident = null;
  if (target === 'VERIFIED') {
    incident = await citizenService.integrateIncident(req.app.get('io'), updated, req.user);
  }

  citizenService.broadcastStatusChange(req.app.get('io'), updated);
  void citizenService.notifyReporter(
    updated,
    `Your citizen report ${updated.report_id} is now ${target}.`,
    target === 'REJECTED' ? `Rejected: ${sanitizedReason || 'not enough evidence'}` : null
  );

  return res.json({
    ...maskReport(updated, true),
    promotedIncident: incident || null,
  });
});

module.exports = {
  createReport,
  listPublic,
  getReport,
  syncReport,
  adminList,
  adminStats,
  adminPatchStatus,
};