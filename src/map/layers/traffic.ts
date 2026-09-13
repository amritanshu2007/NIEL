import type { Map as MapLibreMap } from 'maplibre-gl';
import { addGeoJSONLayer, toggleMapLayer } from '../geoJsonManager';

export const TRAFFIC_SOURCE_ID = 'northeast-traffic-source';
export const TRAFFIC_LINE_LAYER_ID = 'northeast-traffic-line';

export const TRAFFIC_CONGESTION_GEOJSON: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    // Jalukbari roundabout traffic choke point (Guwahati)
    {
      type: 'Feature',
      properties: { level: 'HEAVY', speedKmph: 12, color: '#ef4444' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [91.6600, 26.1500],
          [91.6850, 26.1550],
          [91.7050, 26.1600]
        ]
      }
    },
    // Dimapur - Chumukedima bypass bottleneck
    {
      type: 'Feature',
      properties: { level: 'MODERATE', speedKmph: 28, color: '#f59e0b' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [93.7500, 25.8800],
          [93.8500, 25.8200],
          [93.9500, 25.7800]
        ]
      }
    }
  ]
};

export function setupTrafficLayer(map: MapLibreMap): void {
  addGeoJSONLayer(map, TRAFFIC_SOURCE_ID, TRAFFIC_CONGESTION_GEOJSON, [
    {
      id: TRAFFIC_LINE_LAYER_ID,
      type: 'line',
      source: TRAFFIC_SOURCE_ID,
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 4,
        'line-opacity': 0.8,
        'line-dasharray': [1, 1]
      }
    }
  ]);
}

export function toggleTrafficLayer(map: MapLibreMap, visible: boolean): void {
  toggleMapLayer(map, [TRAFFIC_LINE_LAYER_ID], visible);
}
