'use strict';

/**
 * Multimodal Logistics - validation. Pure functions (unit-testable).
 *
 * Transport-graph model:
 *   - transport_nodes carry a geographic location + capacity + status.
 *   - transport_edges join two nodes under one of the four modes:
 *     ROAD | DRONE | HELICOPTER | RIVER
 *   - route requests pick allowed modes + an objective (weighted cost).
 */

const MODES = ['ROAD', 'DRONE', 'HELICOPTER', 'RIVER'];
const NODE_TYPES = [
  'DRONE_WAYPOINT',
  'HELIPAD',
  'RIVER_PORT',
  'ROAD_JUNCTION',
  'WAREHOUSE',
  'RELIEF_CENTER',
];
const OPERATIONAL_STATUSES = ['ACTIVE', 'INACTIVE', 'MAINTENANCE'];
const ACCESSIBILITY_STATUSES = ['OPEN', 'BLOCKED', 'RESTRICTED'];
const CARGO_TYPES = ['Medicine', 'Food', 'Construction', 'Agriculture'];
const WEIGHT_KEYS = ['time', 'distance', 'risk', 'cost'];

function inRange(v, min, max) {
  const n = Number(v);
  return !Number.isNaN(n) && n >= min && n <= max;
}

function validPoint(p) {
  if (!p || typeof p !== 'object') return false;
  return inRange(p.lat, -90, 90) && inRange(p.lng, -180, 180);
}

function sanitizeText(value, maxLen) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s ? s.slice(0, maxLen) : null;
}

/** Validate a transport-node definition. */
function validateNode(input) {
  const { name, nodeType, latitude, longitude, capacity, operationalStatus, metadata } = input || {};
  const nameClean = sanitizeText(name, 150);
  if (!nameClean) return { ok: false, error: 'name is required (max 150 chars)' };
  if (!NODE_TYPES.includes(nodeType)) {
    return { ok: false, error: `nodeType must be one of: ${NODE_TYPES.join(', ')}` };
  }
  if (!inRange(latitude, -90, 90) || !inRange(longitude, -180, 180)) {
    return { ok: false, error: 'latitude / longitude must be numeric in range' };
  }
  const cap = capacity === undefined || capacity === null ? null : Number(capacity);
  if (cap !== null && (Number.isNaN(cap) || cap < 0 || !Number.isInteger(cap))) {
    return { ok: false, error: 'capacity must be a non-negative integer' };
  }
  const status = operationalStatus || 'ACTIVE';
  if (!OPERATIONAL_STATUSES.includes(status)) {
    return { ok: false, error: `operationalStatus must be one of: ${OPERATIONAL_STATUSES.join(', ')}` };
  }
  let meta = null;
  if (metadata !== undefined && metadata !== null) {
    if (typeof metadata !== 'object' || Array.isArray(metadata)) {
      return { ok: false, error: 'metadata must be a JSON object' };
    }
    meta = metadata;
  }
  return {
    ok: true,
    normalized: {
      name: nameClean,
      nodeType,
      latitude: Number(latitude),
      longitude: Number(longitude),
      capacity: cap === null ? 100 : cap,
      operationalStatus: status,
      metadata: meta,
    },
  };
}

