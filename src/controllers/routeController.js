'use strict';

const routingService = require('../services/routingService');
const wrap = require('../utils/wrap');

// POST /api/route/optimize - safest route between two coordinates
const optimize = wrap(async (req, res) => {
  const { start, end } = req.body;

  if (!start || !end) {
    return res.status(400).json({ error: 'start and end objects are required' });
  }

  const sLat = Number(start.lat);
  const sLng = Number(start.lng);
  const eLat = Number(end.lat);
  const eLng = Number(end.lng);

  if ([sLat, sLng, eLat, eLng].some(Number.isNaN)) {
    return res.status(400).json({ error: 'start and end must include numeric lat and lng' });
  }

  if (
    sLat < -90 || sLat > 90 || sLng < -180 || sLng > 180 ||
    eLat < -90 || eLat > 90 || eLng < -180 || eLng > 180
  ) {
    return res.status(400).json({
      error: 'coordinates out of range (lat [-90, 90], lng [-180, 180])',
    });
  }

  const result = await routingService.optimizeRoute({
    start: { lat: sLat, lng: sLng },
    end: { lat: eLat, lng: eLng },
  });

  return res.json({
    route: {
      geometry: result.geometry,
      distanceKm: result.distanceKm,
      durationMin: result.durationMin,
    },
    routingEngine: result.source,
    alerts: result.alerts,
    obstacles: result.obstacles,
  });
});

module.exports = { optimize };