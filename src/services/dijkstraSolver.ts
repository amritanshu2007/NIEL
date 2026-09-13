import type { RoadCorridor, RouteOption, RouteSegment, OptimizeRouteRequest } from './apiTypes';

// Great-circle Haversine distance calculator in KM
function haversineDistanceKm(c1: [number, number], c2: [number, number]): number {
  const R = 6371; // Earth radius in km
  const dLat = ((c2[1] - c1[1]) * Math.PI) / 180;
  const dLon = ((c2[0] - c1[0]) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((c1[1] * Math.PI) / 180) *
      Math.cos((c2[1] * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

interface GraphEdge {
  toNode: string;
  corridor: RoadCorridor;
  weight: number;
}

/**
 * Dependency-free, graph-based Dijkstra routing engine over PostGIS road networks.
 * Avoids BLOCKED corridors, applies multiplier to RISKY paths, and computes great-circle fallback if disconnected.
 */
export function solveDijkstraRoute(
  roads: RoadCorridor[],
  req: OptimizeRouteRequest
): RouteOption {
  const avoidBlocked = req.avoidBlocked !== false;
  const riskyMultiplier = req.riskyPenaltyMultiplier || 2.5;

  // Build adjacency graph
  const graph: Map<string, GraphEdge[]> = new Map();

  for (const road of roads) {
    if (avoidBlocked && road.status === 'BLOCKED') {
      continue; // bypass blocked segment
    }

    let weight = road.distanceKm;
    if (road.status === 'RISKY') {
      weight *= riskyMultiplier;
    }

    const u = road.from.toLowerCase().trim();
    const v = road.to.toLowerCase().trim();

    if (!graph.has(u)) graph.set(u, []);
    if (!graph.has(v)) graph.set(v, []);

    graph.get(u)!.push({ toNode: v, corridor: road, weight });
    graph.get(v)!.push({ toNode: u, corridor: road, weight });
  }

  const start = req.origin.toLowerCase().trim();
  const end = req.destination.toLowerCase().trim();

  // Dijkstra search
  const distances: Map<string, number> = new Map();
  const previous: Map<string, { node: string; corridor: RoadCorridor }> = new Map();
  const visited: Set<string> = new Set();
  const unvisited: Set<string> = new Set(graph.keys());

  // Also include start/end in unvisited
  unvisited.add(start);
  unvisited.add(end);

  for (const node of unvisited) {
    distances.set(node, node === start ? 0 : Infinity);
  }

  while (unvisited.size > 0) {
    let current: string | null = null;
    let minDistance = Infinity;

    for (const node of unvisited) {
      const dist = distances.get(node) ?? Infinity;
      if (dist < minDistance) {
        minDistance = dist;
        current = node;
      }
    }

    if (!current || minDistance === Infinity || current === end) {
      break;
    }

    unvisited.delete(current);
    visited.add(current);

    const edges = graph.get(current) || [];
    for (const edge of edges) {
      if (visited.has(edge.toNode)) continue;

      const alt = (distances.get(current) ?? 0) + edge.weight;
      if (alt < (distances.get(edge.toNode) ?? Infinity)) {
        distances.set(edge.toNode, alt);
        previous.set(edge.toNode, { node: current, corridor: edge.corridor });
      }
    }
  }

  // Check if destination was reached
  if (previous.has(end) || start === end) {
    const segments: RouteSegment[] = [];
    let curr = end;
    let totalDistKm = 0;
    let totalMinutes = 0;
    const allCoordinates: [number, number][] = [];
    let hasRiskySegment = false;

    while (curr !== start && previous.has(curr)) {
      const prev = previous.get(curr)!;
      const corridor = prev.corridor;
      const speed = corridor.status === 'RISKY' ? 35 : (corridor.averageSpeedKmph || 55);
      const mins = Math.round((corridor.distanceKm / speed) * 60);

      segments.unshift({
        corridorId: corridor.id,
        corridorName: corridor.name,
        highwayNumber: corridor.highwayNumber,
        distanceKm: corridor.distanceKm,
        status: corridor.status,
        estimatedMinutes: mins,
        coordinates: corridor.coordinates
      });

      totalDistKm += corridor.distanceKm;
      totalMinutes += mins;
      if (corridor.status === 'RISKY') hasRiskySegment = true;

      // Unshift coordinates
      allCoordinates.unshift(...corridor.coordinates);
      curr = prev.node;
    }

    const durationHours = parseFloat((totalMinutes / 60).toFixed(1));

    return {
      id: `opt-route-${Date.now()}`,
      name: `${req.origin} → ${req.destination} (AI Dijkstra Optimal)`,
      distanceKm: Math.round(totalDistKm),
      durationHours: durationHours || 1.0,
      riskScore: hasRiskySegment ? 'MEDIUM' : 'LOW',
      statusDescription: hasRiskySegment
        ? 'Route calculated with cautionary speeds on risky segments, avoiding all blocked corridors.'
        : 'All segments confirmed OPEN and clear of critical blockages.',
      isGreatCircleFallback: false,
      segments: segments,
      geoJson: {
        type: 'Feature',
        properties: { name: `${req.origin} to ${req.destination}` },
        geometry: {
          type: 'LineString',
          coordinates: allCoordinates.length > 0 ? allCoordinates : [[91.7362, 26.1445], [91.8933, 25.5788]]
        }
      }
    };
  }

  // Fallback: Great Circle route if disconnected/partitioned
  const oCoords: [number, number] = req.originCoords || [91.7362, 26.1445];
  const dCoords: [number, number] = req.destinationCoords || [91.8594, 27.5861];
  const gcDistance = Math.round(haversineDistanceKm(oCoords, dCoords));

  // Generate intermediate interpolated great circle arc
  const arcCoords: [number, number][] = [];
  const steps = 8;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    arcCoords.push([
      oCoords[0] + (dCoords[0] - oCoords[0]) * f,
      oCoords[1] + (dCoords[1] - oCoords[1]) * f
    ]);
  }

  return {
    id: `gc-fallback-${Date.now()}`,
    name: `${req.origin} → ${req.destination} (Great-Circle Direct Fallback)`,
    distanceKm: Math.round(gcDistance * 1.3), // Road circuity factor
    durationHours: parseFloat(((gcDistance * 1.3) / 45).toFixed(1)),
    riskScore: 'HIGH',
    statusDescription: 'Primary road corridors disconnected due to severe blockages. Displaying tactical fallback trajectory.',
    isGreatCircleFallback: true,
    segments: [],
    geoJson: {
      type: 'Feature',
      properties: { name: 'Tactical Fallback Path' },
      geometry: {
        type: 'LineString',
        coordinates: arcCoords
      }
    }
  };
}
