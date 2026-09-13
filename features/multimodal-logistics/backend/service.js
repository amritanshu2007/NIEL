'use strict';

/**
 * Multimodal Logistics - modal transport-graph planner.
 *
 * The ROAD component of every plan reuses the EXISTING Dijkstra road engine
 * (src/services/routingService.optimizeRoute) - this feature is an ADDITIVE
 * overlay, it never re-implements or bypasses the road network. DRONE /
 * HELICOPTER / RIVER legs come from the transport graph (transport_edges),
 * with cost, risk and capacity metadata. When no graph path exists the
 * planner honestly falls back to the plain road engine (and to great-circle
 * `direct` when even the road engine has no network access to the point),
 * mirroring the pre-existing behaviour.
 *
 * Pure geometry / graph functions are exported for unit testing without a DB.
 */

const routingService = require('../../../src/services/routingService');
const model = require('./model');
const { MODES } = require('./validation');

const ROAD_COST_PER_KM = 6.5;
const MODE_CO2_PER_KM = { ROAD: 0.82, DRONE: 0.03, HELICOPTER: 1.1, RIVER: 0.05 };
const EPS_KM = 0.05; // treat points closer than this as co-located
const DEFAULT_MAX_CANDIDATES = 12;

// ---------------------------------------------------------------- pure
function toRad(d) {
  return (d * Math.PI) / 180;
}
const EARTH_KM = 6371;

