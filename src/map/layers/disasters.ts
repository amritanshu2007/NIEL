import type { Map as MapLibreMap } from 'maplibre-gl';
import { addGeoJSONLayer, updateGeoJSONLayer, toggleMapLayer } from '../geoJsonManager';
import type { IncidentAlert } from '../../services/apiTypes';
import { INITIAL_INCIDENTS_DATA } from '../../services/apiDefaults';

export const DISASTERS_SOURCE_ID = 'northeast-disasters-source';
export const DISASTERS_CIRCLE_LAYER_ID = 'northeast-disasters-circle';
export const DISASTERS_PULSE_LAYER_ID = 'northeast-disasters-pulse';

export function getDisastersGeoJSON(incidents: IncidentAlert[] = INITIAL_INCIDENTS_DATA): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: incidents.map((inc) => ({
      type: 'Feature',
      properties: {
        id: inc.id,
        title: inc.title,
        locationName: inc.locationName,
        type: inc.type,
        severity: inc.severity,
        color: inc.severity === 'CRITICAL' ? '#ef4444' : inc.severity === 'WARNING' ? '#f59e0b' : '#38bdf8'
      },
      geometry: {
        type: 'Point',
        coordinates: inc.coordinates
      }
    }))
  };
}

export function setupDisastersLayer(map: MapLibreMap, initialIncidents?: IncidentAlert[]): void {
  const data = getDisastersGeoJSON(initialIncidents);
  addGeoJSONLayer(map, DISASTERS_SOURCE_ID, data, [
    // Pulsing outer halo
    {
      id: DISASTERS_PULSE_LAYER_ID,
      type: 'circle',
      source: DISASTERS_SOURCE_ID,
      paint: {
        'circle-radius': 16,
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.35,
        'circle-blur': 0.6
      }
    },
    // Core incident marker
    {
      id: DISASTERS_CIRCLE_LAYER_ID,
      type: 'circle',
      source: DISASTERS_SOURCE_ID,
      paint: {
        'circle-radius': 8,
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff'
      }
    }
  ]);
}

export function updateDisastersLayer(map: MapLibreMap, incidents: IncidentAlert[]): void {
  updateGeoJSONLayer(map, DISASTERS_SOURCE_ID, getDisastersGeoJSON(incidents));
}

export function toggleDisastersLayer(map: MapLibreMap, visible: boolean): void {
  toggleMapLayer(map, [DISASTERS_CIRCLE_LAYER_ID, DISASTERS_PULSE_LAYER_ID], visible);
}
