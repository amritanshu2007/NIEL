'use strict';

const pool = require('../config/db');

const OPEN_SPEED_KMH = 40;
const RISKY_SPEED_KMH = 20;
const RISKY_PENALTY = 4;
const MAX_SNAP_KM = 80;
const CORRIDOR_KM = 10;

const round1 = (x) => Math.round(x * 10) / 10;

const haversineKm = ([lng1, lat1], [lng2, lat2]) => {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

const loadRoads = async () => {
  const { rows } = await pool.query(
    `SELECT id, road_name, status,
            ST_AsGeoJSON(geom) AS geojson
       FROM roads`
  );
  return rows
    .filter((r) => r.geojson)
    .map((r) => {
      const g = JSON.parse(r.geojson);
      return { id: r.id, roadName: r.road_name, status: r.status, coords: g.coordinates };
    });
};

const findCorridorObstacles = async (start, end) => {
  const { rows } = await pool.query(
    `SELECT id, road_name, status
       FROM roads
      WHERE ST_DWithin(
              geom,
              ST_SetSRID(
                ST_MakeLine(
                  ST_MakePoint($1, $2),
                  ST_MakePoint($3, $4)
                ),
                4326
              ),
              $5 / 111.32
            )`,
    [start.lng, start.lat, end.lng, end.lat, CORRIDOR_KM]
  );
  return rows;
};

const buildGraph = (roads) => {
  const nodes = new Map();
  const adj = new Map();

  const nodeKey = ([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`;

  for (const road of roads) {
    if (road.status === 'BLOCKED') continue;
    const speed = road.status === 'RISKY' ? RISKY_SPEED_KMH : OPEN_SPEED_KMH;
    const penalty = road.status === 'RISKY' ? RISKY_PENALTY : 1;
    const coords = road.coords;

    for (let i = 0; i + 1 < coords.length; i += 1) {
      const a = coords[i];
      const b = coords[i + 1];
      const ka = nodeKey(a);
      const kb = nodeKey(b);

      if (!nodes.has(ka)) nodes.set(ka, { lng: a[0], lat: a[1] });
      if (!nodes.has(kb)) nodes.set(kb, { lng: b[0], lat: b[1] });

      const km = haversineKm(a, b);
      const cost = km * penalty;
      if (!adj.has(ka)) adj.set(ka, []);
      if (!adj.has(kb)) adj.set(kb, []);
      adj.get(ka).push({ to: kb, km, speed, cost, roadName: road.roadName });
      adj.get(kb).push({ to: ka, km, speed, cost, roadName: road.roadName });
    }
  }

  return { nodes, adj };
};

const nearestNode = (nodes, { lat, lng }) => {
  let bestKey = null;
  let bestKm = Infinity;
  for (const [key, node] of nodes) {
    const d = haversineKm([lng, lat], [node.lng, node.lat]);
    if (d < bestKm) {
      bestKm = d;
      bestKey = key;
    }
  }
  return bestKm <= MAX_SNAP_KM ? { key: bestKey, snapKm: bestKm } : null;
};

const dijkstra = (adj, startKey, endKey) => {
  const dist = new Map();
  const prev = new Map();
  const visited = new Set();
  const pq = [{ key: startKey, cost: 0 }];
  dist.set(startKey, 0);

  while (pq.length) {
    pq.sort((x, y) => x.cost - y.cost);
    const { key } = pq.shift();
    if (key === endKey) break;
    if (visited.has(key)) continue;
    visited.add(key);

    for (const e of adj.get(key) || []) {
      const nd = dist.get(key) + e.cost;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, { from: key, km: e.km, speed: e.speed, roadName: e.roadName });
        pq.push({ key: e.to, cost: nd });
      }
    }
  }

  if (!dist.has(endKey)) return null;

  const path = [];
  let cur = endKey;
  while (cur !== startKey) {
    path.unshift(cur);
    cur = prev.get(cur).from;
  }
  path.unshift(startKey);

  let km = 0;
  let min = 0;
  for (let i = 0; i + 1 < path.length; i += 1) {
    const e = prev.get(path[i + 1]);
    km += e.km;
    min += (e.km / e.speed) * 60;
  }
  return { path, km: round1(km), min: round1(min) };
};

const optimizeRoute = async ({ start, end }) => {
  const roads = await loadRoads();
  const corridorObstacles = await findCorridorObstacles(start, end);

  const alerts = corridorObstacles
    .filter((r) => r.status !== 'OPEN')
    .map((r) => ({
      type: r.status === 'BLOCKED' ? 'blocked' : 'risky',
      roadName: r.road_name,
    }));

  const { nodes, adj } = buildGraph(roads);
  const snapStart = nearestNode(nodes, start);
  const snapEnd = nearestNode(nodes, end);

  let geometry;
  let distanceKm;
  let durationMin;
  let source = 'road-network';

  if (snapStart && snapEnd && snapStart.key !== snapEnd.key) {
    const result = dijkstra(adj, snapStart.key, snapEnd.key);
    if (result) {
      const coords = result.path.map((k) => {
        const n = nodes.get(k);
        return [round1(n.lng), round1(n.lat)];
      });
      geometry = { type: 'LineString', coordinates: coords };
      distanceKm = result.km;
      durationMin = result.min;
    }
  }

  if (!geometry) {
    geometry = {
      type: 'LineString',
      coordinates: [[start.lng, start.lat], [end.lng, end.lat]],
    };
    distanceKm = haversineKm([start.lng, start.lat], [end.lng, end.lat]);
    durationMin = (distanceKm / OPEN_SPEED_KMH) * 60;
    source = 'direct';
  }

  return {
    geometry,
    source,
    distanceKm: round1(distanceKm),
    durationMin: round1(durationMin),
    alerts,
    obstacles: corridorObstacles.map((r) => ({ roadName: r.road_name, status: r.status })),
  };
};

module.exports = { optimizeRoute, haversineKm, OPEN_SPEED_KMH, RISKY_SPEED_KMH };