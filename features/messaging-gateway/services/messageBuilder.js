'use strict';

/**
 * Messaging Gateway - message content builder.
 *
 * Generates concise emergency notifications containing only:
 *   incident type, severity, affected area/road, recommended action, timestamp.
 * Never includes internal identifiers, coordinates dumps, or sensitive data.
 */

const RECOMMENDED_ACTIONS = {
  Road_Block: 'Avoid the road. Take alternate route where possible. Expect delays.',
  Landslide: 'Do not approach the area. Use barrier-guided alternate routes only.',
  Flood: 'Avoid low-lying flooded corridors. Do not cross running water.',
  Bridge_Damage: 'Do not cross the bridge. Use the designated alternate crossing.',
  default: 'Proceed with caution on alternate routes. Await official instructions.',
};

/** Human-friendly severity label. */
function severityLabel(severity) {
  return String(severity || '').toUpperCase() || 'UNKNOWN';
}

/** Formatting: e.g. 2026-09-14 14:32 vs "14:32 IST, 14 Sep". */
function timeLabel(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return 'just now';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  return `${dd} ${mon} ${hh}:${mm} IST`;
}

/**
 * Build the SMS/WhatsApp text body for an incident alert.
 * @param {object} opts { incidentType, severity, road, locationName, timestamp }
 */
function buildIncidentAlert(opts) {
  const type = opts.incidentType || 'Alert';
  const severity = severityLabel(opts.severity);
  const road = opts.road && opts.road.trim() ? opts.road.trim() : null;
  const area = opts.locationName && opts.locationName.trim() ? opts.locationName.trim() : 'the affected corridor';
  const action = RECOMMENDED_ACTIONS[type] || RECOMMENDED_ACTIONS.default;
  const ts = timeLabel(opts.timestamp);

  const lines = [
    `NIEL ALERT: ${type} (${severity})`,
    `Area: ${road ? `${road} near ${area}` : area}`,
    `Action: ${action}`,
    `Time: ${ts}`,
  ];
  return lines.join(' | ');
}

/**
 * Subject line for email-style messages (kept short, no secrets).
 */
function buildSubject(incidentType, severity) {
  const severityVal = severityLabel(severity);
  return `[NIEL] ${severityVal} ${incidentType} advisory`;
}

module.exports = { buildIncidentAlert, buildSubject, RECOMMENDED_ACTIONS, timeLabel };