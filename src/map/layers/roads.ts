import type { Map as MapLibreMap } from 'maplibre-gl';
import { addGeoJSONLayer, updateGeoJSONLayer, toggleMapLayer } from '../geoJsonManager';
import type { RoadCorridor } from '../../services/apiTypes';
import { INITIAL_ROAD_CORRIDORS } from '../../services/apiDefaults';

export const ROADS_SOURCE_ID = 'northeast-roads-source';
export const ROADS_GLOW_LAYER_ID = 'northeast-roads-glow';
export const ROADS_CORE_LAYER_ID = 'northeast-roads-core';

export function getRoadsGeoJSON(roads: RoadCorridor[] = INITIAL_ROAD_CORRIDORS): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: roads.map((r) => ({
      type: 'Feature',
      properties: {
        id: r.id,
        name: r.name,
        highwayNumber: r.highwayNumber,
        status: r.status,
        color: r.status === 'BLOCKED' ? '#ef4444' : r.status === 'RISKY' ? '#f59e0b' : '#10b981',
        from: r.from,
        to: r.to,
        distanceKm: r.distanceKm,
        speed: r.averageSpeedKmph
      },
      geometry: {
        type: 'LineString',
        coordinates: r.coordinates
      }
    }))
  };
}

export function setupRoadsLayer(map: MapLibreMap, initialRoads?: RoadCorridor[]): void {
  const data = getRoadsGeoJSON(initialRoads);
  addGeoJSONLayer(map, ROADS_SOURCE_ID, data, [
    // Outer Glow / Hazard Blur Line
    {
      id: ROADS_GLOW_LAYER_ID,
      type: 'line',
      source: ROADS_SOURCE_ID,
      layout: {
        'line-cap': 'round',
        'line-join': 'round'
      },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 7,
        'line-opacity': 0.45,
        'line-blur': 4
      }
    },
    // Crisp Core Line
    {
      id: ROADS_CORE_LAYER_ID,
      type: 'line',
      source: ROADS_SOURCE_ID,
      layout: {
        'line-cap': 'round',
        'line-join': 'round'
      },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 3,
        'line-opacity': 0.95
      }
    }
  ]);
}

export function updateRoadsLayer(map: MapLibreMap, roads: RoadCorridor[]): void {
  updateGeoJSONLayer(map, ROADS_SOURCE_ID, getRoadsGeoJSON(roads));
}

export function toggleRoadsLayer(map: MapLibreMap, visible: boolean): void {
  toggleMapLayer(map, [ROADS_GLOW_LAYER_ID, ROADS_CORE_LAYER_ID], visible);
}
