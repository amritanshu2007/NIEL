'use strict';

/**
 * Citizen Crowdsourcing Portal - cross-cutting service.
 *
 *  * Socket.io event broadcasts (additive events, never override existing ones).
 *  * Incident ecosystem integration: when an admin VERIFIES a report it is
 *    promoted into the existing incidents table via the EXISTING
 *    incidentModel - a clean interface, not a rewrite of the incident engine.
 *  * Optional citizen notification through the messaging-gateway feature.
 */

const incidentModel = require('../../../src/models/incidentModel');
const citizenModel = require('./model');

// Citizen incident types -> existing NIEL incident types.
const INCIDENT_TYPE_MAP = {
  Pothole: 'Road_Block',
  Road_Blockage: 'Road_Block',
  Road_Damage: 'Road_Block',
  Fallen_Tree: 'Road_Block',
  Debris: 'Road_Block',
  Waterlogging: 'Flood',
  Landslide: 'Landslide',
  Other: 'Road_Block',
};

// Citizen severity levels -> NIEL incident severity levels.
const SEVERITY_MAP = {
  Critical: 'High',
  High: 'High',
  Medium: 'Medium',
  Low: 'Low',
};

/** Minimal, public, socket-safe summary of a report. */
function toEventSummary(report) {
  return {
    id: report?.id,
    reportId: report?.report_id,
    incidentType: report?.incident_type,
    severity: report?.severity,
    status: report?.status,
    description: report?.description,
    lat: report?.lat,
    lng: report?.lng,
    location: report?.location,
    photoUrl: report?.photo_url,
    createdAt: report?.created_at,
  };
}

/** Emit politely when a report arrives (e.g. alert previews). */
function broadcastNewReport(io, report) {
  try {
    if (io) io.emit('citizen:report:new', toEventSummary(report));
  } catch (e) {
    console.warn('[citizen-crowdsourcing] socket broadcast failed:', e.message);
  }
}

/** Emit when an admin changes a report status. */
function broadcastStatusChange(io, report) {
  try {
    if (io) io.emit('citizen:report:status', toEventSummary(report));
  } catch (e) {
    console.warn('[citizen-crowdsourcing] socket broadcast failed:', e.message);
  }
}

/**
 * Promote a VERIFIED citizen report into the existing incident ecosystem.
 * Reuses incidentModel.createIncident (unchanged) and the same `incident:new`
 * socket event the existing incident controller emits, so the rest of the
 * platform reacts exactly as if the incident had been reported directly.
 *
 * @returns {Promise<object|null>} the created incident row
 */
async function integrateIncident(io, report, reviewerUser) {
  const incidentType = INCIDENT_TYPE_MAP[report.incident_type] || 'Road_Block';
  const severity = SEVERITY_MAP[report.severity] || 'Medium';
  const reviewerId = reviewerUser?.id ?? reviewerUser ?? null;

  if (report.promoted_incident_id) {
    // Already integrated once - never duplicate into the incident system.
    return { alreadyPromoted: true, id: report.promoted_incident_id };
  }

  const incident = await incidentModel.createIncident({
    reportedByUserId: reviewerId,
    lng: report.lng,
    lat: report.lat,
    incidentType,
    photoUrl: report.photo_url || null,
    severity,
  });

  await citizenModel.setPromotedIncidentId(report.id, incident.id);
  try {
    if (io) io.emit('incident:new', incident);
  } catch (e) {
    console.warn('[citizen-crowdsourcing] incident socket emit failed:', e.message);
  }
  return incident;
}

/**
 * Optional citizen notification routed through the messaging-gateway feature.
 * Only fires when that feature is reachable and a phone/email exists; failures
 * are isolated so a blocked messenger never breaks review actions.
 */
async function notifyReporter(report, template, body) {
  try {
    const gateway = require('../../messaging-gateway/services/notificationService');
    const recipient = report.reporter_phone || report.contact_phone || null;
    const channel = report.reporter_phone || report.contact_phone ? 'sms' : null;
    if (channel && recipient) {
      await gateway.sendMessage({
        channel,
        recipient,
        subject: template,
        body: body || template,
        metadata: {
          reference_type: 'citizen-report',
          reference_id: report.report_id || report.id,
        },
      });
    }
  } catch (e) {
    console.warn('[citizen-crowdsourcing] reporter notify skipped:', e.message);
  }
}

module.exports = {
  broadcastNewReport,
  broadcastStatusChange,
  integrateIncident,
  notifyReporter,
  toEventSummary,
  INCIDENT_TYPE_MAP,
  SEVERITY_MAP,
};