/** Great-circle distance between [lng,lat] and [lng,lat] (km). */
function haversineKm(a, b) {
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

/** Distance between two {lng,lat} objects in km. */
function pointDistKm(p, q) {
  return haversineKm([p.lng, p.lat], [q.lng, q.lat]);
}

const DEFAULT_WEIGHTS = { time: 1, distance: 0, risk: 0, cost: 0 };
const PROFILES = {
  fastest: { time: 1, distance: 0, risk: 0, cost: 0 },
  cheapest: { time: 0, distance: 0, risk: 0, cost: 1 },
};
const SNAP_ACCESS_KM = 50; // max straight distance for first/last-mile road legs
const BLOCKED_TIME_MULT = 2.5; // time penalty applied when a BLOCKED edge is taken explicitly
const BLOCKED_COST_MULT = 3; // cost penalty applied when a BLOCKED edge is taken explicitly

/** Canonical weights. `weights === null` => fastest default; an object is zero-filled. */
function normalizeWeights(weights) {
  if (!weights || typeof weights !== 'object' || Array.isArray(weights)) {
    return { ...PROFILES.fastest };
  }
  const w = { time: 0, distance: 0, risk: 0, cost: 0 };
  for (const k of Object.keys(w)) {
    if (weights[k] !== undefined && weights[k] !== null && Number(weights[k]) >= 0) {
      w[k] = Number(weights[k]);
    }
  }
  return w;
}

/** Weighted edge penalty used by the solvers. */
function edgeWeight(e, weights) {
  return (
    weights.time * Number(e.timeMin) +
    weights.distance * Number(e.distKm) +
    weights.risk * Number(e.risk || 0) +
    weights.cost * Number(e.costInr || 0)
  );
}

/** Derive a [0,1] risk score from the road engine's obstacle report. */
function riskFromEngine(roadResult) {
  const obstacles = (roadResult && roadResult.obstacles) || [];
  const blocked = obstacles.some((o) => o.status === 'BLOCKED');
  const risky = obstacles.some((o) => o.status === 'RISKY') || ((roadResult && roadResult.alerts) || []).length > 0;
  if (blocked) return 0.8;
  if (risky) return 0.4;
  return 0.05;
}

/**
 * Plain Dijkstra over an adjacency Map<key, Array<{to, edge}>>.
 * @returns {{path:string[], cost:number, edges:Array}} | null
 */
function dijkstraOnGraph(adj, startKey, endKey, weights) {
  const dist = new Map();
  const prev = new Map(); // key -> { from, edge }
  const visited = new Set();
  const pq = [{ key: startKey, cost: 0 }];
  dist.set(startKey, 0);

  while (pq.length) {
    pq.sort((a, b) => a.cost - b.cost);
    const { key } = pq.shift();
    if (key === endKey) break;
    if (visited.has(key)) continue;
    visited.add(key);

    for (const { to, edge } of adj.get(key) || []) {
      const nd = dist.get(key) + edgeWeight(edge, weights);
      if (nd < (dist.get(to) ?? Infinity)) {
        dist.set(to, nd);
        prev.set(to, { from: key, edge });
        pq.push({ key: to, cost: nd });
      }
    }
  }

  if (!dist.has(endKey)) return null;

  const path = [];
  const edges = [];
  let cur = endKey;
  while (cur !== startKey) {
    const p = prev.get(cur);
    path.unshift(cur);
    edges.unshift(p.edge);
    cur = p.from;
  }
  path.unshift(startKey);

  return { path, cost: dist.get(endKey), edges };
}

/**
 * Plan over a synthetic transport-graph in memory. Pure; tests call this
 * directly with fixtures.
 *
 * @param {object} opts
 * @param {Array<{id:string, lat:number, lng:number, name:string}>} opts.nodes candidate graph nodes
 * @param {Array<{from:string, to:string, mode:string, distKm:number, timeMin:number, costInr:number, risk:number, capacity:number, accessibilityStatus:string}>} opts.edges transport edges
 * @param {{lat:number,lng:number}} opts.origin
 * @param {{lat:number,lng:number}} opts.destination
 * @param {(a:{lat:number,lng:number}, b:{lat:number,lng:number})=>Promise<{distanceKm:number,durationMin:number,source:string,geometry:object,obstacles:Array}>} opts.roadAccess injected road engine
 * @param {Array<string>} opts.allowModes
 * @param {object|null} opts.weights
 * @param {number} opts.load
 * @param {boolean} opts.avoidBlocked
 * @param {number|null} opts.maxCost
 */
async function planOnGraph(opts) {
  const {
    nodes = [],
    edges = [],
    origin,
    destination,
    roadAccess,
    allowModes = MODES,
    weights: requestedWeights,
    load = 1,
    avoidBlocked = true,
    maxCost = null,
  } = opts;

  const nodeById = new Map(nodes.map((n) => [String(n.id), n]));
  const candidateIds = nodes.filter((n) => Number(n.capacity || 0) >= load).map((n) => String(n.id));
  const snapKm = opts.snapKm === undefined ? SNAP_ACCESS_KM : Number(opts.snapKm);

  const keyOf = { O: 'O', D: 'D' };
  const coordOf = new Map();
  coordOf.set('O', { lng: Number(origin.lng), lat: Number(origin.lat) });
  coordOf.set('D', { lng: Number(destination.lng), lat: Number(destination.lat) });
  for (const id of candidateIds) {
    const n = nodeById.get(id);
    coordOf.set(id, { lng: Number(n.lng), lat: Number(n.lat) });
  }

  // Overlay edges (all allowed modes) between candidate nodes.
  const adj = new Map();
  const addEdge = (fromKey, toKey, edge) => {
    if (!adj.has(fromKey)) adj.set(fromKey, []);
    adj.get(fromKey).push({ to: toKey, edge });
  };

  for (const e of edges) {
    const from = String(e.from);
    const to = String(e.to);
    if (!candidateIds.includes(from) || !candidateIds.includes(to)) continue;
    if (!allowModes.includes(e.mode)) continue;
    if (Number(e.capacity || 0) < load) continue;
    const blocked = e.accessibilityStatus === 'BLOCKED';
    if (blocked && avoidBlocked) continue; // blocked edge avoided unless explicitly requested
    const base = {
      mode: e.mode,
      distKm: Number(e.distKm),
      timeMin: blocked ? Number(e.timeMin) * BLOCKED_TIME_MULT : Number(e.timeMin),
      costInr: blocked ? Number(e.costInr || 0) * BLOCKED_COST_MULT : Number(e.costInr || 0),
      risk: blocked ? 1 : Number(e.risk || 0),
      co2PerKm: MODE_CO2_PER_KM[e.mode] || 0,
      source: 'transport-graph',
    };
    addEdge(from, to, { ...base, fromKey: from, toKey: to });
    addEdge(to, from, { ...base, fromKey: to, toKey: from });
  }

  // First / last mile via the existing road engine.
  const roadEdge = (aKey, bKey) => ({
    mode: 'ROAD',
    fromKey: aKey,
    toKey: bKey,
  });

  async function attachRoadLeg(aKey, bKey) {
    const a = coordOf.get(aKey);
    const b = coordOf.get(bKey);
    const straight = pointDistKm(a, b);
    if (straight <= EPS_KM) {
      addEdge(aKey, bKey, {
        ...roadEdge(aKey, bKey),
        distKm: 0,
        timeMin: 0,
        costInr: 0,
        risk: 0,
        co2PerKm: 0,
        source: 'co-located',
        geometry: { type: 'LineString', coordinates: [[a.lng, a.lat], [b.lng, b.lat]] },
      });
      return;
    }
    if (straight > snapKm) return; // first/last mile only reaches nearby nodes
    const res = await roadAccess(a, b);
    const hasBlocked = (res.obstacles || []).some((o) => o.status === 'BLOCKED');
    if (avoidBlocked && hasBlocked) return; // avoid corridors flagged blocked by the road engine
    addEdge(aKey, bKey, {
      ...roadEdge(aKey, bKey),
      distKm: Number(res.distanceKm || straight),
      timeMin: Number(res.durationMin || (straight / 40) * 60),
      costInr: (res.distanceKm || straight) * ROAD_COST_PER_KM,
      risk: riskFromEngine(res),
      co2PerKm: MODE_CO2_PER_KM.ROAD,
      source: res.source || 'road-network',
      geometry: (res.geometry && res.geometry.coordinates)
        ? res.geometry
        : { type: 'LineString', coordinates: [[a.lng, a.lat], [b.lng, b.lat]] },
    });
  }

  for (const id of candidateIds) {
    await attachRoadLeg('O', id);
    await attachRoadLeg(id, 'D');
  }

  const directKm = pointDistKm(origin, destination);

  // Solve under the requested objective(s).
  const objectives = {};
  if (requestedWeights) objectives.recommended = normalizeWeights(requestedWeights);
  objectives.fastest = PROFILES.fastest;
  objectives.cheapest = PROFILES.cheapest;

  const options = [];
  const seen = new Set();
  for (const [profile, weights] of Object.entries(objectives)) {
    const solved = dijkstraOnGraph(adj, 'O', 'D', weights);
    if (!solved) continue;
    const totalCostInr = solved.edges.reduce((s, e) => s + Number(e.costInr || 0), 0);
    const signature = `${profile}:${solved.path.join('>')}`;
    if (seen.has(signature)) continue;
    seen.add(signature);

    const option = {
      profile,
      path: solved.path,
      legs: solved.edges.map((edge) => ({
        from: coordOf.get(edge.fromKey),
        to: coordOf.get(edge.toKey),
        nodeFrom: edge.fromKey === 'O' || edge.fromKey === 'D' ? edge.fromKey : nodeById.get(edge.fromKey).name,
        nodeTo: edge.toKey === 'O' || edge.toKey === 'D' ? edge.toKey : nodeById.get(edge.toKey).name,
        mode: edge.mode,
        distanceKm: Number(edge.distKm || 0),
        durationMin: Number(edge.timeMin || 0),
        costInr: Number(edge.costInr || 0),
        riskScore: Number(edge.risk || 0),
        co2eKg: Number(edge.co2PerKm || 0) * Number(edge.distKm || 0),
        source: edge.source,
        geometry: edge.geometry || {
          type: 'LineString',
          coordinates: [
            [coordOf.get(edge.fromKey).lng, coordOf.get(edge.fromKey).lat],
            [coordOf.get(edge.toKey).lng, coordOf.get(edge.toKey).lat],
          ],
        },
      })),
      totalDistanceKm: solved.edges.reduce((s, e) => s + Number(e.distKm || 0), 0),
      totalDurationMin: solved.edges.reduce((s, e) => s + Number(e.timeMin || 0), 0),
      totalCostInr,
      totalCo2eKg: solved.edges.reduce((s, e) => s + Number(e.co2PerKm || 0) * Number(e.distKm || 0), 0),
      riskScore: Math.max(0, ...solved.edges.map((e) => Number(e.risk || 0)), 0),
      modesUsed: [...new Set(solved.edges.map((e) => e.mode))],
      feasible: maxCost === null || totalCostInr <= maxCost,
      reason: maxCost !== null && totalCostInr > maxCost ? `exceeds maxCost ${maxCost}` : null,
    };
    option.modalProfile = option.modesUsed.join(' + ');
    options.push(option);
  }

  if (options.length) {
    options.sort((a, b) => a.totalDurationMin - b.totalDurationMin);
    return { options, fallback: false, directKm };
  }

  // Honest fallback: plain road engine (road-network, else great-circle 'direct').
  const res = await roadAccess(origin, destination);
  const option = {
    profile: 'recommended',
    path: ['O', 'D'],
    legs: [
      {
        from: { lat: origin.lat, lng: origin.lng },
        to: { lat: destination.lat, lng: destination.lng },
        nodeFrom: 'O',
        nodeTo: 'D',
        mode: 'ROAD',
        distanceKm: Number(res.distanceKm || directKm),
        durationMin: Number(res.durationMin || (directKm / 40) * 60),
        costInr: (res.distanceKm || directKm) * ROAD_COST_PER_KM,
        riskScore: riskFromEngine(res),
        co2eKg: MODE_CO2_PER_KM.ROAD * Number(res.distanceKm || directKm),
        source: res.source || 'direct',
        geometry: (res.geometry && res.geometry.coordinates)
          ? res.geometry
          : { type: 'LineString', coordinates: [[origin.lng, origin.lat], [destination.lng, destination.lat]] },
      },
    ],
    totalDistanceKm: Number(res.distanceKm || directKm),
    totalDurationMin: Number(res.durationMin || (directKm / 40) * 60),
    totalCostInr: (res.distanceKm || directKm) * ROAD_COST_PER_KM,
    totalCo2eKg: MODE_CO2_PER_KM.ROAD * Number(res.distanceKm || directKm),
    riskScore: riskFromEngine(res),
    modesUsed: ['ROAD'],
    modalProfile: 'ROAD',
    feasible: maxCost === null || (res.distanceKm || directKm) * ROAD_COST_PER_KM <= maxCost,
    reason: res.source === 'direct' ? 'no road-network access; great-circle fallback' : null,
  };
  return { options: [option], fallback: true, directKm };
}

// ---------------------------------------------------------------- db-fed
async function planRoute(request) {
  const {
    origin,
    destination,
    modes,
    weights,
    load,
    cargoType,
    avoidBlocked,
    maxCost,
  } = request;

  const nodes = await model.loadRoutingNodes(load);
  const edges = await model.loadRoutingEdges(load);

  // Select candidate nodes: nearest spread around origin and destination.
  const byOrigin = [...nodes].sort((a, b) => pointDistKm(origin, a) - pointDistKm(origin, b));
  const byDest = [...nodes].sort((a, b) => pointDistKm(destination, a) - pointDistKm(destination, b));
  const half = Math.max(1, Math.floor(DEFAULT_MAX_CANDIDATES / 2));
  const candidates = [];
  const seenIds = new Set();
  for (const n of [...byOrigin.slice(0, half), ...byDest.slice(0, half)]) {
    if (!seenIds.has(n.id)) {
      seenIds.add(n.id);
      candidates.push({ id: String(n.id), lat: Number(n.lat), lng: Number(n.lng), name: n.name, capacity: Number(n.capacity) });
    }
  }

  const candidateId = (id) => String(id);
  const candidateIds = new Set(candidates.map((c) => c.id));
  const graphEdges = edges
    .filter((e) => candidateIds.has(candidateId(e.fromNodeId)) && candidateIds.has(candidateId(e.toNodeId)))
    .map((e) => ({
      from: candidateId(e.fromNodeId),
      to: candidateId(e.toNodeId),
      mode: e.mode,
      distKm: Number(e.distanceKm),
      timeMin: Number(e.estimatedTimeMin),
      costInr: Number(e.estimatedCostInr),
      risk: Number(e.riskScore),
      capacity: Number(e.capacity),
      accessibilityStatus: e.accessibilityStatus,
    }));

  const result = await planOnGraph({
    nodes: candidates,
    edges: graphEdges,
    origin,
    destination,
    roadAccess: (a, b) =>
      routingService.optimizeRoute({ start: [a.lng, a.lat], end: [b.lng, b.lat] }),
    allowModes: modes,
    weights,
    load,
    avoidBlocked,
    maxCost,
  });

  return {
    ...result,
    origin: { lat: Number(origin.lat), lng: Number(origin.lng), name: origin.name || null },
    destination: { lat: Number(destination.lat), lng: Number(destination.lng), name: destination.name || null },
    cargoType,
    modes,
    load,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = {
  MODES,
  DEFAULT_WEIGHTS,
  ROAD_COST_PER_KM,
  EPS_KM,
  haversineKm,
  pointDistKm,
  normalizeWeights,
  edgeWeight,
  riskFromEngine,
  dijkstraOnGraph,
  planOnGraph,
  planRoute,
};