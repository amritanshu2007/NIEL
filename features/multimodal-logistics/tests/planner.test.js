'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const service = require('../backend/service');

// Realistic road-engine stub: straight-line distance with a constant speed,
// an obstacle report (default none), and source 'road-network'.
function roadStub(opts = {}) {
  const { obstacles = [], source = 'road-network' } = opts;
  return async (a, b) => {
    const d = service.haversineKm([a.lng, a.lat], [b.lng, b.lat]);
    return {
      geometry: { type: 'LineString', coordinates: [[a.lng, a.lat], [b.lng, b.lat]] },
      source,
      distanceKm: d,
      durationMin: (d / 40) * 60,
      obstacles,
      alerts: obstacles.filter((o) => o.status !== 'OPEN'),
    };
  };
}

// Corridor that reports a BLOCKED obstacle for any leg longer than 1 km
// (models the landslide segment between the two hubs).
function corridorStub() {
  return async (a, b) => {
    const d = service.haversineKm([a.lng, a.lat], [b.lng, b.lat]);
    const obstacles = d > 1 ? [{ roadName: 'corridor', status: 'BLOCKED' }] : [];
    return {
      geometry: { type: 'LineString', coordinates: [[a.lng, a.lat], [b.lng, b.lat]] },
      source: 'road-network',
      distanceKm: d,
      durationMin: (d / 40) * 60,
      obstacles,
      alerts: obstacles,
    };
  };
}

const NODES = [
  { id: 'n1', name: 'Hub A', lat: 0, lng: 0, capacity: 1000 },
  { id: 'n2', name: 'Drone Relay', lat: 1, lng: 0, capacity: 100 },
  { id: 'n3', name: 'Hub B', lat: 2, lng: 0, capacity: 1000 },
  { id: 'n4', name: 'River Port', lat: 1, lng: 1, capacity: 1000 },
  { id: 'n5', name: 'Helipad', lat: 1, lng: 0.5, capacity: 300 },
];

const EDGES = [
  { from: 'n1', to: 'n3', mode: 'ROAD', distKm: 2.0, timeMin: 30, costInr: 150, capacity: 500, accessibilityStatus: 'OPEN', risk: 0.1 },
  { from: 'n1', to: 'n2', mode: 'DRONE', distKm: 1.0, timeMin: 5, costInr: 40, capacity: 60, accessibilityStatus: 'OPEN', risk: 0.05 },
  { from: 'n2', to: 'n3', mode: 'DRONE', distKm: 1.0, timeMin: 5, costInr: 40, capacity: 60, accessibilityStatus: 'OPEN', risk: 0.05 },
  { from: 'n1', to: 'n4', mode: 'RIVER', distKm: 1.0, timeMin: 8, costInr: 20, capacity: 1000, accessibilityStatus: 'OPEN', risk: 0.05 },
  { from: 'n4', to: 'n3', mode: 'RIVER', distKm: 1.41, timeMin: 12, costInr: 30, capacity: 1000, accessibilityStatus: 'OPEN', risk: 0.08 },
  { from: 'n1', to: 'n5', mode: 'HELICOPTER', distKm: 0.5, timeMin: 3, costInr: 200, capacity: 300, accessibilityStatus: 'OPEN', risk: 0.2 },
  { from: 'n5', to: 'n3', mode: 'HELICOPTER', distKm: 0.5, timeMin: 3, costInr: 200, capacity: 300, accessibilityStatus: 'OPEN', risk: 0.2 },
];

const ORIGIN = { lat: 0, lng: 0 };
const DESTINATION = { lat: 2, lng: 0 };

async function run(opts = {}) {
  return service.planOnGraph({
    nodes: opts.nodes === undefined ? NODES : opts.nodes,
    edges: opts.edges === undefined ? EDGES : opts.edges,
    origin: ORIGIN,
    destination: DESTINATION,
    roadAccess: opts.roadAccess || roadStub(),
    allowModes: opts.modes || ['ROAD', 'DRONE', 'HELICOPTER', 'RIVER'],
    weights: opts.weights || null,
    load: opts.load || 1,
    avoidBlocked: opts.avoidBlocked !== false,
    maxCost: opts.maxCost || null,
    snapKm: 0.5, // tight access snap: only the nearest node per endpoint gets a road leg
  });
}

test('road-only planning uses the ROAD connector (open corridor)', async () => {
  const res = await run({ modes: ['ROAD'] });
  const best = res.options[0];
  assert.equal(res.fallback, false);
  assert.deepEqual(best.modesUsed, ['ROAD']);
  const connector = best.legs.find((l) => l.source === 'transport-graph');
  assert.ok(connector, 'has a transport-graph ROAD leg');
  assert.equal(connector.distanceKm, 2.0);
});

test('blocked ROAD connector is avoided; drone chain chosen for fastest', async () => {
  const edges = EDGES.map((e) =>
    e.from === 'n1' && e.to === 'n3' ? { ...e, accessibilityStatus: 'BLOCKED' } : e
  );
  const res = await run({ modes: ['ROAD', 'DRONE'], edges });
  const best = res.options[0];
  assert.ok(best.modesUsed.includes('DRONE'));
  assert.equal(best.legs.filter((l) => l.mode === 'DRONE').length, 2);
  assert.equal(best.legs.find((l) => l.source === 'transport-graph' && l.mode === 'ROAD'), undefined);
});

test('road + river: cheapest routing selects the river ports', async () => {
  const edges = EDGES.map((e) =>
    e.from === 'n1' && e.to === 'n3' ? { ...e, accessibilityStatus: 'BLOCKED' } : e
  );
  const res = await run({ modes: ['ROAD', 'RIVER'], edges, weights: { cost: 1 } });
  const best = res.options[0];
  assert.ok(best.modesUsed.includes('RIVER'));
});

