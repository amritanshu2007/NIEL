'use strict';

/**
 * Predictive Monsoon - spatial analytics (pure / DB-free).
 *
 * DBSCAN-style clustering over historical incident points plus
 * point-to-line distance helpers used to assign incidents to road
 * segments. No database I/O here so the algorithms stay unit-testable.
 */

const toRad = (d) => (d * Math.PI) / 180;
const EARTH_KM = 6371;

function haversineKm(a, b) {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

/** Distance from {lat,lng} to a [lng,lat] polyline, in km. */
function pointToLineKm(point, coords) {
  if (!coords || coords.length < 2) {
    const c = coords && coords.length ? coords[0] : [point.lng, point.lat];
    return haversineKm([point.lng, point.lat], c);
  }
  let best = Infinity;
  for (let i = 0; i + 1 < coords.length; i += 1) {
    best = Math.min(best, pointToSegmentKm(point, coords[i], coords[i + 1]));
  }
  return best;
}

/** Approximate distance from {lat,lng} to segment a->b ([lng,lat]) in km. */
function pointToSegmentKm(point, a, b) {
  const cosLat = Math.cos(toRad(a[1] || point.lat));
  const ax = a[0] * cosLat;
  const ay = a[1];
  const bx = b[0] * cosLat;
  const by = b[1];
  const px = point.lng * cosLat;
  const py = point.lat;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return haversineKm([point.lng, point.lat], [cx / cosLat, cy]);
}

/**
 * DBSCAN clustering over points [{lat,lng}].
 * @returns {number[]} labels vec, -1 = noise; cluster ids start at 0.
 */
function dbscan(points, epsKm, minPts) {
  const n = points.length;
  const labels = new Array(n).fill(-1);
  let clusterId = 0;

  const regionQuery = (p) => {
    const neighbors = [];
    for (let j = 0; j < n; j += 1) {
      if (j === p) {
        neighbors.push(j);
        continue;
      }
      const a = points[p];
      const b = points[j];
      if (haversineKm([a.lng, a.lat], [b.lng, b.lat]) <= epsKm) neighbors.push(j);
    }
    return neighbors;
  };

  for (let i = 0; i < n; i += 1) {
    if (labels[i] !== -1) continue;
    const seeds = regionQuery(i);
    if (seeds.length < minPts) {
      labels[i] = -1; // noise
      continue;
    }
    clusterId += 1;
    labels[i] = clusterId;
    const queue = seeds.slice();
    while (queue.length) {
      const q = queue.pop();
      if (labels[q] === -1) labels[q] = clusterId;
      if (labels[q] !== undefined && labels[q] !== -1 && labels[q] !== clusterId) continue;
      if (labels[q] === clusterId) continue;
      labels[q] = clusterId;
      const qSeeds = regionQuery(q);
      if (qSeeds.length >= minPts) {
        for (const s of qSeeds) {
          if (labels[s] === -1 || labels[s] === undefined) queue.push(s);
        }
      }
    }
  }
  return labels;
}

/** Number of points within `radiusKm` of points[idx] (includes itself). */
function neighborhoodDensity(points, idx, radiusKm) {
  const a = points[idx];
  let c = 0;
  for (const b of points) {
    if (haversineKm([a.lng, a.lat], [b.lng, b.lat]) <= radiusKm) c += 1;
  }
  return c;
}

/** Cluster map: clusterId -> count. */
function clusterCounts(labels) {
  const counts = new Map();
  for (const l of labels) {
    if (l === -1) continue;
    counts.set(l, (counts.get(l) || 0) + 1);
  }
  return counts;
}

/** 0..1 spatial clustering signal derived from neighbour density. */
function clusteringSignal(points, idx, radiusKm = 20, plateau = 8) {
  const d = neighborhoodDensity(points, idx, radiusKm);
  return Math.min(1, d / plateau);
}

module.exports = {
  haversineKm,
  pointToLineKm,
  pointToSegmentKm,
  dbscan,
  neighborhoodDensity,
  clusterCounts,
  clusteringSignal,
};