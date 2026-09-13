'use strict';

/**
 * Fuel & Carbon Analytics - deterministic fuel / CO2 model (pure / DB-free).
 *
 * Every calculation is a transparent, deterministic transform:
 *   fuel_consumption = distance / efficiency
 *   CO2              = fuel_consumption * emission_factor
 *   EV energy        = distance / efficiency(km per kWh)
 *   EV CO2           = energy * grid_emission_factor
 *
 * No hardcoded emission assumptions live inside the calculations - factors
 * and prices are always passed in from the configurable parameter tables.
 * Zero / invalid efficiency is reported as an explicit error, never NaN.
 */

const FUEL_TYPES = ['PETROL', 'DIESEL', 'CNG', 'ELECTRIC'];
const EFFICIENCY_UNITS = ['km_per_litre', 'km_per_kg', 'km_per_kwh'];

const FUEL_UNIT_BY_FUEL_TYPE = {
  PETROL: 'litres',
  DIESEL: 'litres',
  CNG: 'kg',
  ELECTRIC: 'kwh',
};

function normalizeFuelType(fuelType) {
  if (typeof fuelType !== 'string') return null;
  const t = fuelType.trim().toUpperCase();
  return FUEL_TYPES.includes(t) ? t : null;
}

function validateRoutes(distanceKm, durationMin) {
  const d = Number(distanceKm);
  const t = Number(durationMin);
  if (Number.isNaN(d) || d < 0) return { ok: false, error: 'distanceKm must be numeric >= 0' };
  if (Number.isNaN(t) || t < 0) return { ok: false, error: 'durationMin must be numeric >= 0' };
  return { ok: true, distanceKm: d, durationMin: t };
}

function validateParams({ efficiency, fuelType }) {
  const fuel = normalizeFuelType(fuelType);
  if (!fuel) return { ok: false, error: `fuelType must be one of: ${FUEL_TYPES.join(', ')}` };
  const eff = Number(efficiency);
  if (Number.isNaN(eff) || eff <= 0) {
    return { ok: false, error: `efficiency must be a positive number (got ${JSON.stringify(efficiency)})` };
  }
  return { ok: true, fuel, efficiency: eff };
}

/**
 * Compute fuel/energy consumption, cost and CO2 for one distance.
 * @returns {{ok:true, fuelType, unit, consumption, cost, co2Kg}|{ok:false,error}}
 */
function computeRouteMetrics({ distanceKm, durationMin, efficiency, fuelType, fuelPricePerUnit, emissionFactor }) {
  const params = validateParams({ efficiency, fuelType });
  if (!params.ok) return params;
  const route = validateRoutes(distanceKm, durationMin);
  if (!route.ok) return route;

  const price = Number(fuelPricePerUnit || 0);
  const factor = Number(emissionFactor);
  if (Number.isNaN(price) || price < 0) return { ok: false, error: 'fuelPricePerUnit must be numeric >= 0' };
  if (Number.isNaN(factor) || factor < 0) return { ok: false, error: 'emissionFactor must be numeric >= 0' };

  const consumption = route.distanceKm / params.efficiency;
  const cost = consumption * price;
  const co2Kg = consumption * factor;

  return {
    ok: true,
    fuelType: params.fuel,
    unit: FUEL_UNIT_BY_FUEL_TYPE[params.fuel],
    distanceKm: route.distanceKm,
    durationMin: route.durationMin,
    consumption: round(consumption),
    costInr: round(cost),
    co2Kg: round(co2Kg),
  };
}

/**
 * Compute dirty savings between a baseline and an optimized route metric
 * pair. Both must be computed with the SAME vehicle profile.
 */
function computeSavings({ baselineDistanceKm, optimizedDistanceKm, baseline: base, optimized: opt }) {
  const baseline = base || { distanceKm: Number(baselineDistanceKm), consumption: 0, costInr: 0, co2Kg: 0, durationMin: 0 };
  const optimized = opt || {
    distanceKm: Number(optimizedDistanceKm),
    consumption: 0,
    costInr: 0,
    co2Kg: 0,
    durationMin: 0,
  };

  const distanceSavedKm = Math.max(0, round(baseline.distanceKm - optimized.distanceKm));
  const timeSavedMin = Math.max(0, round(baseline.durationMin - optimized.durationMin));
  const fuelSavedUnits = round(baseline.consumption - optimized.consumption);
  const costSavedInr = round(baseline.costInr - optimized.costInr);
  const co2SavedKg = round(baseline.co2Kg - optimized.co2Kg);

  const pct = (b, o) => (b > 0 ? round(((b - o) / b) * 100) : 0);

  return {
    distanceSavedKm,
    timeSavedMin,
    fuelSavedUnits: Math.max(0, fuelSavedUnits),
    fuelSavedCostInr: Math.max(0, costSavedInr),
    co2SavedKg: Math.max(0, co2SavedKg),
    distanceSavedPct: pct(baseline.distanceKm, optimized.distanceKm),
    timeSavedPct: pct(baseline.durationMin, optimized.durationMin),
    co2SavedPct: pct(baseline.co2Kg, optimized.co2Kg),
    fuelSavedPct: pct(baseline.consumption, optimized.consumption),
    improvementScore: round(
      (pct(baseline.distanceKm, optimized.distanceKm) +
        pct(baseline.durationMin, optimized.durationMin)) /
        2
    ),
  };
}

function round(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 10000) / 10000;
}

module.exports = {
  FUEL_TYPES,
  EFFICIENCY_UNITS,
  FUEL_UNIT_BY_FUEL_TYPE,
  normalizeFuelType,
  computeRouteMetrics,
  computeSavings,
  validateRoutes,
  validateParams,
  round,
};