test('road + helicopter: fastest routing selects helicopter when available', async () => {
  const edges = EDGES.map((e) =>
    e.from === 'n1' && e.to === 'n3' ? { ...e, accessibilityStatus: 'BLOCKED' } : e
  );
  const res = await run({ modes: ['ROAD', 'HELICOPTER'], edges, weights: { time: 1 } });
  const best = res.options[0];
  assert.ok(best.modesUsed.includes('HELICOPTER'));
  assert.ok(best.totalDurationMin <= 6.1, `two heli hops of 3min each (got ${best.totalDurationMin})`);
});

test('avoidBlocked=false permits the blocked connector but with penalties', async () => {
  const edges = EDGES.map((e) =>
    e.from === 'n1' && e.to === 'n3' ? { ...e, accessibilityStatus: 'BLOCKED' } : e
  );
  const res = await run({ modes: ['ROAD'], edges, avoidBlocked: false });
  const best = res.options[0];
  const connector = best.legs.find((l) => l.source === 'transport-graph' && l.mode === 'ROAD');
  assert.ok(connector, 'blocked connector usable on explicit request');
  assert.equal(connector.riskScore, 1.0, 'blocked connector carries maximum risk');
  assert.equal(connector.durationMin, 30 * 2.5);
  assert.equal(connector.costInr, 150 * 3);
});

test('capacity constraint: heavy load excludes low-capacity drone edges', async () => {
  const res = await run({ load: 70, modes: ['ROAD', 'DRONE', 'HELICOPTER', 'RIVER'] });
  const best = res.options[0];
  assert.ok(!best.modesUsed.includes('DRONE'), 'drone capacity 60 < load 70');
  assert.ok(best.modesUsed.includes('HELICOPTER'), 'highest-capacity fastest mode chosen');
});

test('load above every capacity: no candidates -> honest fallback to road engine', async () => {
  const res = await run({ load: 1500, modes: ['ROAD', 'DRONE', 'RIVER'] });
  assert.equal(res.fallback, true);
  assert.equal(res.options[0].legs[0].source, 'road-network');
  assert.deepEqual(res.options[0].modesUsed, ['ROAD']);
});

test('empty graph + degraded engine: great-circle fallback (source direct)', async () => {
  const res = await run({
    nodes: [],
    edges: [],
    roadAccess: roadStub({ source: 'direct' }),
    modes: ['DRONE'],
  });
  assert.equal(res.fallback, true);
  assert.equal(res.options[0].legs[0].source, 'direct');
  assert.equal(res.options[0].reason, 'no road-network access; great-circle fallback');
});

test('blocked corridor in engine report forces fallback through engine when graph pruned', async () => {
  const edges = EDGES.map((e) =>
    e.from === 'n1' && e.to === 'n3' ? { ...e, accessibilityStatus: 'BLOCKED' } : e
  );
  const res = await run({ modes: ['ROAD', 'DRONE'], edges, roadAccess: corridorStub() });
  // All access legs crossing the >1km corridor are dropped, the drone connectors
  // are the only transport-graph option left -> drone chain is valid.
  const best = res.options[0];
  assert.ok(best.modesUsed.includes('DRONE'));
});

test('corridor fully blocked engine-side and overlay lacks alternatives -> fallback, risk 0.8', async () => {
  const edges = EDGES.map((e) =>
    e.from === 'n1' && e.to === 'n3' ? { ...e, accessibilityStatus: 'BLOCKED' } : e
  );
  const res = await run({
    modes: ['ROAD'],
    edges,
    roadAccess: corridorStub(),
  });
  assert.equal(res.fallback, true);
  assert.equal(res.options[0].legs[0].source, 'road-network');
  assert.equal(res.options[0].riskScore, 0.8);
});

test('riskFromEngine derives risk from obstacle statuses', () => {
  assert.equal(service.riskFromEngine({ obstacles: [{ status: 'BLOCKED' }], alerts: [] }), 0.8);
  assert.equal(service.riskFromEngine({ obstacles: [{ status: 'RISKY' }], alerts: [] }), 0.4);
  assert.equal(service.riskFromEngine({ obstacles: [], alerts: [] }), 0.05);
});

test('normalizeWeights: null => fastest; object => zero-filled', () => {
  const def = service.normalizeWeights(null);
  assert.deepEqual(def, { time: 1, distance: 0, risk: 0, cost: 0 });
  const custom = service.normalizeWeights({ cost: 3 });
  assert.deepEqual(custom, { time: 0, distance: 0, risk: 0, cost: 3 });
});

test('dijkstraOnGraph returns shortest weighted path and leg edges', () => {
  const adj = new Map();
  adj.set('O', [
    { to: 'A', edge: { distKm: 1, timeMin: 10, costInr: 5, risk: 0 } },
    { to: 'B', edge: { distKm: 1, timeMin: 1, costInr: 100, risk: 0 } },
  ]);
  adj.set('A', [{ to: 'D', edge: { distKm: 1, timeMin: 10, costInr: 5, risk: 0 } }]);
  adj.set('B', [{ to: 'D', edge: { distKm: 1, timeMin: 1, costInr: 100, risk: 0 } }]);
  const fastest = service.dijkstraOnGraph(adj, 'O', 'D', service.normalizeWeights({ time: 1 }));
  assert.deepEqual(fastest.path, ['O', 'B', 'D']);
  const cheapest = service.dijkstraOnGraph(adj, 'O', 'D', service.normalizeWeights({ cost: 1 }));
  assert.deepEqual(cheapest.path, ['O', 'A', 'D']);
});