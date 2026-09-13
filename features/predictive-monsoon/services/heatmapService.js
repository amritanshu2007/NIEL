'use strict';

/**
 * Predictive Monsoon - heatmap / risk aggregation service.
 *
 * `computeFeatures` is a pure function (roads + incidents + climatology in,
 * scored GeoJSON features out) so the statistical pipeline is unit-testable
 * without a database. `buildHeatmap` wires it to the read-only dataset
 * service and the monsoon_risk_cache.
 */

const { computeBaselineScore, envScoreFromRainfall, clamp01 } = require('../analytics/riskEngine');
const { pointToLineKm, dbscan, clusterCounts } = require('../analytics/clustering');
const dataService = require('./dataService');
const cacheModel = require('../models/cacheModel');
const runModel = require('../models/runModel');

const MAX_ATTACH_KM = 3; // incidents within 3 km of a road attach to it

/**
 * Score every road from nearby incidents (pure).
 * @returns {{features:Array, summary:object, districtSummary:object}}
 */
function computeFeatures({ roads, incidents, climatology, month, incidentType, includeDistricts = false }) {
  const climateByDistrict = new Map();
  for (const c of climatology || []) {
    if (!c.month || month === undefined || c.month === month) {
      climateByDistrict.set(c.district, c);
    }
  }

  const features = [];
  const byDistrict = new Map();
  const summary = {
    roadCount: roads.length,
    incidentsUsed: incidents.length,
    levelCounts: { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 },
    adequateCount: 0,
    insufficientCount: 0,
    districts: new Set(),
    month,
    incidentType: incidentType || null,
  };

  for (const road of roads) {
    const near = [];
    for (const inc of incidents) {
      if (incidentType && inc.incidentType !== incidentType) continue;
      if (month !== undefined && inc.month !== month) continue;
      if (pointToLineKm({ lat: inc.lat, lng: inc.lng }, road.coords) <= MAX_ATTACH_KM) {
        near.push(inc);
      }
    }

    const climate = climateByDistrict.get(road.district);
    const envScore = envScoreFromRainfall(climate ? climate.typicalMmDay : 0);

    let clusterDensity = 0;
    let clusterCount = 0;
    if (near.length >= 3) {
      const labels = dbscan(
        near.map((p) => ({ lat: p.lat, lng: p.lng })),
        25,
        3
      );
      const counts = clusterCounts(labels);
      clusterCount = counts.size;
      const maxSize = Math.max(0, ...counts.values());
      clusterDensity = clamp01(maxSize / 8);
    }

    const scored = computeBaselineScore({
      incidents: near,
      roadStatus: road.status,
      envScore,
      clusterDensity,
    });

    const feature = {
      type: 'Feature',
      properties: {
        roadId: road.id,
        roadName: road.roadName,
        district: road.district,
        roadStatus: road.status,
        riskScore: scored.riskScore,
        riskLevel: scored.level,
        confidence: scored.confidence,
        historicalCount: scored.historicalCount,
        seasonalRecurrence: scored.seasonalRecurrence,
        clusterDensity: scored.clusterDensity,
        dataCoverage: scored.dataCoverage,
        contributingFactors: scored.factors,
        month,
        incidentType: incidentType || null,
      },
      geometry: road.geojson ? JSON.parse(road.geojson) : road.coords && { type: 'LineString', coordinates: road.coords },
    };
    features.push(feature);

    summary.levelCounts[scored.level] += 1;
    if (scored.dataCoverage === 'adequate') summary.adequateCount += 1;
    else summary.insufficientCount += 1;
    summary.districts.add(road.district);

    if (includeDistricts) {
      if (!byDistrict.has(road.district)) {
        byDistrict.set(road.district, { name: road.district, roads: [] });
      }
      byDistrict.get(road.district).roads.push({ ...feature.properties });
    }
  }

  summary.districtCount = summary.districts.size;

  let districtSummary = null;
  if (includeDistricts) {
    districtSummary = [
      ...byDistrict.values(),
    ].map((d) => {
      const roadsSorted = [...d.roads].sort((a, b) => b.riskScore - a.riskScore);
      const avg = d.roads.reduce((s, r) => s + r.riskScore, 0) / (d.roads.length || 1);
      const levelList = d.roads.map((r) => r.riskLevel);
      const critical = levelList.filter((l) => l === 'CRITICAL').length;
      const high = levelList.filter((l) => l === 'HIGH').length;
      return {
        name: d.name,
        roadCount: d.roads.length,
        avgScore: Math.round(avg * 10000) / 10000,
        maxLevel: levelList.some((l) => l === 'CRITICAL')
          ? 'CRITICAL'
          : levelList.some((l) => l === 'HIGH')
            ? 'HIGH'
            : levelList.some((l) => l === 'MEDIUM')
              ? 'MEDIUM'
              : 'LOW',
        criticalSegments: critical,
        highSegments: high,
        topRoads: roadsSorted.slice(0, 5),
        prepositioning: {
          // Decision-support only: how many segments warrant pre-staged relief.
          prepositionedRouteCount: critical + high,
          note: `${critical} critical + ${high} high-risk segments; pre-stage relief nodes and reroute drone/river/helicopter capacity here.`,
        },
      };
    }).sort((a, b) => b.avgScore - a.avgScore);
    summary.districtSummary = districtSummary;
  }

  return { features, summary };
}

