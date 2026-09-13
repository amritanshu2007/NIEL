'use strict';

/**
 * Predictive Monsoon - HTTP controllers.
 *   GET  /heatmap   scored GeoJSON heatmap (road-level risk)
 *   GET  /risk      district-level risk summary + prepositioning hints
 *   POST /run       admin-triggered regeneration across months/types
 *   GET  /metrics   pipeline + data coverage + run statistics
 */

const heatmapService = require('../services/heatmapService');
const dataService = require('../services/dataService');
const cacheModel = require('../models/cacheModel');
const runModel = require('../models/runModel');
const { levelFromScore } = require('../analytics/riskEngine');

const INCIDENT_TYPES = runModel.INCIDENT_TYPES;
const MONSOON_MONTHS = runModel.MONSOON_MONTHS;

function bad(res, message) {
  return res.status(400).json({ error: message });
}

function parseMonth(value) {
  if (value === undefined || value === null || value === '') return new Date().getMonth() + 1;
  const m = Number(value);
  return Number.isInteger(m) && m >= 1 && m <= 12 ? m : null;
}

async function heatmap(req, res) {
  const month = parseMonth(req.query.month);
  if (month === null) return bad(res, 'month must be 1-12');
  const { incidentType, district, risk } = req.query;

  const result = await heatmapService.buildHeatmap({
    month,
    incidentType: incidentType || undefined,
    district: district || undefined,
    force: req.query.refresh === '1',
  });

  let features = result.features;
  if (risk) {
    const levels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const wanted = String(risk).split(',');
    const valid = wanted.filter((w) => levels.includes(w));
    if (valid.length) features = features.filter((f) => valid.includes(f.properties.riskLevel));
  }

  res.json({
    type: 'FeatureCollection',
    features,
    summary: {
      ...result.summary,
      districts: [...result.summary.districts],
    },
    cached: result.cached,
    modelVersion: result.modelVersion,
    month,
    filters: { incidentType: incidentType || null, district: district || null, risk: risk || null },
    methodology: {
      model: 'explainable baseline',
      score: 'weighted historical frequency + seasonal recurrence + spatial clustering + severity + current road status + climatology exposure',
      levels: 'LOW <0.25 | MEDIUM <0.45 | HIGH <0.7 | CRITICAL >=0.7',
      sourceData: 'historical incidents + road status + monthly climatology (read-only)',
      fabrication: 'never; dataCoverage=insufficient flags under-observed segments',
    },
  });
}

async function risk(req, res) {
  const month = parseMonth(req.query.month);
  if (month === null) return bad(res, 'month must be 1-12');
  const summary = await heatmapService.buildRiskSummary({
    month,
    incidentType: req.query.incidentType || undefined,
    district: req.query.district || undefined,
  });
  res.json(summary);
}

async function run(req, res) {
  const months = Array.isArray(req.body.months)
    ? req.body.months.filter((m) => Number.isInteger(Number(m)) && Number(m) >= 1 && Number(m) <= 12).map(Number)
    : MONSOON_MONTHS;
  const incidentTypes = Array.isArray(req.body.incidentTypes)
    ? req.body.incidentTypes.filter((t) => INCIDENT_TYPES.includes(t))
    : INCIDENT_TYPES;
  const districts = Array.isArray(req.body.districts) ? req.body.districts : null;
  const force = req.body.force !== false;

  const runId = await runModel.startRun({
    objective: 'admin-regeneration',
    districts,
    months,
    incidentTypes,
  });
  const summary = { months: {}, totalFeatures: 0 };

  try {
    for (const month of months) {
      summary.months[month] = {};
      for (const type of incidentTypes) {
        const resData = await heatmapService.buildHeatmap({
          month,
          incidentType: type,
          force,
          includeDistricts: false,
        });
        summary.months[month][type] = resData.features.length;
        summary.totalFeatures += resData.features.length;
      }
    }
    await cacheModel.purgeExpired();
    await runModel.completeRun(runId, summary);
    res.json({ runId, status: 'completed', summary, modelVersion: runModel.MODEL_VERSION });
  } catch (err) {
    await runModel.failRun(runId, err.message);
    res.status(500).json({ error: err.message, runId });
  }
}

async function metrics(req, res) {
  const [cacheStats, runStats, counts, latestRun] = await Promise.all([
    cacheModel.stats(),
    runModel.runStats(),
    dataService.loadAnalyticsCounts(),
    runModel.latestRun(),
  ]);
  res.json({
    modelVersion: runModel.MODEL_VERSION,
    cache: cacheStats,
    runs: runStats,
    latestRun,
    inputs: counts,
    levelMap: { LOW: 0.25, MEDIUM: 0.45, HIGH: 0.7, CRITICAL: 1 },
  });
}

module.exports = {
  INCIDENT_TYPES,
  MONSOON_MONTHS,
  levelFromScore,
  heatmap,
  risk,
  run,
  metrics,
};