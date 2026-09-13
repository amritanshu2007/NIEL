'use strict';

const weatherMonitor = require('../services/weatherMonitor');
const weatherModel = require('../models/weatherModel');
const wrap = require('../utils/wrap');

// GET /api/weather/status - monitor health, thresholds, budget and the
// latest persisted district observations.
const monitorStatus = wrap(async (req, res) => {
  const observations = await weatherModel.latestObservations();
  res.json({ ...weatherMonitor.getMonitorStatus(), observations });
});

// POST /api/weather/webhook - external ingest path (alternative to the
// background poller). Body: { district, rainfallMmh, forecastMmh?,
//   condition?, source?, observedAt? }
// Runs the identical spatial PostGIS correlation + escalation pipeline.
const ingestWebhook = wrap(async (req, res) => {
  const { district, rainfallMmh, forecastMmh, condition, source, observedAt } = req.body || {};

  if (!district || typeof district !== 'string') {
    return res.status(400).json({ error: 'Missing required field: district' });
  }
  const mmh = Number(rainfallMmh);
  if (!Number.isFinite(mmh) || mmh < 0) {
    return res.status(400).json({ error: 'rainfallMmh must be a non-negative number (mm/h)' });
  }

  const changes = await weatherMonitor.ingestObservation(req.app.get('io'), {
    district,
    mmh,
    forecastMmh,
    condition,
    source,
    observedAt,
  });

  return res.json({
    accepted: true,
    district,
    rainfallMmh: mmh,
    transitions: changes,
    transitionCount: changes.length,
  });
});

module.exports = { monitorStatus, ingestWebhook };