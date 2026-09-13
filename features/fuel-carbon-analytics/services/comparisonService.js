'use strict';

/**
 * Fuel & Carbon Analytics - route comparison service.
 *
 * Consumes the EXISTING routing engine (routingService.optimizeRoute) for the
 * optimised leg; the baseline always comes from analytics/baselineStrategy
 * (great-circle @ reference speed). Both legs are then priced through the
 * same vehicle profile + emission factor. Nothing here rewrites routing.
 */

const routingService = require('../../../src/services/routingService');
const { computeRouteMetrics, computeSavings, normalizeFuelType } = require('../analytics/emissions');
const { baselineRoute, BASELINE_SOURCE } = require('../analytics/baselineStrategy');
const efficiencyModel = require('../models/efficiencyModel');

/**
 * @param {object} args
 * @param {number} args.originLat   origin.lat  origin.lng        [lng,lat] engine input
 * @param {number} args.destinationLat
 * @param {object|null} args.profile  vehicle_efficiency_profiles row
 * @param {number|null} args.emissionFactor  kg CO2 per unit (pulled from DB if null)
 * @param {boolean} args.optimize  run the real engine for the optimized leg
 */
async function runComparison(args) {
  const { originLat, originLng, destinationLat, destinationLng } = args;
  if ([originLat, originLng, destinationLat, destinationLng].some((v) => v === undefined || v === null || Number.isNaN(Number(v)))) {
    return { ok: false, error: 'origin and destination coordinates are required' };
  }
  const coords = {
    oLat: Number(originLat),
    oLng: Number(originLng),
    dLat: Number(destinationLat),
    dLng: Number(destinationLng),
  };

  const profile = args.profile;
  if (!profile) return { ok: false, error: 'a vehicle efficiency profile is required' };
  const fuelType = normalizeFuelType(profile.fuelType);
  if (!fuelType) return { ok: false, error: 'invalid fuel type on profile' };

  const emissionFactor = Number(args.emissionFactor);
  if (Number.isNaN(emissionFactor) || emissionFactor < 0) {
    return { ok: false, error: 'emissionFactor must be numeric >= 0' };
  }
  const efficiency = Number(profile.efficiency);
  const fuelPricePerUnit = Number(profile.fuelPricePerUnit || 0);

  // --- baseline (labelled convention - never rewritten by optimisation)
  const baseline = baselineRoute({ originLat: coords.oLat, originLng: coords.oLng, destinationLat: coords.dLat, destinationLng: coords.dLng });

  // --- optimised leg from the EXISTING routing engine
  let optimized;
  if (args.optimize === false) {
    optimized = baseline;
  } else {
    const engine = await routingService.optimizeRoute({
      start: [coords.oLng, coords.oLat],
      end: [coords.dLng, coords.dLat],
    });
    optimized = {
      source: engine.source || 'road-network',
      distanceKm: Number(engine.distanceKm),
      durationMin: Number(engine.durationMin),
      geometry: engine.geometry || null,
    };
  }

  const baseMetrics = computeRouteMetrics({
    distanceKm: baseline.distanceKm,
    durationMin: baseline.durationMin,
    efficiency,
    fuelType,
    fuelPricePerUnit,
    emissionFactor,
  });
  if (!baseMetrics.ok) return baseMetrics;

  const optMetrics = computeRouteMetrics({
    distanceKm: optimized.distanceKm,
    durationMin: optimized.durationMin,
    efficiency,
    fuelType,
    fuelPricePerUnit,
    emissionFactor,
  });
  if (!optMetrics.ok) return optMetrics;

  const savings = computeSavings({ baseline: baseMetrics, optimized: optMetrics });

  const comparison = {
    ok: true,
    origin: { lat: coords.oLat, lng: coords.oLng },
    destination: { lat: coords.dLat, lng: coords.dLng },
    profile: {
      profileName: profile.profileName,
      vehicleType: profile.vehicleType,
      fuelType,
      efficiency,
      efficiencyUnit: profile.efficiencyUnit,
      fuelPricePerUnit,
    },
    baseline,
    optimized: {
      source: optimized.source,
      distanceKm: optMetrics.distanceKm,
      durationMin: optMetrics.durationMin,
      geometry: optimized.geometry,
    },
    metrics: {
      baseline: baseMetrics,
      optimized: optMetrics,
      savings,
    },
    methodology: {
      baseline: baseline.methodology,
      optimizedSource: optimized.source,
      emissionFactor,
      emissionFactorType: profile.fuelType === 'ELECTRIC' ? 'kg_co2_per_kwh' : undefined,
    },
  };
  return comparison;
}

/** Build and persist a comparison as a route_efficiency_record. */
async function persistComparison({ comparison, vehicleId, calculatedBy, originName, destinationName, profileId }) {
  if (!comparison || !comparison.ok) return null;
  return efficiencyModel.createRecord({
    vehicleId,
    profileId,
    calculatedBy,
    originName,
    destinationName,
    originLat: comparison.origin.lat,
    originLng: comparison.origin.lng,
    destinationLat: comparison.destination.lat,
    destinationLng: comparison.destination.lng,
    baseline: comparison.baseline,
    optimized: comparison.optimized,
    savings: comparison.metrics.savings,
    baselineFuelUnits: comparison.metrics.baseline.consumption,
    optimizedFuelUnits: comparison.metrics.optimized.consumption,
    fuelUnit: comparison.metrics.optimized.unit,
    baselineCo2Kg: comparison.metrics.baseline.co2Kg,
    optimizedCo2Kg: comparison.metrics.optimized.co2Kg,
    payloadFactor: null,
  });
}

/** Resolve a profile + emission factor for a request (profile id or profileName, vehicleId). */
async function resolveProfileAndFactor({ profileId, profileName, vehicleId }) {
  let profile = null;
  let dbProfileId = null;
  if (vehicleId) {
    const vehicles = await efficiencyModel.listVehicles();
    const v = vehicles.find((x) => String(x.id) === String(vehicleId));
    if (!v) return { ok: false, error: `vehicle ${vehicleId} not found` };
    profile = {
      profileName: v.profileName || `Vehicle ${v.vehicleNumber}`,
      vehicleType: v.vehicleType || 'Fleet',
      fuelType: v.fuelType,
      efficiency: v.efficiency,
      efficiencyUnit: v.efficiencyUnit,
      fuelPricePerUnit: v.fuelPricePerUnit,
    };
  } else if (profileId) {
    const row = await efficiencyModel.getProfile(Number(profileId));
    if (row) {
      profile = row;
      dbProfileId = row.id;
    }
  } else if (profileName) {
    const list = await efficiencyModel.listProfiles({});
    const row = list.find((p) => p.profileName === profileName) || null;
    if (row) {
      profile = row;
      dbProfileId = row.id;
    }
  }
  if (!profile) return { ok: false, error: 'a vehicle efficiency profile (profileId/profileName/vehicleId) is required' };
  const factorRow = await efficiencyModel.getEmissionFactor(profile.fuelType);
  if (!factorRow) return { ok: false, error: `no emission factor configured for ${profile.fuelType}` };
  return { ok: true, profile, profileId: dbProfileId, emissionFactor: Number(factorRow.factor_value) };
}

module.exports = { runComparison, persistComparison, resolveProfileAndFactor, BASELINE_SOURCE };