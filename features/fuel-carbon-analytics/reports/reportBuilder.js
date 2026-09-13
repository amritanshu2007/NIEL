'use strict';

/**
 * Fuel & Carbon Analytics - institutional report builder (pure / DB-free).
 *
 * Shapes ledger aggregates + factor snapshots into a government-ready report:
 * every report carries the methodology statement, the assumptions table, the
 * exact emission factors used, and a generated-at timestamp. Exports exist as
 * CSV (spreadsheet) and plain-text (human) forms in addition to JSON.
 */

const { BASELINE_METHODOLOGY, BASELINE_SPEED_KMH } = require('../analytics/baselineStrategy');

const CO2_TO_TONNES = 1000;

function buildReport({ aggregates, factors, filters, generatedBy, generatedAt = new Date() }) {
  const t = aggregates.totals;

  return {
    generatedAt: generatedAt.toISOString(),
    generatedBy: generatedBy || 'system',
    methodology: {
      baseline: BASELINE_METHODOLOGY,
      baselineSpeedKmh: BASELINE_SPEED_KMH,
      optimizedSource: 'NIEL existing routing engine (/api/route/optimize)',
      co2Model:
        'CO2 = fuel_or_energy_consumed x emission_factor, where fuel = distance / efficiency. ' +
        'Emission factors are user-configurable in emission_factors (admin-editable); no values are hardcoded.',
      limitations:
        'Baseline is a great-circle straight-line convention at the reference speed; it is the ' +
        'maximum ideal the optimisation beats, not a measured odometer reading.',
    },
    filters: filters || {},
    factors: factors || [],
    summary: {
      routeCount: Number(t.routeCount),
      distanceSavedKm: Number(t.distanceSavedKm),
      timeSavedMin: Number(t.timeSavedMin),
      fuelSavedUnits: Number(t.fuelSavedUnits),
      costSavedInr: Number(t.costSavedInr),
      co2SavedKg: Number(t.co2SavedKg),
      co2SavedTonnes: round1(Number(t.co2SavedKg) / CO2_TO_TONNES),
      avgImprovementPct: round1(Number(t.avgImprovementPct)),
      avgCo2SavedPct: round1(Number(t.avgCo2SavedPct)),
      optimizedDistanceKm: Number(t.optimizedDistanceKm),
      baselineDistanceKm: Number(t.baselineDistanceKm),
    },
    series: {
      daily: aggregates.daily,
      monthly: aggregates.monthly,
      byVehicle: aggregates.byVehicle,
      byRoute: aggregates.byRoute,
    },
  };
}

function toCsv(report) {
  const rows = [];
  const push = (arr) => rows.push(arr.map(csvCell).join(','));
  push(['# NIEL Fuel & Carbon Analytics Report']);
  push(['Generated', report.generatedAt]);
  push(['Methodology', report.methodology.baseline]);
  push(['OptimizedSource', report.methodology.optimizedSource]);
  push(['Co2Model', report.methodology.co2Model]);
  push(['']);

  push(['Metric', 'Value']);
  push(['Route count', report.summary.routeCount]);
  push(['Distance saved (km)', report.summary.distanceSavedKm]);
  push(['Time saved (min)', report.summary.timeSavedMin]);
  push(['Fuel saved (units)', report.summary.fuelSavedUnits]);
  push(['Cost saved (INR)', report.summary.costSavedInr]);
  push(['CO2 saved (kg)', report.summary.co2SavedKg]);
  push(['CO2 saved (t)', report.summary.co2SavedTonnes]);
  push(['Avg improvement (%)', report.summary.avgImprovementPct]);
  push(['']);

  push(['Route', 'Trips', 'Avg save (%)', 'CO2 saved (kg)']);
  for (const r of report.series.byRoute) {
    push([`${r.route}`, r.trips, r.avgsave || r.avgSavePct, r.co2SavedKg]);
  }
  push(['']);

  push(['Period', 'Month', 'Routes', 'Distance saved (km)', 'Fuel saved', 'CO2 saved (kg)', 'Cost saved (INR)']);
  for (const r of report.series.monthly) {
    push([`${r.period}`, r.period, r.routes, r.distanceSavedKm, r.fuelSavedUnits, r.co2SavedKg, r.costSavedInr]);
  }
  push(['']);

  push(['Emission factors (kg CO2 per unit)']);
  for (const f of report.factors) {
    push([`${f.fuelType}`, f.factorValue, f.factorType]);
  }
  return rows.join('\n');
}

function toText(report) {
  const lines = [];
  const L = (s) => { lines.push(s); };
  L('============================================================');
  L('  NIEL Fuel & Carbon Efficiency Report');
  L('============================================================');
  L(`Generated : ${report.generatedAt}`);
  L(`By        : ${report.generatedBy}`);
  L('');
  L('METHODOLOGY');
  L(`  Baseline      : ${report.methodology.baseline}`);
  L(`  Reference spd : ${report.methodology.baselineSpeedKmh} km/h`);
  L(`  Optimized     : ${report.methodology.optimizedSource}`);
  L(`  CO2 model     : ${report.methodology.co2Model}`);
  L(`  Limitation    : ${report.methodology.limitations}`);
  L('');
  L('SUMMARY');
  L(`  Routes compared   : ${report.summary.routeCount}`);
  L(`  Distance saved    : ${report.summary.distanceSavedKm} km`);
  L(`  Time saved        : ${report.summary.timeSavedMin} min`);
  L(`  Fuel saved        : ${report.summary.fuelSavedUnits}`);
  L(`  Cost saved        : INR ${report.summary.costSavedInr}`);
  L(`  CO2 saved         : ${report.summary.co2SavedKg} kg (${report.summary.co2SavedTonnes} t)`);
  L(`  Avg improvement   : ${report.summary.avgImprovementPct}%`);
  L('');
  L('MONTHLY SERIES');
  for (const r of report.series.monthly) {
    L(`  ${r.period}: ${r.routes} routes, ${r.distanceSavedKm} km saved, ${r.co2SavedKg} kg CO2 saved`);
  }
  L('');
  L('EMISSION FACTORS');
  for (const f of report.factors) {
    L(`  ${f.fuelType}: ${f.factorValue} ${f.factorType}`);
  }
  return lines.join('\n');
}

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /["\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const round1 = (v) => Math.round((v + Number.EPSILON) * 10) / 10;

module.exports = { buildReport, toCsv, toText };