function cacheKeyPrefix({ month, incidentType, district }) {
  return `${month}|${incidentType || '*'}${district ? `|${district}` : '|*'}|`;
}

/**
 * DB-backed build: check cache, else compute + cache.
 */
async function buildHeatmap({ month, incidentType, district, force = false, includeDistricts = false } = {}) {
  const m = month === undefined || month === null ? new Date().getMonth() + 1 : Number(month);
  const prefix = cacheKeyPrefix({ month: m, incidentType, district });

  if (!force && (await cacheModel.hasFresh(prefix))) {
    const cached = await cacheModel.readByPrefix(prefix);
    const summary = {
      roadCount: cached.length,
      incidentsUsed: null,
      levelCounts: cached.reduce(
        (acc, r) => {
          acc[r.riskLevel] = (acc[r.riskLevel] || 0) + 1;
          return acc;
        },
        { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 }
      ),
      adequateCount: cached.filter((r) => r.dataCoverage === 'adequate').length,
      insufficientCount: cached.filter((r) => r.dataCoverage === 'insufficient').length,
      districts: new Set(cached.map((r) => r.district)),
      districtCount: new Set(cached.map((r) => r.district)).size,
      month: m,
      incidentType: incidentType || null,
    };
    const features = cached.map((r) => ({
      type: 'Feature',
      properties: {
        roadId: r.roadId,
        roadName: r.roadName,
        district: r.district,
        roadStatus: r.roadStatus || null,
        riskScore: r.riskScore,
        riskLevel: r.riskLevel,
        confidence: r.confidence,
        historicalCount: r.historicalCount,
        seasonalRecurrence: r.seasonalRecurrence,
        clusterDensity: r.contributionScore,
        dataCoverage: r.dataCoverage,
        contributingFactors: r.factors,
        month: m,
        incidentType: incidentType || null,
      },
      geometry: r.geojson,
    }));
    return { features, summary, cached: true, modelVersion: runModel.MODEL_VERSION, month: m };
  }

  const roads = await dataService.loadRoads({ district });
  const incidents = await dataService.loadIncidents({ month: m, incidentType, district });
  const climatology = await dataService.loadClimatology({ month: m });

  const { features, summary } = computeFeatures({
    roads,
    incidents,
    climatology,
    month: m,
    incidentType,
    includeDistricts,
  });

  if (features.length) {
    await cacheModel.upsertMany(
      features.map((f) => ({
        cacheKey: cacheKeyPrefix({ month: m, incidentType, district }) + f.properties.roadId,
        month: m,
        incidentType: f.properties.incidentType || 'ANY',
        district: f.properties.district,
        roadName: f.properties.roadName,
        roadId: f.properties.roadId,
        method: 'baseline',
        modelVersion: runModel.MODEL_VERSION,
        score: f.properties.riskScore,
        level: f.properties.riskLevel,
        confidence: f.properties.confidence,
        clusterDensity: f.properties.clusterDensity,
        historicalCount: f.properties.historicalCount,
        clusterCount: f.properties.clusterDensity > 0 ? Math.ceil(f.properties.clusterDensity * 8) : 0,
        seasonalRecurrence: f.properties.seasonalRecurrence,
        dataCoverage: f.properties.dataCoverage,
        factors: f.properties.contributingFactors,
        geojson: f.geometry ? JSON.stringify(f.geometry) : null,
      }))
    );
  }

  return { features, summary, cached: false, modelVersion: runModel.MODEL_VERSION, month: m };
}

async function buildRiskSummary({ month, incidentType, district } = {}) {
  const m = month === undefined || month === null ? new Date().getMonth() + 1 : Number(month);
  const res = await buildHeatmap({ month: m, incidentType, district, force: false, includeDistricts: true });
  return {
    month: m,
    incidentType: incidentType || null,
    modelVersion: res.modelVersion,
    cached: res.cached,
    districts: res.summary.districtSummary || [],
  };
}

module.exports = {
  MAX_ATTACH_KM,
  computeFeatures,
  cacheKeyPrefix,
  buildHeatmap,
  buildRiskSummary,
};