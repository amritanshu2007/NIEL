'use strict';

/**
 * Fuel & Carbon Analytics - baseline routing strategy (pure / DB-free).
 *
 * BASELINE METHODOLOGY (clearly labelled, not fabricated):
 *   The pre-optimisation standard for an O-D pair is defined as the
 *   straight-line great-circle distance between the two points, traversed
 *   at the reference baseline average speed. This is the neutral "no
 *   corridor optimisation was applied" reference: the maximum possible
 *   ideal distance that NIEL route optimisation works to beat. Optimised
 *   metrics always come from the EXISTING routing engine - never from here.
 *
 * The reference speed is a single, configurable constant (exposed in the
 * report as an assumption, not buried in the model).
 */

const haversine = (a, b) => {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const BASELINE_SPEED_KMH = 30; // NER reference average speed (km/h)
const BASELINE_METHODOLOGY = 'great-circle baseline @ 30 km/h reference speed';
const BASELINE_SOURCE = 'analytics-baseline/great-circle';

function baselineRoute({ originLat, originLng, destinationLat, destinationLng, speedKmh = BASELINE_SPEED_KMH }) {
  const distanceKm = haversine([Number(originLng), Number(originLat)], [Number(destinationLng), Number(destinationLat)]);
  const durationMin = (distanceKm / speedKmh) * 60;
  return {
    source: BASELINE_SOURCE,
    methodology: BASELINE_METHODOLOGY,
    speedKmh,
    distanceKm: round2(distanceKm),
    durationMin: round2(durationMin),
    geometry: {
      type: 'LineString',
      coordinates: [
        [Number(originLng), Number(originLat)],
        [Number(destinationLng), Number(destinationLat)],
      ],
    },
  };
}

function round2(v) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

module.exports = { BASELINE_SPEED_KMH, BASELINE_METHODOLOGY, BASELINE_SOURCE, baselineRoute, haversine };