'use strict';

/**
 * Predictive Monsoon - explainable baseline risk engine (pure / DB-free).
 *
 * Every score is a transparent weighted combination of observed signals:
 *   historical frequency (recency-weighted),
 *   seasonal recurrence (fraction of observed years with events),
 *   spatial clustering,
 *   severity profile,
 *   current road status,
 *   monsoon climatology exposure.
 *
 * The pipeline NEVER fabricates predictions: when historical observations
 * are too sparse the result is flagged dataCoverage='insufficient' and the
 * explanation lists it before any number is shown.
 */

const SEVERITY_WEIGHT = { High: 1.0, Medium: 0.66, Low: 0.4 };
const ROAD_STATUS_BOOST = { OPEN: 0, RISKY: 0.45, BLOCKED: 0.8 };
const CLIMATOLOGY_PEAK_MM = 70; // normalisation ceiling for mm/day exposure

const WEIGHTS = {
  frequency: 0.32,
  seasonality: 0.22,
  clustering: 0.18,
  severity: 0.12,
  status: 0.08,
  climatology: 0.08,
};

const LEVELS = [
  { level: 'CRITICAL', min: 0.7 },
  { level: 'HIGH', min: 0.45 },
  { level: 'MEDIUM', min: 0.25 },
  { level: 'LOW', min: 0 },
];

const clamp01 = (v) => (v <= 0 ? 0 : v >= 1 ? 1 : v);

function levelFromScore(score) {
  for (const { level, min } of LEVELS) {
    if (score >= min) return level;
  }
  return 'LOW';
}

function envScoreFromRainfall(mmDay) {
  const mm = Number(mmDay);
  if (Number.isNaN(mm) || mm <= 0) return 0;
  return clamp01(mm / CLIMATOLOGY_PEAK_MM);
}

/**
 * Compute the baseline risk for one road segment (or district cluster).
 *
 * @param {object} input
 * @param {Array<{year?:number, severity?:string}>} input.incidents nearby historical incidents (correct month window)
 * @param {'OPEN'|'RISKY'|'BLOCKED'} [input.roadStatus]
 * @param {number} [input.envScore] 0..1 climatology exposure for the month
 * @param {number} [input.clusterDensity] 0..1 spatial clustering signal
 * @param {number} [input.currentYear] default new Date().getFullYear()
 */
function computeBaselineScore({
  incidents = [],
  roadStatus = 'OPEN',
  envScore = 0,
  clusterDensity = 0,
  currentYear = new Date().getFullYear(),
} = {}) {
  const n = incidents.length;

  let recentWeightedCount = 0;
  let severitySum = 0;
  let minYear = currentYear;
  const years = new Set();
  for (const inc of incidents) {
    const y = inc.year || currentYear;
    years.add(y);
    minYear = Math.min(minYear, y);
    recentWeightedCount += currentYear - y <= 2 ? 1.5 : 1;
    severitySum += SEVERITY_WEIGHT[inc.severity] ?? 0.5;
  }

  const severityMean = n ? severitySum / n : 0;
  const severitySignal = n ? clamp01((severityMean - 0.4) / 0.6) : 0;

  const spanYears = years.size ? currentYear - minYear + 1 : 0;
  const seasonalRecurrence = spanYears
    ? clamp01(years.size / spanYears)
    : 0;
  const frequency = n ? 1 - Math.exp(-0.35 * recentWeightedCount) : 0;

  const score = clamp01(
    WEIGHTS.frequency * frequency +
      WEIGHTS.seasonality * seasonalRecurrence +
      WEIGHTS.clustering * clusterDensity +
      WEIGHTS.severity * severitySignal +
      WEIGHTS.status * (ROAD_STATUS_BOOST[roadStatus] ?? 0) +
      WEIGHTS.climatology * clamp01(envScore)
  );

  const dataCoverage = n >= 5 && seasonalRecurrence >= 0.25 ? 'adequate' : 'insufficient';

  const confidence = n === 0
    ? 0.1
    : clamp01(
        0.35 +
          0.25 * (1 - 1 / Math.sqrt(1 + n)) +
          0.15 * seasonalRecurrence +
          0.15 * Math.min(1, clusterDensity * 2) +
          0.1 * (envScore > 0 ? 1 : 0)
      );

  const factors = [
    { label: 'Historical frequency', value: round(frequency), weight: WEIGHTS.frequency },
    { label: 'Seasonal recurrence', value: round(seasonalRecurrence), weight: WEIGHTS.seasonality },
    { label: 'Spatial clustering', value: round(clusterDensity), weight: WEIGHTS.clustering },
    { label: 'Severity profile', value: round(severitySignal), weight: WEIGHTS.severity },
    { label: 'Current road status', value: ROAD_STATUS_BOOST[roadStatus] ?? 0, weight: WEIGHTS.status },
    { label: 'Monsoon climatology', value: round(envScore), weight: WEIGHTS.climatology },
  ];
  if (n === 0) {
    factors.push({ label: 'Insufficient historical observations', value: 1, weight: 0 });
  }

  return {
    riskScore: round(score),
    confidence: round(confidence),
    level: levelFromScore(score),
    factors,
    dataCoverage,
    seasonalRecurrence: round(seasonalRecurrence),
    historicalCount: n,
    severitySignal: round(severitySignal),
    clusterDensity: round(clusterDensity),
    envScore: round(clamp01(envScore)),
    roadStatus,
  };
}

function round(v) {
  return Math.round((v + Number.EPSILON) * 10000) / 10000;
}

module.exports = {
  SEVERITY_WEIGHT,
  ROAD_STATUS_BOOST,
  WEIGHTS,
  LEVELS,
  levelFromScore,
  envScoreFromRainfall,
  computeBaselineScore,
  clamp01,
};