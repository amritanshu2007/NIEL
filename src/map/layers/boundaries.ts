import type { Map as MapLibreMap } from 'maplibre-gl';
import { addGeoJSONLayer, toggleMapLayer } from '../geoJsonManager';

export const BOUNDARIES_SOURCE_ID = 'northeast-boundaries-source';
export const BOUNDARIES_LINE_LAYER_ID = 'northeast-boundaries-line';
export const BOUNDARIES_LABEL_LAYER_ID = 'northeast-boundaries-labels';

export const NORTHEAST_BOUNDARIES_GEOJSON: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'ASSAM', type: 'state', code: 'AS' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [89.8, 26.0], [90.5, 26.3], [91.5, 26.2], [92.5, 26.7],
          [93.5, 26.6], [94.5, 27.2], [95.4, 27.8], [95.8, 27.5],
          [95.2, 26.9], [93.9, 26.2], [93.2, 25.8], [92.8, 24.8],
          [92.5, 24.5], [92.4, 25.0], [91.8, 25.8], [90.8, 25.8],
          [89.8, 26.0]
        ]]
      }
    },
    {
      type: 'Feature',
      properties: { name: 'ARUNACHAL PRADESH', type: 'state', code: 'AR' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [91.6, 27.3], [92.0, 27.8], [92.5, 28.3], [93.5, 28.7],
          [94.5, 29.0], [95.5, 29.4], [96.5, 28.5], [97.3, 28.2],
          [96.8, 27.5], [95.8, 27.5], [94.5, 27.2], [93.5, 26.6],
          [92.5, 26.7], [91.6, 27.3]
        ]]
      }
    },
    {
      type: 'Feature',
      properties: { name: 'MEGHALAYA', type: 'state', code: 'ML' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [89.8, 25.2], [90.5, 25.8], [91.8, 25.8], [92.4, 25.4],
          [92.8, 25.1], [92.3, 25.0], [91.5, 25.1], [90.5, 25.1],
          [89.8, 25.2]
        ]]
      }
    },
    {
      type: 'Feature',
      properties: { name: 'NAGALAND', type: 'state', code: 'NL' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [93.7, 25.6], [94.0, 26.2], [94.8, 26.9], [95.3, 27.0],
          [95.2, 26.3], [94.5, 25.7], [94.2, 25.5], [93.7, 25.6]
        ]]
      }
    },
    {
      type: 'Feature',
      properties: { name: 'MANIPUR', type: 'state', code: 'MN' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [93.1, 24.2], [93.4, 25.4], [94.2, 25.5], [94.6, 25.2],
          [94.5, 24.3], [93.8, 23.9], [93.1, 24.2]
        ]]
      }
    },
    {
      type: 'Feature',
      properties: { name: 'MIZORAM', type: 'state', code: 'MZ' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [92.3, 22.0], [92.3, 24.2], [93.1, 24.2], [93.3, 23.5],
          [93.0, 22.3], [92.3, 22.0]
        ]]
      }
    },
    {
      type: 'Feature',
      properties: { name: 'TRIPURA', type: 'state', code: 'TR' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [91.1, 23.0], [91.2, 24.4], [92.3, 24.3], [92.1, 23.3],
          [91.8, 23.0], [91.1, 23.0]
        ]]
      }
    },
    {
      type: 'Feature',
      properties: { name: 'SIKKIM', type: 'state', code: 'SK' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [88.0, 27.1], [88.1, 28.0], [88.9, 28.1], [88.8, 27.2],
          [88.3, 27.1], [88.0, 27.1]
        ]]
      }
    }
  ]
};

export function setupBoundariesLayer(map: MapLibreMap): void {
  addGeoJSONLayer(map, BOUNDARIES_SOURCE_ID, NORTHEAST_BOUNDARIES_GEOJSON, [
    {
      id: BOUNDARIES_LINE_LAYER_ID,
      type: 'line',
      source: BOUNDARIES_SOURCE_ID,
      paint: {
        'line-color': '#06b6d4',
        'line-width': 1.5,
        'line-opacity': 0.6,
        'line-dasharray': [3, 2]
      }
    }
  ]);
}

export function toggleBoundariesLayer(map: MapLibreMap, visible: boolean): void {
  toggleMapLayer(map, [BOUNDARIES_LINE_LAYER_ID], visible);
}
