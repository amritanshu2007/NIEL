'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const riskEngine = require('../analytics/riskEngine');
const clustering = require('../analytics/clustering');
const heatmapService = require('../services/heatmapService');

test('insufficient data: no fabrication, flagged insufficient, low confidence', () => {
  const r = riskEngine.computeBaselineScore({ incidents: [] });
  assert.equal(r.dataCoverage, 'insufficient');
  assert.equal(r.riskScore, 0);
  assert.equal(r.confidence, 0.1);
  assert.equal(r.level, 'LOW');
  assert.ok(r.factors.some((f) => f.label === 'Insufficient historical observations'));
});

test('single sparse incident still flags insufficient coverage honestly', () => {
  const r = riskEngine.computeBaselineScore({
    incidents: [{ year: 2023, severity: 'High' }],
  });
  assert.equal(r.dataCoverage, 'insufficient');
  assert.equal(r.historicalCount, 1);
  assert.ok(r.riskScore > 0 && r.riskScore < 0.45);
});

test('normal dataset with repeated monsoonal history scores HIGH+', () => {
  const incidents = [];
  for (let y = 2022; y <= 2025; y += 1) {
    incidents.push({ year: y, severity: 'High' }, { year: y, severity: 'Medium' });
  }
  const r = riskEngine.computeBaselineScore({
    incidents,
    envScore: 0.9,
    clusterDensity: 0.8,
    roadStatus: 'RISKY',
    currentYear: 2025,
  });
  assert.equal(r.dataCoverage, 'adequate');
  assert.equal(r.historicalCount, 8);
  assert.equal(r.seasonalRecurrence, 1);
  assert.ok((r.level === 'HIGH' || r.level === 'CRITICAL'), `level=${r.level}`);
  assert.ok(r.confidence >= 0.7);
});

test('plus-everything keeps score <= 1 and levels bounded', () => {
  const incidents = [];
  for (let y = 2020; y <= 2025; y += 1) {
    incidents.push({ year: y, severity: 'High' });
  }
  const r = riskEngine.computeBaselineScore({
    incidents,
    envScore: 1,
    clusterDensity: 1,
    roadStatus: 'BLOCKED',
  });
  assert.ok(r.riskScore <= 1);
  assert.equal(r.level, 'CRITICAL');
});

test('seasonal recurrence: two years events across three-year window', () => {
  const r = riskEngine.computeBaselineScore({
    incidents: [{ year: 2022, severity: 'Medium' }, { year: 2024, severity: 'Medium' }],
    currentYear: 2024,
  });
  assert.ok(Math.abs(r.seasonalRecurrence - 2 / 3) < 1e-3, `seasonal=${r.seasonalRecurrence}`);
});

test('recent incidents inflate frequency via recency weighting', () => {
  const recent = riskEngine.computeBaselineScore({
    incidents: [{ year: 2024, severity: 'Medium' }, { year: 2023, severity: 'Medium' }],
    currentYear: 2024,
  });
  const old = riskEngine.computeBaselineScore({
    incidents: [{ year: 2020, severity: 'Medium' }, { year: 2019, severity: 'Medium' }],
    currentYear: 2024,
  });
  assert.ok(recent.riskScore > old.riskScore, 'recent events score higher than stale ones');
});

test('level boundaries from the documented thresholds', () => {
  assert.equal(riskEngine.levelFromScore(0.05), 'LOW');
  assert.equal(riskEngine.levelFromScore(0.3), 'MEDIUM');
  assert.equal(riskEngine.levelFromScore(0.5), 'HIGH');
  assert.equal(riskEngine.levelFromScore(0.85), 'CRITICAL');
});

// ---------------------------------------------------------------- clustering
test('dbscan clusters two separated groups and marks outliers', () => {
  const points = [
    { lat: 26.1, lng: 91.7 }, { lat: 26.11, lng: 91.71 }, { lat: 26.09, lng: 91.72 },
    { lat: 24.83, lng: 92.79 }, { lat: 24.84, lng: 92.8 }, { lat: 24.82, lng: 92.78 },
    { lat: 27.58, lng: 91.87 }, // isolated
  ];
  const labels = clustering.dbscan(points, 5, 3);
  const counts = clustering.clusterCounts(labels);
  assert.equal(counts.size, 2, 'two real clusters');
  assert.ok(labels[6] === -1, 'isolated point is noise');
});