/** Validate a transport-edge definition. */
function validateEdge(input) {
  const {
    fromNodeId,
    toNodeId,
    mode,
    distanceKm,
    estimatedTimeMin,
    estimatedCostInr,
    capacity,
    accessibilityStatus,
    riskScore,
    metadata,
  } = input || {};
  const from = Number(fromNodeId);
  const to = Number(toNodeId);
  if (!Number.isInteger(from) || from <= 0 || !Number.isInteger(to) || to <= 0) {
    return { ok: false, error: 'fromNodeId / toNodeId must be positive integers' };
  }
  if (from === to) return { ok: false, error: 'an edge can not connect a node to itself' };
  if (!MODES.includes(mode)) {
    return { ok: false, error: `mode must be one of: ${MODES.join(', ')}` };
  }
  if (!inRange(distanceKm, 0.05, 5000)) {
    return { ok: false, error: 'distanceKm must be numeric in (0, 5000]' };
  }
  if (!inRange(estimatedTimeMin, 0.05, 100000)) {
    return { ok: false, error: 'estimatedTimeMin must be numeric > 0' };
  }
  const cost = estimatedCostInr === undefined || estimatedCostInr === null ? 0 : Number(estimatedCostInr);
  if (Number.isNaN(cost) || cost < 0) return { ok: false, error: 'estimatedCostInr must be numeric >= 0' };
  const cap = capacity === undefined || capacity === null ? 100 : Number(capacity);
  if (Number.isNaN(cap) || cap < 0 || !Number.isInteger(cap)) {
    return { ok: false, error: 'capacity must be a non-negative integer' };
  }
  const status = accessibilityStatus || 'OPEN';
  if (!ACCESSIBILITY_STATUSES.includes(status)) {
    return { ok: false, error: `accessibilityStatus must be one of: ${ACCESSIBILITY_STATUSES.join(', ')}` };
  }
  const risk = riskScore === undefined || riskScore === null ? 0 : Number(riskScore);
  if (Number.isNaN(risk) || risk < 0 || risk > 1) {
    return { ok: false, error: 'riskScore must be numeric in [0, 1]' };
  }
  let meta = null;
  if (metadata !== undefined && metadata !== null) {
    if (typeof metadata !== 'object' || Array.isArray(metadata)) {
      return { ok: false, error: 'metadata must be a JSON object' };
    }
    meta = metadata;
  }
  return {
    ok: true,
    normalized: {
      fromNodeId: from,
      toNodeId: to,
      mode,
      distanceKm: Number(distanceKm),
      estimatedTimeMin: Number(estimatedTimeMin),
      estimatedCostInr: cost,
      capacity: cap,
      accessibilityStatus: status,
      riskScore: risk,
      metadata: meta,
    },
  };
}

/** Validate a multimodal route planning request. */
function validateRouteRequest(input) {
  const { origin, destination, modes, weights, load, cargoType, avoidBlocked, maxCost } = input || {};
  if (!validPoint(origin)) return { ok: false, error: 'origin must include numeric lat/lng in range' };
  if (!validPoint(destination)) return { ok: false, error: 'destination must include numeric lat/lng in range' };

  const originName = sanitizeText(origin.name || origin.label, 150);
  const destName = sanitizeText(destination.name || destination.label, 150);

  let allowed = MODES;
  if (modes !== undefined && modes !== null) {
    if (!Array.isArray(modes) || modes.length === 0) {
      return { ok: false, error: 'modes must be a non-empty array of modes' };
    }
    for (const m of modes) {
      if (!MODES.includes(m)) {
        return { ok: false, error: `invalid mode "${m}" (allowed: ${MODES.join(', ')})` };
      }
    }
    allowed = [...new Set(modes)];
  }

  let w = null;
  if (weights !== undefined && weights !== null) {
    if (typeof weights !== 'object' || Array.isArray(weights)) {
      return { ok: false, error: 'weights must be an object' };
    }
    w = {};
    for (const key of WEIGHT_KEYS) {
      const v = weights[key];
      if (v === undefined || v === null) continue;
      const n = Number(v);
      if (Number.isNaN(n) || n < 0) return { ok: false, error: `weight "${key}" must be numeric >= 0` };
      w[key] = n;
    }
    if (Object.keys(w).length === 0) w = null;
  }

  const loadNum = load === undefined || load === null ? 1 : Number(load);
  if (Number.isNaN(loadNum) || loadNum < 0) {
    return { ok: false, error: 'load must be a non-negative number' };
  }

  const cargo = cargoType || 'Medicine';
  if (!CARGO_TYPES.includes(cargo)) {
    return { ok: false, error: `cargoType must be one of: ${CARGO_TYPES.join(', ')}` };
  }

  const maxCostNum = maxCost === undefined || maxCost === null ? null : Number(maxCost);
  if (maxCostNum !== null && (Number.isNaN(maxCostNum) || maxCostNum < 0)) {
    return { ok: false, error: 'maxCost must be a non-negative number' };
  }

  return {
    ok: true,
    normalized: {
      origin: { lat: Number(origin.lat), lng: Number(origin.lng), name: originName || `${origin.lat},${origin.lng}` },
      destination: { lat: Number(destination.lat), lng: Number(destination.lng), name: destName || `${destination.lat},${destination.lng}` },
      modes: allowed,
      weights: w,
      load: loadNum,
      cargoType: cargo,
      avoidBlocked: avoidBlocked !== false,
      maxCost: maxCostNum,
    },
  };
}

module.exports = {
  MODES,
  NODE_TYPES,
  OPERATIONAL_STATUSES,
  ACCESSIBILITY_STATUSES,
  CARGO_TYPES,
  WEIGHT_KEYS,
  validPoint,
  validateNode,
  validateEdge,
  validateRouteRequest,
};