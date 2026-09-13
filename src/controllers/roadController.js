'use strict';

const roadModel = require('../models/roadModel');
const wrap = require('../utils/wrap');

// GET /api/roads - all roads with status and geographic paths.
// Optional query filters: ?district=Kohima  ?status=BLOCKED
const listRoads = wrap(async (req, res) => {
  const { status, district } = req.query;

  if (status && !roadModel.ROAD_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `status must be one of: ${roadModel.ROAD_STATUSES.join(', ')}`,
    });
  }

  const roads = await roadModel.listRoads({ status, district });
  return res.json(roads);
});

// PUT /api/roads/:id/status - update road status, broadcast to district room
const updateRoadStatus = wrap(async (req, res) => {
  const { status } = req.body;

  if (!roadModel.ROAD_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `status must be one of: ${roadModel.ROAD_STATUSES.join(', ')}`,
    });
  }

  const road = await roadModel.updateStatus(req.params.id, status);

  if (!road) {
    return res.status(404).json({ error: 'Road not found' });
  }

  // Real-time status push for clients interested in that district
  req.app.get('io').to(`district:${road.district}`).emit('road:status', road);

  return res.json(road);
});

module.exports = { listRoads, updateRoadStatus };