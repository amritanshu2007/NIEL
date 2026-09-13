'use strict';

/**
 * Predictive Monsoon - background worker (same setInterval pattern as the
 * existing platform engines). Regenerates baseline heatmaps for the full
 * monsoon window into the risk cache on a schedule. Never touches source
 * incident/road records.
 */

const heatmapService = require('../services/heatmapService');
const cacheModel = require('../models/cacheModel');
const runModel = require('../models/runModel');

const INTERVAL_MS = 10 * 60 * 1000;
const RECENT_MONSOON_MONTHS = [6, 7, 8, 9];

let timer = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  const runId = await runModel.startRun({ objective: 'baseline-worker' });
  const summary = { regenerated: {} };
  try {
    for (const month of RECENT_MONSOON_MONTHS) {
      const res = await heatmapService.buildHeatmap({ month, force: true });
      summary.regenerated[month] = { features: res.features.length, cached: res.cached };
    }
    await cacheModel.purgeExpired();
    await runModel.completeRun(runId, summary);
  } catch (err) {
    await runModel.failRun(runId, err.message);
    console.error('[predictive-monsoon] worker error:', err.message);
  } finally {
    running = false;
  }
}

/** Start the periodic worker (idempotent). */
function startWorker() {
  if (timer) return timer;
  timer = setInterval(tick, INTERVAL_MS);
  tick().catch(() => {});
  return timer;
}

/** Stop the periodic worker. */
function stopWorker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { startWorker, stopWorker, tick, RECENT_MONSOON_MONTHS };