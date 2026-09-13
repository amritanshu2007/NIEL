import type { Map as MapLibreMap } from 'maplibre-gl';
import { addGeoJSONLayer, updateGeoJSONLayer, toggleMapLayer } from '../geoJsonManager';
import type { RouteOption } from '../../services/apiTypes';

export const ACTIVE_ROUTE_SOURCE_ID = 'northeast-active-route-source';
export const ACTIVE_ROUTE_LAYER_ID = 'northeast-active-route-glow';
export const ACTIVE_ROUTE_CORE_LAYER_ID = 'northeast-active-route-core';

export function setupActiveRouteLayer(map: MapLibreMap): void {
  const initialData: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: []
  };

  addGeoJSONLayer(map, ACTIVE_ROUTE_SOURCE_ID, initialData, [
    {
      id: ACTIVE_ROUTE_LAYER_ID,
      type: 'line',
      source: ACTIVE_ROUTE_SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#06b6d4',
        'line-width': 9,
        'line-opacity': 0.65,
        'line-blur': 4
      }
    },
    {
      id: ACTIVE_ROUTE_CORE_LAYER_ID,
      type: 'line',
      source: ACTIVE_ROUTE_SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#ffffff',
        'line-width': 3.5,
        'line-dasharray': [1.2, 1.2]
      }
    }
  ]);
}

export function setActiveRoute(map: MapLibreMap, route: RouteOption | null): void {
  if (!map) return;
  const data: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: route ? [route.geoJson] : []
  };
  updateGeoJSONLayer(map, ACTIVE_ROUTE_SOURCE_ID, data);
}

export function toggleActiveRouteLayer(map: MapLibreMap, visible: boolean): void {
  toggleMapLayer(map, [ACTIVE_ROUTE_LAYER_ID, ACTIVE_ROUTE_CORE_LAYER_ID], visible);
}
