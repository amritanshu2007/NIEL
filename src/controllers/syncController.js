'use strict';

const syncService = require('../services/syncService');
const wrap = require('../utils/wrap');

const MAX_BATCH = 500;

// POST /api/sync/batch - one-shot sync of queued offline mutations
const syncBatch = wrap(async (req, res) => {
  const { device_id, items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items must be a non-empty array' });
  }
  if (items.length > MAX_BATCH) {
    return res.status(400).json({ error: `batch too large (max ${MAX_BATCH} items)` });
  }

  const result = await syncService.processBatch({
    user: req.user,
    deviceId: device_id,
    items,
  });

  return res.json({
    device_id: device_id || null,
    summary: result.summary,
    synced: result.summary.ok || 0,
    duplicates: result.summary.duplicate || 0,
    conflicts: result.summary.conflict || 0,
    failed: result.summary.error || 0,
    results: result.results,
  });
});

module.exports = { syncBatch };