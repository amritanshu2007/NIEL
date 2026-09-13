import type { Map as MapLibreMap } from 'maplibre-gl';
import { addGeoJSONLayer, updateGeoJSONLayer, toggleMapLayer } from '../geoJsonManager';
import type { Vehicle } from '../../services/apiTypes';
import { INITIAL_VEHICLES_DATA } from '../../services/apiDefaults';

export const VEHICLES_SOURCE_ID = 'northeast-vehicles-source';
export const VEHICLES_PULSE_LAYER_ID = 'northeast-vehicles-pulse';
export const VEHICLES_POINT_LAYER_ID = 'northeast-vehicles-point';

export function getVehiclesGeoJSON(vehicles: Vehicle[] = INITIAL_VEHICLES_DATA): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: vehicles.map((v) => ({
      type: 'Feature',
      properties: {
        id: v.id,
        vehicleNumber: v.vehicleNumber,
        driverName: v.driverName,
        cargoType: v.cargoType,
        deliveryStatus: v.deliveryStatus,
        speedKmph: v.speedKmph,
        headingDeg: v.headingDeg,
        color:
          v.deliveryStatus === 'DELAYED'
            ? '#f59e0b'
            : v.deliveryStatus === 'DELIVERED'
            ? '#10b981'
            : '#06b6d4'
      },
      geometry: {
        type: 'Point',
        coordinates: v.coordinates
      }
    }))
  };
}

export function setupVehiclesLayer(map: MapLibreMap, initialVehicles?: Vehicle[]): void {
  const data = getVehiclesGeoJSON(initialVehicles);
  addGeoJSONLayer(map, VEHICLES_SOURCE_ID, data, [
    // Pulse ring
    {
      id: VEHICLES_PULSE_LAYER_ID,
      type: 'circle',
      source: VEHICLES_SOURCE_ID,
      paint: {
        'circle-radius': 14,
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.35,
        'circle-blur': 0.4
      }
    },
    // Vehicle node
    {
      id: VEHICLES_POINT_LAYER_ID,
      type: 'circle',
      source: VEHICLES_SOURCE_ID,
      paint: {
        'circle-radius': 7.5,
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff'
      }
    }
  ]);
}

export function updateVehiclesLayer(map: MapLibreMap, vehicles: Vehicle[]): void {
  updateGeoJSONLayer(map, VEHICLES_SOURCE_ID, getVehiclesGeoJSON(vehicles));
}

export function toggleVehiclesLayer(map: MapLibreMap, visible: boolean): void {
  toggleMapLayer(map, [VEHICLES_PULSE_LAYER_ID, VEHICLES_POINT_LAYER_ID], visible);
}
