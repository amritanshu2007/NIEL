import type { Map as MapLibreMap } from 'maplibre-gl';
import { addGeoJSONLayer, toggleMapLayer } from '../geoJsonManager';

export const SUPPLY_SOURCE_ID = 'northeast-supply-centers-source';
export const SUPPLY_POINT_LAYER_ID = 'northeast-supply-centers-point';

export interface SupplyCenter {
  id: string;
  name: string;
  location: string;
  state: string;
  coordinates: [number, number];
  capacityStatus: 'HIGH' | 'MEDIUM' | 'NEAR_CAPACITY';
  trucksAvailable: number;
  fuelReservesKl: number;
  isOnline: boolean;
}

export const SUPPLY_CENTERS_DATA: SupplyCenter[] = [
  {
    id: 'sc-01',
    name: 'North Guwahati Central Logistics Depot',
    location: 'Amingaon Inland Container Depot, Guwahati',
    state: 'Assam',
    coordinates: [91.6850, 26.2100],
    capacityStatus: 'HIGH',
    trucksAvailable: 142,
    fuelReservesKl: 8500,
    isOnline: true
  },
  {
    id: 'sc-02',
    name: 'Dimapur Transshipment Rail Terminal',
    location: 'Dimapur Rake Point',
    state: 'Nagaland',
    coordinates: [93.7380, 25.9120],
    capacityStatus: 'HIGH',
    trucksAvailable: 68,
    fuelReservesKl: 4200,
    isOnline: true
  },
  {
    id: 'sc-03',
    name: 'Silchar Southern Logistics Staging Ground',
    location: 'Cachar Freight Complex, Silchar',
    state: 'Assam',
    coordinates: [92.7850, 24.8150],
    capacityStatus: 'MEDIUM',
    trucksAvailable: 54,
    fuelReservesKl: 3100,
    isOnline: true
  },
  {
    id: 'sc-04',
    name: 'Imphal Essential Supply Base',
    location: 'Mantripukhri Warehousing Zone, Imphal',
    state: 'Manipur',
    coordinates: [93.9480, 24.8450],
    capacityStatus: 'NEAR_CAPACITY',
    trucksAvailable: 22,
    fuelReservesKl: 1200,
    isOnline: true
  },
  {
    id: 'sc-05',
    name: 'Banderdewa Arunachal Border Warehouse',
    location: 'Banderdewa Checkpost',
    state: 'Arunachal Pradesh',
    coordinates: [93.4250, 26.9850],
    capacityStatus: 'MEDIUM',
    trucksAvailable: 31,
    fuelReservesKl: 1800,
    isOnline: true
  }
];

export const SUPPLY_CENTERS_GEOJSON: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: SUPPLY_CENTERS_DATA.map((sc) => ({
    type: 'Feature',
    properties: {
      id: sc.id,
      name: sc.name,
      location: sc.location,
      state: sc.state,
      trucks: sc.trucksAvailable
    },
    geometry: {
      type: 'Point',
      coordinates: sc.coordinates
    }
  }))
};

export function setupSupplyCentersLayer(map: MapLibreMap): void {
  addGeoJSONLayer(map, SUPPLY_SOURCE_ID, SUPPLY_CENTERS_GEOJSON, [
    {
      id: SUPPLY_POINT_LAYER_ID,
      type: 'circle',
      source: SUPPLY_SOURCE_ID,
      paint: {
        'circle-radius': 6,
        'circle-color': '#10b981',
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 0.9
      }
    }
  ]);
}

export function toggleSupplyCentersLayer(map: MapLibreMap, visible: boolean): void {
  toggleMapLayer(map, [SUPPLY_POINT_LAYER_ID], visible);
}
