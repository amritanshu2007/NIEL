'use strict';

/**
 * Messaging Gateway - incident trigger service.
 *
 * Listens to the EXISTING Socket.io 'incident:new' broadcasts (the exact
 * event the existing incident controller already emits) and decides, from
 * configuration, whether to raise external SMS/WhatsApp notifications.
 *
 * No part of the existing alert engine is modified: the feature connects its
 * own socket.io-client to the running server and observes events exactly like
 * any external integration would. It never emits incident events itself, so
 * notification loops are impossible by construction.
 *
 * Trigger conditions (configurable, config/):
 *   severity HIGH/CRITICAL (MESSAGING_TRIGGER_SEVERITIES)
 *   and/or structural blockage = true (Road_Block / Bridge_Damage types,
 *   MESSAGING_TRIGGER_STRUCTURAL_BLOCKAGE / _STRUCTURE_OR_SEVERITY).
 */

const { io: socketIoClient } = require('socket.io-client');
const targetingService = require('./driverTargeting');
const notificationService = require('./notificationService');
const messageBuilder = require('./messageBuilder');
const cfg = require('../config').config;

const STRUCTURAL_TYPES = new Set(['Road_Block', 'Bridge_Damage']);

// In-memory per-incident guard (DB dedupe keys remain the real guarantee).
const seenIncidents = new Set();

/** Structural blockage test for an incident payload. */
function isStructural(incident) {
  if (STRUCTURAL_TYPES.has(incident?.incident_type)) return true;
  return Boolean(incident?.structural_blockage === true);
}

/**
 * Pure trigger evaluation - returns { ok, reasons }.
 * @param {object} incident { incident_type, severity, structural_blockage }
 * @param {object} [triggerCfg] override (tests inject here)
 */
function evaluateTrigger(incident, triggerCfg) {
  const t = triggerCfg || cfg().trigger;
  const severity = String(incident?.severity || '').toUpperCase();

  const severityHit = Boolean(incident?.severity) && t.severities.includes(severity);
  const structuralHit =
    t.structuralBlockage && isStructural(incident) && t.structuralOnlyTriggers;

  const ok = severityHit || structuralHit;
  const reasons = [];
  if (severityHit) reasons.push(`severity ${severity} in ${t.severities.join('/')}`);
  if (structuralHit) reasons.push('structural blockage');

  return { ok, reasons };
}

/**
 * Handle an incident event end-to-end:
 *   evaluate -> resolve driver targets -> enqueue notifications (deduped).
 * Never throws into the socket loop (catches internally).
 */
async function handleIncident(event) {
  const incident = event && event.incident ? event.incident : event;
  if (!incident || !incident.id) return { triggered: false, reason: 'no incident payload' };
  if (incident.source === 'messaging-gateway') return { triggered: false, reason: 'self-loop guard' };
  if (!Number.isFinite(incident.lat ?? incident.latitude) && !(incident.lng ?? incident.longitude)) {
    // Incident rows carry GeoJSON location; resolve it when present.
    const loc = incident.location;
    if (loc && loc.type === 'Point' && Array.isArray(loc.coordinates)) {
      incident.lng = loc.coordinates[0];
      incident.lat = loc.coordinates[1];
    }
    if (!Number.isFinite(incident.lat) || !Number.isFinite(incident.lng)) {
      return { triggered: false, reason: 'incident has no usable coordinates' };
    }
  }

  const verdict = evaluateTrigger(incident);
  if (!verdict.ok) return { triggered: false, reason: 'no matching trigger condition' };

  const incidentKey = String(incident.id);
  if (seenIncidents.has(incidentKey)) {
    return { triggered: true, reason: 'already handled this incident in-process', duplicate: true };
  }
  seenIncidents.add(incidentKey);

  const targets = await targetingService.findTargets(incident);
  const deliverable = targets.filter((t) => t.phone);
  const enqueued = await notificationService.enqueueIncidentNotifications({
    incident,
    targets: deliverable,
    channels: null, // defaults from config
    providerName: null,
  });

  const created = enqueued.filter((r) => r.row);
  const duplicates = enqueued.filter((r) => r.duplicate).length;

  console.log(
    `[messaging-gateway] incident ${incident.id} triggered: ` +
      `${created.length} notification(s) queued (${deliverable.length} drivers, ` +
      `${duplicates} duplicates skipped, ${targets.length - deliverable.length} without phone).`
  );

  return {
    triggered: true,
    reasons: verdict.reasons,
    incident: { id: incident.id, incident_type: incident.incident_type, severity: incident.severity },
    targetsTargeted: deliverable.map((t) => targetingService.maskTarget(t, true)),
    notificationsQueued: created.length,
    duplicatesSkipped: duplicates,
    sampleMessage: created.length
      ? messageBuilder.buildIncidentAlert({
          incidentType: incident.incident_type,
          severity: incident.severity,
          road: incident.road,
          locationName: incident.location_name,
          timestamp: incident.created_at,
        })
      : null,
  };
}

/**
 * Subscribe to the EXISTING incident event feed using its own socket.io
 * channel. Call startListener() after the server is listening.
 */
function startListener() {
  const cfgValue = cfg();
  const url = `http://${cfgValue.listener.host}:${cfgValue.listener.port}`;
  const client = socketIoClient(url, {
    path: cfgValue.listener.path,
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 0,
  });

  client.on('connect', () => {
    console.log(`[messaging-gateway] listening to incident feed at ${url}`);
  });
  client.on('incident:new', (incident) => {
    void handleIncident(incident).catch((err) =>
      console.warn('[messaging-gateway] incident handling failed:', err.message)
    );
  });
  client.on('connect_error', (err) => {
    console.warn(`[messaging-gateway] incident feed connect error: ${err.message}`);
  });
  return client;
}

/** Used by tests to reset the per-incident dedupe set. */
function resetSeen() {
  seenIncidents.clear();
}

module.exports = {
  evaluateTrigger,
  handleIncident,
  isStructural,
  startListener,
  resetSeen,
  STRUCTURAL_TYPES,
};