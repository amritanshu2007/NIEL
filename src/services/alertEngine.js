'use strict';

const pool = require('../config/db');

const DEFAULT_INTERVAL_MS = 30000;

// Alerts fire once per state transition: a road is re-alerted only when it
// *becomes* BLOCKED again; each high-severity incident is alerted once.
const roadStates = new Map();     // roadId -> last seen status
const alertedIncidents = new Set();

let timer = null;

async function checkForAlerts(io) {
  const [roads, incidents] = await Promise.all([
    pool.query(
      `SELECT id, road_name, district, status, updated_at
         FROM roads
        WHERE status = 'BLOCKED'`
    ),
    pool.query(
      `SELECT id, incident_type, severity,
              ST_AsGeoJSON(location) AS location, created_at
         FROM incidents
        WHERE severity = 'High'`
    ),
  ]);

  for (const road of roads.rows) {
    const prev = roadStates.get(road.id);
    roadStates.set(road.id, road.status);
    if (prev === 'BLOCKED') continue;
    io.emit('alert:blocked', road);
    io.emit('alert', { type: 'blocked', road });
  }

  for (const incident of incidents.rows) {
    if (alertedIncidents.has(incident.id)) continue;
    alertedIncidents.add(incident.id);
    io.emit('alert:incident', incident);
    io.emit('alert', { type: 'incident', incident });
  }
}

function startAlertEngine(io, intervalMs = Number(process.env.ALERT_CHECK_MS) || DEFAULT_INTERVAL_MS) {
  if (timer) return;
  timer = setInterval(() => {
    checkForAlerts(io).catch((err) => console.error('Alert engine error:', err.message));
  }, intervalMs);
  console.log(`Alert engine started (every ${intervalMs}ms)`);
}

function stopAlertEngine() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
  console.log('Alert engine stopped');
}

module.exports = { startAlertEngine, stopAlertEngine, checkForAlerts };