test('pointToLineKm: point near a polyline measures ~0, far point large', () => {
  const coords = [[91.7, 26.1], [91.9, 26.2]];
  const near = clustering.pointToLineKm({ lat: 26.103, lng: 91.73 }, coords);
  const far = clustering.pointToLineKm({ lat: 27.5, lng: 95.0 }, coords);
  assert.ok(near < 5, `near = ${near}`);
  assert.ok(far > 250, `far = ${far}`);
});

test('clusteringSignal saturates on dense neighborhoods', () => {
  const dense = Array.from({ length: 10 }, (_, i) => ({ lat: 26.1 + i * 0.01, lng: 91.7 }));
  const sparse = [{ lat: 26.1, lng: 91.7 }, { lat: 26.2, lng: 91.8 }];
  assert.equal(clustering.clusteringSignal(dense, 0, 20, 8), 1);
  assert.ok(clustering.clusteringSignal(sparse, 0, 20, 8) < 1);
});

// ---------------------------------------------------------------- heatmap (pure)
const ROADS = [
  {
    id: 1, roadName: 'NH-27 Diliman', district: 'Kamrup', status: 'OPEN',
    coords: [[91.7, 26.1], [91.75, 26.15]],
  },
  {
    id: 2, roadName: 'Mokokchung Rd', district: 'Kohima', status: 'OPEN',
    coords: [[94.1, 25.65], [94.2, 25.7]],
  },
];

function floodIncidents() {
  const list = [];
  for (let y = 2021; y <= 2025; y += 1) {
    for (const offset of [0.01, 0.03, 0.05, 0.07]) {
      list.push({
        year: y, month: 7, incidentType: 'Flood', severity: y >= 2024 ? 'High' : 'Medium',
        lat: 26.12 + offset, lng: 91.72,
      });
    }
  }
  return list;
}

const CLIMATOLOGY = [
  { district: 'Kamrup', month: 7, typicalMmDay: 45, peakIntensityMmh: 60, wetFraction: 0.85 },
  { district: 'Kohima', month: 7, typicalMmDay: 16, peakIntensityMmh: 44, wetFraction: 0.8 },
];

test('computeFeatures: flood-heavy road scores HIGH/CRITICAL, quiet road LOW', () => {
  const { features, summary } = heatmapService.computeFeatures({
    roads: ROADS,
    incidents: floodIncidents(),
    climatology: CLIMATOLOGY,
    month: 7,
    incidentType: 'Flood',
  });
  const nh27 = features.find((f) => f.properties.roadId === 1);
  const mokok = features.find((f) => f.properties.roadId === 2);
  assert.ok(nh27.properties.riskScore > 0.55, `NH-27 score ${nh27.properties.riskScore}`);
  assert.ok(nh27.properties.dataCoverage === 'adequate');
  assert.ok(mokok.properties.riskLevel === 'LOW');
  assert.equal(summary.roadCount, 2);
  assert.equal(summary.incidentsUsed, floodIncidents().length);
});

test('computeFeatures: seasonal filter excludes non-monsoon incidents', () => {
  const incidents = floodIncidents().map((i) => ({ ...i, month: 2 }));
  const { features, summary } = heatmapService.computeFeatures({
    roads: ROADS,
    incidents,
    climatology: CLIMATOLOGY,
    month: 7,
    incidentType: 'Flood',
  });
  assert.equal(summary.incidentsUsed, incidents.length);
  const nh27 = features.find((f) => f.properties.roadId === 1);
  assert.equal(nh27.properties.historicalCount, 0, 'all events in another month');
  assert.equal(nh27.properties.riskLevel, 'LOW');
});

test('computeFeatures: incident type filter keeps only matching events', () => {
  const incidents = floodIncidents().map((i, k) => (k % 3 === 0 ? { ...i, incidentType: 'Landslide' } : i));
  const { features } = heatmapService.computeFeatures({
    roads: ROADS,
    incidents,
    climatology: CLIMATOLOGY,
    month: 7,
    incidentType: 'Landslide',
  });
  const nh27 = features.find((f) => f.properties.roadId === 1);
  assert.ok(nh27.properties.historicalCount > 0);
});

test('computeFeatures: district summary drives prepositioning suggestions', () => {
  const { summary } = heatmapService.computeFeatures({
    roads: ROADS,
    incidents: floodIncidents(),
    climatology: CLIMATOLOGY,
    month: 7,
    incidentType: 'Flood',
    includeDistricts: true,
  });
  assert.ok(summary.districtSummary.length >= 1);
  const kamrup = summary.districtSummary.find((d) => d.name === 'Kamrup');
  assert.ok(kamrup);
  assert.ok(kamrup.prepositioning.prepositionedRouteCount >= 1);
});