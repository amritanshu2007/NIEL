'use strict';

const incidentModel = require('../models/incidentModel');
const wrap = require('../utils/wrap');

// POST /api/incidents - report a new incident from lat/lng coordinates
const createIncident = wrap(async (req, res) => {
  const { location, incident_type, photo_url, severity = 'Medium' } = req.body;
  const { lat, lng } = location || {};

  if (
    lat === undefined || lat === null ||
    lng === undefined || lng === null ||
    !incident_type
  ) {
    return res.status(400).json({
      error: 'location { lat, lng } and incident_type are required',
    });
  }

  const latNum = Number(lat);
  const lngNum = Number(lng);

  if (
    Number.isNaN(latNum) || Number.isNaN(lngNum) ||
    latNum < -90 || latNum > 90 ||
    lngNum < -180 || lngNum > 180
  ) {
    return res.status(400).json({
      error: 'lat must be in [-90, 90] and lng must be in [-180, 180]',
    });
  }

  if (!incidentModel.INCIDENT_TYPES.includes(incident_type)) {
    return res.status(400).json({
      error: `incident_type must be one of: ${incidentModel.INCIDENT_TYPES.join(', ')}`,
    });
  }

  if (!incidentModel.SEVERITIES.includes(severity)) {
    return res.status(400).json({
      error: `severity must be one of: ${incidentModel.SEVERITIES.join(', ')}`,
    });
  }

  const incident = await incidentModel.createIncident({
    reportedByUserId: req.user.id,
    lng: lngNum,
    lat: latNum,
    incidentType: incident_type,
    photoUrl: photo_url || null,
    severity,
  });

  // Real-time alert to all connected clients
  req.app.get('io').emit('incident:new', incident);

  return res.status(201).json(incident);
});

// GET /api/incidents - list incidents (optional ?severity, ?incident_type filters)
const listIncidents = wrap(async (req, res) => {
  const { severity, incident_type } = req.query;

  if (severity && !incidentModel.SEVERITIES.includes(severity)) {
    return res.status(400).json({
      error: `severity must be one of: ${incidentModel.SEVERITIES.join(', ')}`,
    });
  }
  if (incident_type && !incidentModel.INCIDENT_TYPES.includes(incident_type)) {
    return res.status(400).json({
      error: `incident_type must be one of: ${incidentModel.INCIDENT_TYPES.join(', ')}`,
    });
  }

  const incidents = await incidentModel.listIncidents({ severity, incidentType: incident_type });
  return res.json(incidents);
});

module.exports = { createIncident, listIncidents };